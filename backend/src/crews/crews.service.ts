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
  assembleCrewSummary,
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
  crew: { code: string; createdAtIso: string } | null;
  meUserId: string;
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

  async createCrew(userId: string): Promise<{ code: string }> {
    const existing = await this.prisma.crewMember.findUnique({
      where: { userId },
    });
    if (existing) throw new ConflictException('You are already in a crew.');
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateShareCode();
      try {
        await this.prisma.crew.create({
          data: { code, members: { create: { userId } } },
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
    throw new ConflictException('Could not create a crew code — try again.');
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
        streakDays: 0,
        members: [],
        moments: [],
      };
    }
    const crew = membership.crew;
    const memberUsers = crew.members.map((m) => m.user);
    const memberIds = memberUsers.map((u) => u.id);

    const weekStartUtc = this.localDayStartUtc(weekMondayIso, tzOffsetMinutes);
    const lookbackUtc = new Date(Date.now() - LOG_LOOKBACK_DAYS * DAY_MS);

    const [plans, allLogs, weekLogs, weekSets] = await Promise.all([
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
      this.prisma.workoutLog.findMany({
        where: { userId: { in: memberIds }, startedAt: { gte: lookbackUtc } },
        select: {
          userId: true,
          startedAt: true,
          workout: { select: { name: true } },
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.workoutLog.findMany({
        where: { userId: { in: memberIds }, startedAt: { gte: weekStartUtc } },
        select: {
          userId: true,
          startedAt: true,
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
          workoutLogEntry: {
            select: {
              exerciseId: true,
              name: true,
              workoutLog: { select: { userId: true, startedAt: true } },
            },
          },
        },
      }),
    ]);

    // Prior bests for every exercise lifted this week (PR detection). Bounded
    // to the same one-year lookback so a staple lift can't drag the whole
    // table through this query — a "PR" here means best of the last year.
    const weekExerciseIds = [
      ...new Set(weekSets.map((s) => s.workoutLogEntry.exerciseId)),
    ];
    const priorSets = weekExerciseIds.length
      ? await this.prisma.completedSet.findMany({
          where: {
            weight: { not: null },
            workoutLogEntry: {
              exerciseId: { in: weekExerciseIds },
              workoutLog: {
                userId: { in: memberIds },
                startedAt: { lt: weekStartUtc, gte: lookbackUtc },
              },
            },
          },
          select: {
            weight: true,
            workoutLogEntry: {
              select: {
                exerciseId: true,
                workoutLog: { select: { userId: true } },
              },
            },
          },
        })
      : [];
    const priorBest = new Map<string, number>();
    for (const s of priorSets) {
      const key = `${s.workoutLogEntry.workoutLog.userId}|${s.workoutLogEntry.exerciseId}`;
      if ((priorBest.get(key) ?? 0) < (s.weight ?? 0))
        priorBest.set(key, s.weight!);
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
    const weekBest = new Map<
      string,
      {
        weight: number;
        dateIso: string;
        exerciseId: string;
        exerciseName: string;
      }
    >();
    for (const s of weekSets) {
      const entry = s.workoutLogEntry;
      const key = `${entry.workoutLog.userId}|${entry.exerciseId}`;
      const dateIso = this.localDateIso(
        entry.workoutLog.startedAt,
        tzOffsetMinutes,
      );
      const current = weekBest.get(key);
      if (!current || (s.weight ?? 0) > current.weight) {
        weekBest.set(key, {
          weight: s.weight!,
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
      const logs = allLogs
        .filter((l) => l.userId === u.id)
        .map((l) => {
          const dateIso = this.localDateIso(l.startedAt, tzOffsetMinutes);
          return {
            dateIso,
            title: l.workout?.name ?? 'Workout',
            performedAtIso: l.startedAt.toISOString(),
            muscles: weekMusclesByDate.get(dateIso) ?? [],
          };
        });
      const prs = [...weekBest.entries()]
        .filter(([key]) => key.startsWith(`${u.id}|`))
        .flatMap(([key, best]) => {
          const prior = priorBest.get(key);
          return prior !== undefined && best.weight > prior
            ? [
                {
                  dateIso: best.dateIso,
                  exerciseId: best.exerciseId,
                  exerciseName: best.exerciseName,
                  weight: best.weight,
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
      for (const pr of m.prs)
        surfacedRefs.add(`pr:${pr.dateIso}:${pr.exerciseId}`);
    }
    const kudosRows = await this.prisma.crewKudos.findMany({
      where: {
        crewId: crew.id,
        OR: [
          { createdAt: { gte: new Date(weekStartUtc.getTime() - 7 * DAY_MS) } },
          { eventRef: { in: [...surfacedRefs] } },
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
      crew: { code: crew.code, createdAtIso: crew.createdAt.toISOString() },
      meUserId: userId,
      ...assembled,
    };
  }
}
