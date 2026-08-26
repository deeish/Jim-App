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
  /** ISO Monday the member's active program anchors week 1 to; null = no plan. */
  anchorMondayIso: string | null;
  totalWeeks: number;
  slots: MemberSlotInput[];
  /** Newest first, bucketed to the caller's local days. */
  logs: MemberLogInput[];
  prs: { dateIso: string; exerciseName: string; weight: number }[];
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
  const violated = (dateIso: string): boolean =>
    members.some(
      (m) =>
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
  for (let i = 0; i < 60; i++) {
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
  iPoundedLatest: boolean;
}

export interface CrewSummaryMoment {
  ref: string;
  userId: string;
  name: string | null;
  avatarId: string | null;
  kind: 'pr';
  exerciseName: string;
  weight: number;
  dateIso: string;
  kudos: number;
  iPounded: boolean;
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

  const summaryMembers: CrewSummaryMember[] = members.map((m) => {
    const trained = trainedByUser.get(m.userId)!;
    const logByDate = new Map(m.logs.map((l) => [l.dateIso, l] as const));

    const week: CrewSummaryMemberDay[] = [];
    let planned = 0;
    let done = 0;
    let hasPlanThisWeek = false;
    for (let i = 0; i < 7; i++) {
      const dateIso = addDaysIso(weekMondayIso, i);
      const slot = scheduledSlotOn(m, dateIso);
      if (slot) hasPlanThisWeek = true;
      const log = logByDate.get(dateIso);
      let state: CrewDayState = 'rest';
      if (log) state = 'trained';
      else if (slot) state = dateIso < todayIso ? 'missed' : 'scheduled';
      if (log) done++;
      if (log || slot) planned++;
      week.push({
        dateIso,
        state,
        isToday: dateIso === todayIso,
        title: log?.title ?? slot?.title ?? null,
        muscles: (log?.muscles ?? slot?.muscles ?? []).slice(0, 3),
      });
    }

    const todaySlot = scheduledSlotOn(m, todayIso);
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
      iPoundedLatest: refKey ? myPoundsByRef.has(refKey) : false,
    };
  });

  const moments: CrewSummaryMoment[] = members
    .flatMap((m) =>
      m.prs.map((pr) => {
        const ref = `pr:${pr.dateIso}:${pr.exerciseName}`;
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
    .sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1))
    .slice(0, 5);

  return {
    streakDays: crewStreakDaysOf(
      members,
      trainedByUser,
      todayIso,
      crewCreatedIso,
    ),
    members: summaryMembers,
    moments,
  };
}
