import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExercisesService } from '../exercises/exercises.service';
import { generateShareCode, normalizeShareCode } from '../shares/share-code';
import {
  addDaysIso,
  assembleCrewSummary,
  estimateOneRepMax,
  E1RM_MAX_REPS,
  type CrewSummaryResult,
  type KudosInput,
  type MemberInput,
  type MuscleTag,
} from './crew-summary.util';

export const CREW_MAX_MEMBERS = 10;

const DAY_MS = 86_400_000;
/** Enough log history for year-long week streaks without unbounded reads. */
const LOG_LOOKBACK_DAYS = 370;

export interface CrewSummaryResponse extends CrewSummaryResult {
  crew: { code: string; name: string | null; createdAtIso: string } | null;
  meUserId: string;
  /** Who may remove members and rotate the code — see `leadOf`. Null with no crew. */
  leadUserId: string | null;
}

@Injectable()
export class CrewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercises: ExercisesService,
  ) {}

  /** The caller's local calendar date for a UTC timestamp.
   *  ⚠ Accepted v0 caveat: TODAY's offset is applied to all history, so a
   *  log within ~1h of local midnight on the other side of a DST switch can
   *  bucket to the neighbouring day. Fixing it properly means an IANA zone
   *  per request — revisit if a streak dispute ever traces here. */
  private localDateIso(at: Date, tzOffsetMinutes: number): string {
    return new Date(at.getTime() - tzOffsetMinutes * 60_000)
      .toISOString()
      .slice(0, 10);
  }

  /** UTC instant when the caller's local date began. */
  private localDayStartUtc(dateIso: string, tzOffsetMinutes: number): Date {
    const [y, m, d] = dateIso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) + tzOffsetMinutes * 60_000);
  }

  async createCrew(userId: string, name?: string): Promise<{ code: string }> {
    const existing = await this.prisma.crewMember.findUnique({
      where: { userId },
    });
    if (existing) throw new ConflictException('You are already in a crew.');
    const trimmedName = name?.trim().slice(0, 40) || null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateShareCode();
      try {
        await this.prisma.crew.create({
          data: { code, name: trimmedName, members: { create: { userId } } },
        });
        return { code };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // The unique that tripped decides the story: a userId collision is
          // a double-tap / second device, not a code collision.
          const target = String(
            (err.meta as { target?: unknown } | undefined)?.target ?? '',
          );
          if (target.includes('userId')) {
            throw new ConflictException('You are already in a crew.');
          }
          continue; // code collision — mint another
        }
        throw err;
      }
    }
    throw new ConflictException('Could not create a crew code. Try again.');
  }

  async joinCrew(userId: string, rawCode: string): Promise<{ code: string }> {
    const code = normalizeShareCode(rawCode);
    if (!code) throw new BadRequestException('That code does not look right.');
    const crew = await this.prisma.crew.findUnique({
      where: { code },
      include: { _count: { select: { members: true } } },
    });
    if (!crew) throw new NotFoundException('No crew with that code.');
    const existing = await this.prisma.crewMember.findUnique({
      where: { userId },
    });
    if (existing) {
      if (existing.crewId === crew.id) return { code };
      throw new ConflictException('You are already in a crew. Leave it first.');
    }
    if (crew._count.members >= CREW_MAX_MEMBERS) {
      throw new ConflictException('That crew is full (10 people).');
    }
    // Re-check the cap inside a transaction: two friends tapping Join in the
    // same second must not push the crew past 10.
    await this.prisma.$transaction(async (tx) => {
      const count = await tx.crewMember.count({ where: { crewId: crew.id } });
      if (count >= CREW_MAX_MEMBERS) {
        throw new ConflictException('That crew is full (10 people).');
      }
      await tx.crewMember.create({ data: { crewId: crew.id, userId } });
    });
    return { code };
  }

  async leaveCrew(userId: string): Promise<void> {
    const membership = await this.prisma.crewMember.findUnique({
      where: { userId },
    });
    if (!membership) return;
    // deleteMany keeps a double-leave idempotent; the empty-crew cleanup runs
    // in the same transaction so a concurrent join can't be cascaded away.
    await this.prisma.$transaction(async (tx) => {
      await tx.crewMember.deleteMany({ where: { userId } });
      const remaining = await tx.crewMember.count({
        where: { crewId: membership.crewId },
      });
      if (remaining === 0) {
        await tx.crew.deleteMany({ where: { id: membership.crewId } });
      }
    });
  }

  /**
   * Put yourself to rest, or come back.
   *
   * Resting pauses what you OWE the crew and nothing else: from this instant
   * your scheduled days stop counting toward the crew's weekly target and can
   * never miss against the crew streak, while any session you do log still
   * counts for the crew and still collects pounds. Habitica's Inn is the same
   * bargain, and it exists for the same reason — the only alternative anyone
   * offers a member who is injured or away is to quit the group.
   *
   * Only ever your own row: there is no lead check here because there is
   * nothing to abuse. Resting costs the crew nothing and gains you nothing
   * except an honest tile.
   */
  async setResting(
    userId: string,
    resting: boolean,
  ): Promise<{ restingSinceIso: string | null }> {
    const membership = await this.prisma.crewMember.findUnique({
      where: { userId },
    });
    if (!membership) throw new NotFoundException('You are not in a crew.');
    // Re-resting must not restart the clock: the row says how long you have
    // been out, and a stray double-tap should not quietly reset it to zero.
    if (resting && membership.restingSince) {
      return { restingSinceIso: membership.restingSince.toISOString() };
    }
    const row = await this.prisma.crewMember.update({
      where: { userId },
      data: { restingSince: resting ? new Date() : null },
    });
    return { restingSinceIso: row.restingSince?.toISOString() ?? null };
  }

  /**
   * The crew lead: the member who has been in it longest, which is the person
   * who created it until they leave.
   *
   * Derived rather than stored on purpose — a `Crew.ownerId` column would be
   * a production migration for a rule this simple, and "longest-standing
   * member" degrades sensibly when the founder walks: leadership passes to
   * whoever has been there next-longest instead of leaving a crew nobody can
   * administer. Ties break on userId so two members who joined in the same
   * millisecond still resolve to one lead.
   */
  private async leadOf(crewId: string): Promise<string | null> {
    const first = await this.prisma.crewMember.findFirst({
      where: { crewId },
      orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
      select: { userId: true },
    });
    return first?.userId ?? null;
  }

  private async requireLead(userId: string): Promise<string> {
    const membership = await this.prisma.crewMember.findUnique({
      where: { userId },
    });
    if (!membership) throw new NotFoundException('You are not in a crew.');
    const lead = await this.leadOf(membership.crewId);
    if (lead !== userId) {
      throw new BadRequestException(
        'Only the crew lead can do that. That is whoever has been in the crew longest.',
      );
    }
    return membership.crewId;
  }

  /**
   * Remove a crewmate. Until this existed, a code posted in the wrong group
   * chat meant a stranger could watch your training week forever and the only
   * escape was abandoning your own crew.
   */
  async removeMember(userId: string, targetUserId: string): Promise<void> {
    const crewId = await this.requireLead(userId);
    if (targetUserId === userId) {
      throw new BadRequestException('Use leave for that.');
    }
    const target = await this.prisma.crewMember.findUnique({
      where: { userId: targetUserId },
    });
    if (!target || target.crewId !== crewId) {
      throw new NotFoundException('They are not in your crew.');
    }
    // Their kudos go with them: counts on everyone else's sessions must not
    // keep crediting someone who is no longer in the crew.
    await this.prisma.$transaction([
      this.prisma.crewKudos.deleteMany({
        where: {
          crewId,
          OR: [{ fromUserId: targetUserId }, { toUserId: targetUserId }],
        },
      }),
      this.prisma.crewMember.deleteMany({ where: { userId: targetUserId } }),
    ]);
  }

  /**
   * Mint a new code, which is the only way to un-share one that leaked.
   * Everyone already in the crew stays in it; only the old code stops working.
   */
  async rotateCode(userId: string): Promise<{ code: string }> {
    const crewId = await this.requireLead(userId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateShareCode();
      try {
        await this.prisma.crew.update({
          where: { id: crewId },
          data: { code },
        });
        return { code };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue; // code collision — mint another
        }
        throw err;
      }
    }
    throw new ConflictException('Could not mint a new code. Try again.');
  }

  /** Toggle a 💪 on a crewmate's event. */
  async toggleKudos(
    userId: string,
    toUserId: string,
    eventRef: string,
  ): Promise<{ pounded: boolean; count: number }> {
    const [mine, theirs] = await Promise.all([
      this.prisma.crewMember.findUnique({ where: { userId } }),
      this.prisma.crewMember.findUnique({ where: { userId: toUserId } }),
    ]);
    if (!mine || !theirs || mine.crewId !== theirs.crewId) {
      throw new NotFoundException('Not in the same crew.');
    }
    if (userId === toUserId) {
      throw new BadRequestException('Pound your crewmates, not yourself.');
    }
    // The ref shape is validated by the DTO, but shape is not existence: a
    // member could otherwise mint kudos rows for sessions and records that
    // never happened. `recap:` is exempt — it names a computed crew event
    // rather than one of the recipient's own logs.
    if (!eventRef.startsWith('recap:')) {
      const dateIso = eventRef.split(':')[1];
      // A day-wide window, because the ref is in the POUNDER's local calendar
      // and this check has no timezone of its own. It is a sanity bound on
      // junk, not an audit.
      const from = new Date(`${dateIso}T00:00:00.000Z`);
      const to = new Date(from.getTime() + 2 * DAY_MS);
      const trained = await this.prisma.workoutLog.count({
        where: {
          userId: toUserId,
          startedAt: { gte: new Date(from.getTime() - DAY_MS), lt: to },
        },
      });
      if (trained === 0) {
        throw new BadRequestException('There is nothing there to pound.');
      }
    }
    // deleteMany-first makes a rapid double-tap safe: whichever request runs
    // second simply lands on the toggle's other branch instead of a P2002/500.
    const removed = await this.prisma.crewKudos.deleteMany({
      where: { fromUserId: userId, toUserId, eventRef },
    });
    let pounded = false;
    if (removed.count === 0) {
      try {
        await this.prisma.crewKudos.create({
          data: { crewId: mine.crewId, fromUserId: userId, toUserId, eventRef },
        });
        pounded = true;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          pounded = true; // a concurrent request already pounded it
        } else {
          throw err;
        }
      }
    }
    const count = await this.prisma.crewKudos.count({
      where: { toUserId, eventRef },
    });
    return { pounded, count };
  }

  async getSummary(
    userId: string,
    todayIso: string,
    weekMondayIso: string,
    tzOffsetMinutes: number,
  ): Promise<CrewSummaryResponse> {
    const membership = await this.prisma.crewMember.findUnique({
      where: { userId },
      include: { crew: { include: { members: { include: { user: true } } } } },
    });
    if (!membership) {
      return {
        crew: null,
        meUserId: userId,
        leadUserId: null,
        streakDays: 0,
        members: [],
        legendUserIds: [],
        moments: [],
      };
    }
    const crew = membership.crew;
    const memberUsers = crew.members.map((m) => m.user);
    const memberIds = memberUsers.map((u) => u.id);

    const weekStartUtc = this.localDayStartUtc(weekMondayIso, tzOffsetMinutes);
    const lookbackUtc = new Date(Date.now() - LOG_LOOKBACK_DAYS * DAY_MS);

    // Skips cover the crew-streak lookback (60d) plus this week's forward days.
    const skipsSinceIso = addDaysIso(weekMondayIso, -70);
    const [plans, allLogs, latestLogs, weekLogs, weekSets, skipRows] =
      await Promise.all([
        this.prisma.workoutPlan.findMany({
          where: { userId: { in: memberIds }, isActive: true },
          include: {
            planWorkouts: {
              include: {
                exercises: {
                  select: { exerciseId: true, name: true },
                  // Deterministic first-muscle tag (it drives the tile gradient).
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
          },
          // A user can end up with several active plans; take the newest,
          // deterministically, instead of whatever the DB returns first.
          orderBy: { updatedAt: 'desc' },
        }),
        // A year of dates, no join: this feeds week-streak math, which only
        // needs to know WHICH days had a session. Joining `workout` here meant
        // dragging a name through thousands of rows to display one of them.
        this.prisma.workoutLog.findMany({
          where: { userId: { in: memberIds }, startedAt: { gte: lookbackUtc } },
          select: { userId: true, startedAt: true },
          orderBy: { startedAt: 'desc' },
        }),
        // The one row per member that actually gets its title rendered.
        this.prisma.workoutLog.findMany({
          where: { userId: { in: memberIds } },
          select: {
            userId: true,
            startedAt: true,
            workout: { select: { name: true } },
          },
          orderBy: { startedAt: 'desc' },
          distinct: ['userId'],
        }),
        this.prisma.workoutLog.findMany({
          where: {
            userId: { in: memberIds },
            startedAt: { gte: weekStartUtc },
          },
          select: {
            userId: true,
            startedAt: true,
            workout: { select: { name: true } },
            entries: { select: { exerciseId: true, name: true } },
          },
          // First session of a two-session day wins, deterministically.
          orderBy: { startedAt: 'asc' },
        }),
        this.prisma.completedSet.findMany({
          where: {
            weight: { not: null },
            workoutLogEntry: {
              workoutLog: {
                userId: { in: memberIds },
                startedAt: { gte: weekStartUtc },
              },
            },
          },
          select: {
            weight: true,
            reps: true,
            workoutLogEntry: {
              select: {
                exerciseId: true,
                name: true,
                workoutLog: { select: { userId: true, startedAt: true } },
              },
            },
          },
        }),
        this.prisma.skippedDay.findMany({
          where: { userId: { in: memberIds }, dateIso: { gte: skipsSinceIso } },
          select: { userId: true, dateIso: true },
        }),
      ]);

    const skipsByUser = new Map<string, string[]>();
    for (const s of skipRows) {
      const list = skipsByUser.get(s.userId) ?? [];
      list.push(s.dateIso);
      skipsByUser.set(s.userId, list);
    }

    // Prior bests for every exercise lifted this week (PR detection). Bounded
    // to the same one-year lookback so a staple lift can't drag the whole
    // table through this query — a "PR" here means best of the last year.
    const weekExerciseIds = [
      ...new Set(weekSets.map((s) => s.workoutLogEntry.exerciseId)),
    ];
    // The best each member had BEFORE this week, for the same lifts they
    // touched this week. This is a MAX, so the database should compute it:
    // the old version fetched every matching set row of the last year — for
    // a ten-person crew a year in, tens of thousands of rows on every single
    // tab focus — only to fold them into one number each.
    //
    // The CASE mirrors `estimateOneRepMax`: one rep counts as the weight
    // itself, and anything past the rep cap is excluded rather than
    // projected. Rounding stays in JS so both sides round once, the same way.
    const priorBest = new Map<string, number>();
    if (weekExerciseIds.length) {
      const rows = await this.prisma.$queryRaw<
        { userId: string; exerciseId: string; best: number | null }[]
      >`
        SELECT wl."userId" AS "userId",
               wle."exerciseId" AS "exerciseId",
               MAX(
                 CASE WHEN cs."reps" = 1 THEN cs."weight"
                      ELSE cs."weight" * (1 + cs."reps" / 30.0) END
               ) AS "best"
        FROM "completed_sets" cs
        JOIN "workout_log_entries" wle ON wle."id" = cs."workoutLogEntryId"
        JOIN "workout_logs" wl ON wl."id" = wle."workoutLogId"
        WHERE cs."weight" IS NOT NULL
          AND cs."weight" > 0
          AND cs."reps" >= 1
          AND cs."reps" <= ${E1RM_MAX_REPS}
          AND wl."userId" = ANY(${memberIds})
          AND wle."exerciseId" = ANY(${weekExerciseIds})
          AND wl."startedAt" >= ${lookbackUtc}
          AND wl."startedAt" < ${weekStartUtc}
        GROUP BY wl."userId", wle."exerciseId"
      `;
      for (const r of rows) {
        if (r.best == null) continue;
        priorBest.set(
          `${r.userId}|${r.exerciseId}`,
          Math.round(Number(r.best)),
        );
      }
    }

    const muscleTagsFor = (
      entries: { exerciseId: string; name: string | null }[],
    ): MuscleTag[] => {
      const tags: MuscleTag[] = [];
      const seen = new Set<string>();
      for (const e of entries) {
        const meta = this.exercises.findOne(e.exerciseId);
        const group = meta?.primaryMuscleGroup ?? 'Other';
        if (seen.has(group)) continue;
        seen.add(group);
        tags.push({ group, name: e.name ?? meta?.name ?? e.exerciseId });
        if (tags.length >= 3) break;
      }
      return tags;
    };

    // Best weight per (user, exercise) this week, kept with its day for the moment card.
    // Best of THIS week per (member, exercise), ranked by estimated 1RM but
    // remembering the set that produced it — the record is announced as the
    // weight and reps actually lifted, never as the projection.
    const weekBest = new Map<
      string,
      {
        e1rm: number;
        weight: number;
        reps: number;
        dateIso: string;
        exerciseId: string;
        exerciseName: string;
      }
    >();
    for (const s of weekSets) {
      const e1rm = estimateOneRepMax(s.weight, s.reps);
      if (e1rm === null) continue;
      const entry = s.workoutLogEntry;
      const key = `${entry.workoutLog.userId}|${entry.exerciseId}`;
      const dateIso = this.localDateIso(
        entry.workoutLog.startedAt,
        tzOffsetMinutes,
      );
      const current = weekBest.get(key);
      // Ties prefer the heavier bar, matching the frontend's topWeightedSet.
      if (
        !current ||
        e1rm > current.e1rm ||
        (e1rm === current.e1rm && s.weight! > current.weight)
      ) {
        weekBest.set(key, {
          e1rm,
          weight: s.weight!,
          reps: s.reps,
          dateIso,
          exerciseId: entry.exerciseId,
          exerciseName:
            entry.name ??
            this.exercises.findOne(entry.exerciseId)?.name ??
            'a lift',
        });
      }
    }

    const joinedIsoByUser = new Map(
      crew.members.map((m) => [
        m.userId,
        this.localDateIso(m.joinedAt, tzOffsetMinutes),
      ]),
    );
    // Bucketed to the CALLER's calendar like every other date here, so the
    // day someone went to rest reads the same to everyone looking at the row.
    const restingIsoByUser = new Map(
      crew.members.map((m) => [
        m.userId,
        m.restingSince
          ? this.localDateIso(m.restingSince, tzOffsetMinutes)
          : null,
      ]),
    );

    const members: MemberInput[] = memberUsers.map((u) => {
      const plan = plans.find((p) => p.userId === u.id);
      const anchorMondayIso = plan?.weekAnchorMonday
        ? plan.weekAnchorMonday.toISOString().slice(0, 10)
        : null;
      const totalWeeks = plan
        ? Math.max(0, ...plan.planWorkouts.map((s) => s.weekNumber))
        : 0;
      const weekMusclesByDate = new Map<string, MuscleTag[]>();
      for (const log of weekLogs) {
        if (log.userId !== u.id) continue;
        const dateIso = this.localDateIso(log.startedAt, tzOffsetMinutes);
        if (!weekMusclesByDate.has(dateIso)) {
          weekMusclesByDate.set(dateIso, muscleTagsFor(log.entries));
        }
      }
      // Only two sessions per member ever have their title rendered: the
      // days of the current week, and their latest overall. Everything else
      // is a date, so it does not carry a name through this query at all.
      const titleByDate = new Map<string, string>();
      for (const l of weekLogs) {
        if (l.userId !== u.id) continue;
        titleByDate.set(
          this.localDateIso(l.startedAt, tzOffsetMinutes),
          l.workout?.name ?? 'Workout',
        );
      }
      for (const l of latestLogs) {
        if (l.userId !== u.id) continue;
        const dateIso = this.localDateIso(l.startedAt, tzOffsetMinutes);
        if (!titleByDate.has(dateIso)) {
          titleByDate.set(dateIso, l.workout?.name ?? 'Workout');
        }
      }
      const logs = allLogs
        .filter((l) => l.userId === u.id)
        .map((l) => {
          const dateIso = this.localDateIso(l.startedAt, tzOffsetMinutes);
          return {
            dateIso,
            title: titleByDate.get(dateIso) ?? 'Workout',
            muscles: weekMusclesByDate.get(dateIso) ?? [],
          };
        });
      const prs = [...weekBest.entries()]
        .filter(([key]) => key.startsWith(`${u.id}|`))
        .flatMap(([key, best]) => {
          const prior = priorBest.get(key);
          // No prior at all is a FIRST time, not a record.
          return prior !== undefined && best.e1rm > prior
            ? [
                {
                  dateIso: best.dateIso,
                  exerciseId: best.exerciseId,
                  exerciseName: best.exerciseName,
                  weight: best.weight,
                  reps: best.reps,
                },
              ]
            : [];
        });
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        avatarId: u.avatarId,
        joinedIso: joinedIsoByUser.get(u.id) ?? todayIso,
        skippedDays: skipsByUser.get(u.id) ?? [],
        restingSinceIso: restingIsoByUser.get(u.id) ?? null,
        anchorMondayIso,
        totalWeeks,
        slots:
          plan?.planWorkouts.map((s) => ({
            weekNumber: s.weekNumber,
            dayOfWeek: s.dayOfWeek,
            title: s.title,
            hasExercises: s.exercises.length > 0,
            muscles: muscleTagsFor(s.exercises),
          })) ?? [],
        logs,
        prs,
      };
    });

    // Kudos are fetched for the refs actually being surfaced (each member's
    // latest session + this week's PRs) plus anything recent — a chip on a
    // three-week-old session must still show its pounds, not read as zero.
    const surfacedRefs = new Set<string>();
    for (const m of members) {
      if (m.logs[0]) surfacedRefs.add(`day:${m.logs[0].dateIso}`);
      // Every trained day in the displayed week is its own tap target now,
      // so every one of them needs its own count — not just the latest.
      for (const log of m.logs) {
        if (log.dateIso >= weekMondayIso)
          surfacedRefs.add(`day:${log.dateIso}`);
      }
      for (const pr of m.prs)
        surfacedRefs.add(`pr:${pr.dateIso}:${pr.exerciseId}`);
    }
    const kudosRows = await this.prisma.crewKudos.findMany({
      where: {
        crewId: crew.id,
        OR: [
          { createdAt: { gte: new Date(weekStartUtc.getTime() - 7 * DAY_MS) } },
          { eventRef: { in: [...surfacedRefs] } },
          // Recap moments reference last week; their pounds must survive it.
          { eventRef: { startsWith: 'recap:' } },
        ],
      },
    });
    const kudos: KudosInput[] = kudosRows.map((k) => ({
      fromUserId: k.fromUserId,
      toUserId: k.toUserId,
      eventRef: k.eventRef,
      createdAtIso: k.createdAt.toISOString(),
    }));

    const assembled = assembleCrewSummary({
      meUserId: userId,
      todayIso,
      weekMondayIso,
      crewCreatedIso: crew.createdAt.toISOString().slice(0, 10),
      members,
      kudos,
    });

    return {
      crew: {
        code: crew.code,
        name: crew.name,
        createdAtIso: crew.createdAt.toISOString(),
      },
      meUserId: userId,
      // Already loaded with the crew, so this costs no extra query.
      leadUserId:
        [...crew.members].sort((a, b) => {
          const t = a.joinedAt.getTime() - b.joinedAt.getTime();
          return t !== 0 ? t : a.userId < b.userId ? -1 : 1;
        })[0]?.userId ?? null,
      ...assembled,
    };
  }

  /** Rename the caller's crew ("The 5AM Club"); blank clears back to null. */
  async renameCrew(
    userId: string,
    name: string,
  ): Promise<{ name: string | null }> {
    const membership = await this.prisma.crewMember.findUnique({
      where: { userId },
    });
    if (!membership) throw new NotFoundException('You are not in a crew.');
    const trimmed = name.trim().slice(0, 40);
    const updated = await this.prisma.crew.update({
      where: { id: membership.crewId },
      data: { name: trimmed.length > 0 ? trimmed : null },
    });
    return { name: updated.name };
  }
}
