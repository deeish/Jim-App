/**
 * Pure assembly logic for the crew summary — everything here is date math and
 * bucketing over rows the service prefetched, so it unit-tests without a DB.
 *
 * All "days" are the CALLER's local calendar: the client sends its today,
 * week-Monday and tz offset, and the service buckets log timestamps with that
 * offset before anything lands here.
 */

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const DAY_MS = 86_400_000;

/** UTC-anchored day math on YYYY-MM-DD strings — DST can never skew a date. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export function weekdayNameOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function mondayOfIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  // Monday-start week: Sunday belongs to the week that began 6 days earlier.
  const back = day === 0 ? 6 : day - 1;
  return addDaysIso(iso, -back);
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS,
  );
}

export interface MuscleTag {
  group: string;
  name: string;
}

export interface MemberSlotInput {
  weekNumber: number;
  dayOfWeek: string;
  title: string;
  hasExercises: boolean;
  muscles: MuscleTag[];
}

export interface MemberLogInput {
  dateIso: string;
  title: string;
  performedAtIso: string;
  muscles: MuscleTag[];
}

export interface MemberInput {
  userId: string;
  name: string | null;
  email: string | null;
  avatarId: string | null;
  /** Local date the member joined the crew — days before it can never count
   *  against the crew streak (a new member must not nuke it retroactively). */
  joinedIso: string;
  /** ISO Monday the member's active program anchors week 1 to; null = no plan. */
  anchorMondayIso: string | null;
  totalWeeks: number;
  slots: MemberSlotInput[];
  /** Newest first, bucketed to the caller's local days. */
  logs: MemberLogInput[];
  /** Server-persisted deliberate skips: these days read as REST here — they
   *  never violate the crew streak and never count as planned. */
  skippedDays: string[];
  prs: {
    dateIso: string;
    exerciseId: string;
    exerciseName: string;
    weight: number;
  }[];
}

export interface KudosInput {
  fromUserId: string;
  toUserId: string;
  eventRef: string;
  createdAtIso: string;
}

export type CrewDayState = 'trained' | 'scheduled' | 'missed' | 'rest';

export interface CrewSummaryArgs {
  meUserId: string;
  todayIso: string;
  weekMondayIso: string;
  crewCreatedIso: string;
  members: MemberInput[];
  kudos: KudosInput[];
}

/** The slot a member's plan schedules for a local date, or null (rest/off-program). */
export function scheduledSlotOn(
  member: Pick<MemberInput, 'anchorMondayIso' | 'totalWeeks' | 'slots'>,
  dateIso: string,
): MemberSlotInput | null {
  if (!member.anchorMondayIso) return null;
  const week =
    Math.floor(
      daysBetweenIso(member.anchorMondayIso, mondayOfIso(dateIso)) / 7,
    ) + 1;
  if (week < 1 || (member.totalWeeks > 0 && week > member.totalWeeks))
    return null;
  const weekday = weekdayNameOf(dateIso);
  const slot = member.slots.find(
    (s) => s.weekNumber === week && s.dayOfWeek === weekday && s.hasExercises,
  );
  return slot ?? null;
}

/** Consecutive ISO weeks with at least one session, counting back from this week.
 *  A quiet current week doesn't break the run mid-week — it just doesn't count yet. */
export function weekStreakOf(
  logDates: Set<string>,
  weekMondayIso: string,
): number {
  const weekHasLog = (monday: string): boolean => {
    for (let i = 0; i < 7; i++) {
      if (logDates.has(addDaysIso(monday, i))) return true;
    }
    return false;
  };
  let monday = weekMondayIso;
  let streak = 0;
  if (!weekHasLog(monday)) monday = addDaysIso(monday, -7);
  for (let i = 0; i < 520; i++) {
    if (!weekHasLog(monday)) break;
    streak++;
    monday = addDaysIso(monday, -7);
  }
  return streak;
}

/**
 * Days in a row nobody missed a scheduled workout. Rest days inside the run
 * are neutral and count; LEADING no-training days (nothing trained yet since
 * the last session) preserve the streak without inflating it; the run floors
 * at the crew's first actual training day, so a brand-new crew never starts
 * with a phantom multi-day streak. Today only joins once everyone scheduled
 * has trained. Client-only skips look like misses here — the strict reading
 * of an accountability streak, and a documented v0 caveat.
 */
export function crewStreakDaysOf(
  members: MemberInput[],
  trainedByUser: Map<string, Set<string>>,
  todayIso: string,
  crewCreatedIso: string,
): number {
  // A member only participates in the streak from the day they joined —
  // their pre-join misses are their own business — and a deliberately
  // SKIPPED day is a rest day, never a violation.
  const skippedByUser = new Map(
    members.map((m) => [m.userId, new Set(m.skippedDays)] as const),
  );
  const violated = (dateIso: string): boolean =>
    members.some(
      (m) =>
        dateIso >= m.joinedIso &&
        !skippedByUser.get(m.userId)?.has(dateIso) &&
        scheduledSlotOn(m, dateIso) !== null &&
        !trainedByUser.get(m.userId)?.has(dateIso),
    );
  const anyTrained = (dateIso: string): boolean =>
    members.some((m) => trainedByUser.get(m.userId)?.has(dateIso));

  let earliestLog: string | null = null;
  for (const dates of trainedByUser.values()) {
    for (const d of dates) {
      if (earliestLog === null || d < earliestLog) earliestLog = d;
    }
  }
  if (earliestLog === null) return 0;
  const floor = earliestLog > crewCreatedIso ? earliestLog : crewCreatedIso;

  const todayComplete = !violated(todayIso);
  let d = todayComplete ? todayIso : addDaysIso(todayIso, -1);
  let streak = 0;
  let leading = true;
  // Iteration bound is a runaway guard only — the floor terminates the loop,
  // and leading skip-days must never eat into a real year-long streak.
  for (let i = 0; i < 400; i++) {
    if (d < floor) break;
    if (violated(d)) break;
    if (leading && !anyTrained(d)) {
      d = addDaysIso(d, -1);
      continue;
    }
    leading = false;
    streak++;
    d = addDaysIso(d, -1);
  }
  return streak;
}

export interface CrewSummaryMemberDay {
  dateIso: string;
  state: CrewDayState;
  isToday: boolean;
  title: string | null;
  muscles: MuscleTag[];
  /**
   * The event a pound on THIS day lands on, or null when the day is not
   * poundable (nobody trained, or it is your own day).
   *
   * Normally `day:<iso>`, but a day that carried a personal record targets
   * that record's ref instead. A PR belongs to the day it happened on, so
   * the day tile and the row chip that shows off the same record must move
   * the same number — otherwise one workout has two counts again.
   */
  poundRef: string | null;
  /** Pounds on `poundRef`, and whether one of them is mine. */
  kudos: number;
  iPounded: boolean;
}

export interface CrewSummaryMember {
  userId: string;
  name: string | null;
  avatarId: string | null;
  isMe: boolean;
  todayState: 'trained' | 'scheduled' | 'rest';
  week: CrewSummaryMemberDay[];
  weekStreak: number;
  lastSession: {
    title: string;
    dateIso: string;
    performedAtIso: string;
  } | null;
  race: { done: number; planned: number };
  /** False when no plan slot lands in this week — a planless member's race
   *  is trivially "complete", so the gold done-state gates on this. */
  hasPlanThisWeek: boolean;
  kudosWeek: number;
  /** The event a card-level 💪 targets (the member's latest session), if any. */
  latestSessionRef: string | null;
  /** Pounds on that ONE session. `kudosWeek` is the member's whole-week total
   *  across every ref, so it must never label a chip that toggles a single
   *  ref — that mismatch is what made two chips for one workout disagree. */
  kudosLatest: number;
  iPoundedLatest: boolean;
}

export interface CrewSummaryMoment {
  ref: string;
  /** Null for crew-wide moments (streak milestones). */
  userId: string | null;
  name: string | null;
  avatarId: string | null;
  /** 'pr' and 'recap' belong to a member (poundable); 'streak' is crew-wide
   *  and display-only. */
  kind: 'pr' | 'recap' | 'streak';
  dateIso: string;
  kudos: number;
  iPounded: boolean;
  /** pr */
  exerciseName?: string;
  weight?: number;
  /** recap (userId/name/avatar = the week's winner) */
  winnerDone?: number;
  winnerPlanned?: number;
  crewDone?: number;
  crewPlanned?: number;
  /** streak */
  milestone?: number;
}

export interface CrewSummaryResult {
  streakDays: number;
  members: CrewSummaryMember[];
  moments: CrewSummaryMoment[];
}

export function assembleCrewSummary(args: CrewSummaryArgs): CrewSummaryResult {
  const { meUserId, todayIso, weekMondayIso, crewCreatedIso, members, kudos } =
    args;

  const trainedByUser = new Map<string, Set<string>>();
  for (const m of members) {
    trainedByUser.set(m.userId, new Set(m.logs.map((l) => l.dateIso)));
  }

  const kudosCountByRef = new Map<string, number>();
  const myPoundsByRef = new Set<string>();
  for (const k of kudos) {
    const key = `${k.toUserId}|${k.eventRef}`;
    kudosCountByRef.set(key, (kudosCountByRef.get(key) ?? 0) + 1);
    if (k.fromUserId === meUserId) myPoundsByRef.add(key);
  }
  const weekKudosByUser = new Map<string, number>();
  for (const k of kudos) {
    if (k.createdAtIso.slice(0, 10) >= weekMondayIso) {
      weekKudosByUser.set(
        k.toUserId,
        (weekKudosByUser.get(k.toUserId) ?? 0) + 1,
      );
    }
  }

  // A day that carried a record pounds the RECORD, not the day. Built once
  // here so the week tiles and the row chip cannot pick different refs for
  // the same workout. Two records on one day is possible; the first wins and
  // the second is reachable only from the row chip.
  const prRefByUserDate = new Map<string, string>();
  for (const m of members) {
    for (const pr of m.prs) {
      const key = `${m.userId}|${pr.dateIso}`;
      if (!prRefByUserDate.has(key)) {
        prRefByUserDate.set(key, `pr:${pr.dateIso}:${pr.exerciseId}`);
      }
    }
  }

  const summaryMembers: CrewSummaryMember[] = members.map((m) => {
    const trained = trainedByUser.get(m.userId)!;
    const skipped = new Set(m.skippedDays);
    const logByDate = new Map(m.logs.map((l) => [l.dateIso, l] as const));

    const week: CrewSummaryMemberDay[] = [];
    let planned = 0;
    let done = 0;
    let hasPlanThisWeek = false;
    for (let i = 0; i < 7; i++) {
      const dateIso = addDaysIso(weekMondayIso, i);
      // A skipped scheduled day is a rest day everywhere: quiet tile, not
      // planned, never missed — the skip itself stays the member's business.
      const slot = skipped.has(dateIso) ? null : scheduledSlotOn(m, dateIso);
      if (slot) hasPlanThisWeek = true;
      const log = logByDate.get(dateIso);
      let state: CrewDayState = 'rest';
      if (log) state = 'trained';
      else if (slot) state = dateIso < todayIso ? 'missed' : 'scheduled';
      if (log) done++;
      if (log || slot) planned++;
      // Only a day someone actually trained carries pounds at all. The COUNT
      // is filled in for everyone, your own days included — otherwise the
      // cheering is invisible to the one person it was aimed at, and with no
      // push notifications yet this tab is the only place it can land. The
      // REF is withheld on your own days, because the server rejects a
      // self-pound and an affordance that always fails is worse than none.
      const isMine = m.userId === meUserId;
      const dayRef = log
        ? (prRefByUserDate.get(`${m.userId}|${dateIso}`) ?? `day:${dateIso}`)
        : null;
      const poundRef = isMine ? null : dayRef;
      const poundKey = dayRef ? `${m.userId}|${dayRef}` : null;
      week.push({
        dateIso,
        state,
        isToday: dateIso === todayIso,
        title: log?.title ?? slot?.title ?? null,
        muscles: (log?.muscles ?? slot?.muscles ?? []).slice(0, 3),
        poundRef,
        kudos: poundKey ? (kudosCountByRef.get(poundKey) ?? 0) : 0,
        iPounded: poundKey && !isMine ? myPoundsByRef.has(poundKey) : false,
      });
    }

    const todaySlot = skipped.has(todayIso)
      ? null
      : scheduledSlotOn(m, todayIso);
    const todayState: CrewSummaryMember['todayState'] = trained.has(todayIso)
      ? 'trained'
      : todaySlot
        ? 'scheduled'
        : 'rest';

    const last = m.logs[0] ?? null;
    const latestSessionRef = last ? `day:${last.dateIso}` : null;
    const refKey = latestSessionRef ? `${m.userId}|${latestSessionRef}` : null;

    return {
      userId: m.userId,
      name: m.name,
      avatarId: m.avatarId,
      isMe: m.userId === meUserId,
      todayState,
      week,
      weekStreak: weekStreakOf(trained, weekMondayIso),
      lastSession: last
        ? {
            title: last.title,
            dateIso: last.dateIso,
            performedAtIso: last.performedAtIso,
          }
        : null,
      race: { done, planned },
      hasPlanThisWeek,
      kudosWeek: weekKudosByUser.get(m.userId) ?? 0,
      latestSessionRef,
      kudosLatest: refKey ? (kudosCountByRef.get(refKey) ?? 0) : 0,
      iPoundedLatest: refKey ? myPoundsByRef.has(refKey) : false,
    };
  });

  const prMoments: CrewSummaryMoment[] = members
    .flatMap((m) =>
      m.prs.map((pr) => {
        // Ref by ID, not display name: null-named custom exercises must not
        // collide into one shared kudos bucket.
        const ref = `pr:${pr.dateIso}:${pr.exerciseId}`;
        const key = `${m.userId}|${ref}`;
        return {
          ref,
          userId: m.userId,
          name: m.name,
          avatarId: m.avatarId,
          kind: 'pr' as const,
          exerciseName: pr.exerciseName,
          weight: pr.weight,
          dateIso: pr.dateIso,
          kudos: kudosCountByRef.get(key) ?? 0,
          iPounded: myPoundsByRef.has(key),
        };
      }),
    )
    .sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1));

  const streakDays = crewStreakDaysOf(
    members,
    trainedByUser,
    todayIso,
    crewCreatedIso,
  );

  const moments: CrewSummaryMoment[] = [];

  // Crew-streak milestone: shown for ~3 days once crossed. Crew-wide and
  // display-only — there is no single recipient to pound.
  const milestone = [100, 60, 30, 14, 7].find(
    (m) => streakDays >= m && streakDays < m + 3,
  );
  if (milestone) {
    moments.push({
      ref: `crewstreak:${milestone}`,
      userId: null,
      name: null,
      avatarId: null,
      kind: 'streak',
      dateIso: todayIso,
      kudos: 0,
      iPounded: false,
      milestone,
    });
  }

  // Monday/Tuesday recap of last week's race. The winner is the moment's
  // face and the pound recipient; crew totals ride along for the subtitle.
  const todayWeekday = weekdayNameOf(todayIso);
  if (todayWeekday === 'Monday' || todayWeekday === 'Tuesday') {
    const lastMonday = addDaysIso(weekMondayIso, -7);
    let crewDone = 0;
    let crewPlanned = 0;
    const standings = members.map((m) => {
      const trained = trainedByUser.get(m.userId)!;
      const skipped = new Set(m.skippedDays);
      let done = 0;
      let planned = 0;
      let hadPlan = false;
      for (let i = 0; i < 7; i++) {
        const dateIso = addDaysIso(lastMonday, i);
        const slot = skipped.has(dateIso) ? null : scheduledSlotOn(m, dateIso);
        if (slot) hadPlan = true;
        const trainedDay = trained.has(dateIso);
        if (trainedDay) done++;
        if (trainedDay || slot) planned++;
      }
      crewDone += done;
      crewPlanned += planned;
      return { m, done, planned, hadPlan };
    });
    // Winner: best completion against an actual plan; planless fall back to
    // raw sessions. Ties break by more sessions, then userId for stability.
    const winner = standings
      .filter((s) => s.done > 0)
      .sort((a, b) => {
        const ra = a.hadPlan && a.planned > 0 ? a.done / a.planned : 0;
        const rb = b.hadPlan && b.planned > 0 ? b.done / b.planned : 0;
        if (rb !== ra) return rb - ra;
        if (b.done !== a.done) return b.done - a.done;
        return a.m.userId < b.m.userId ? -1 : 1;
      })[0];
    if (winner) {
      const ref = `recap:${lastMonday}`;
      const key = `${winner.m.userId}|${ref}`;
      moments.push({
        ref,
        userId: winner.m.userId,
        name: winner.m.name,
        avatarId: winner.m.avatarId,
        kind: 'recap',
        dateIso: lastMonday,
        kudos: kudosCountByRef.get(key) ?? 0,
        iPounded: myPoundsByRef.has(key),
        winnerDone: winner.done,
        winnerPlanned: winner.planned,
        crewDone,
        crewPlanned,
      });
    }
  }

  moments.push(...prMoments);

  return {
    streakDays,
    members: summaryMembers,
    moments: moments.slice(0, 6),
  };
}
