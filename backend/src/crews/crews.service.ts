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

  /** The caller's local calendar date for a UTC timestamp. */
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
    await this.prisma.crewMember.create({ data: { crewId: crew.id, userId } });
    return { code };
  }

  async leaveCrew(userId: string): Promise<void> {
    const membership = await this.prisma.crewMember.findUnique({
      where: { userId },
    });
    if (!membership) return;
    await this.prisma.crewMember.delete({ where: { userId } });
    const remaining = await this.prisma.crewMember.count({
      where: { crewId: membership.crewId },
    });
    if (remaining === 0) {
      await this.prisma.crew.delete({ where: { id: membership.crewId } });
    }
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
    const where = {
      fromUserId_toUserId_eventRef: { fromUserId: userId, toUserId, eventRef },
    };
    const existing = await this.prisma.crewKudos.findUnique({ where });
    if (existing) {
      await this.prisma.crewKudos.delete({ where });
    } else {
      await this.prisma.crewKudos.create({
        data: { crewId: mine.crewId, fromUserId: userId, toUserId, eventRef },
      });
    }
    const count = await this.prisma.crewKudos.count({
      where: { toUserId, eventRef },
    });
    return { pounded: !existing, count };
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

    const [plans, allLogs, weekLogs, weekSets, kudosRows] = await Promise.all([
      this.prisma.workoutPlan.findMany({
        where: { userId: { in: memberIds }, isActive: true },
        include: {
          planWorkouts: {
            include: {
              exercises: { select: { exerciseId: true, name: true } },
            },
          },
        },
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
      this.prisma.crewKudos.findMany({
        where: {
          crewId: crew.id,
          createdAt: { gte: new Date(weekStartUtc.getTime() - 7 * DAY_MS) },
        },
      }),
    ]);

    // Prior bests for every exercise lifted this week (PR detection).
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
                startedAt: { lt: weekStartUtc },
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
      { weight: number; dateIso: string; exerciseName: string }
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
          exerciseName:
            entry.name ??
            this.exercises.findOne(entry.exerciseId)?.name ??
            'a lift',
        });
      }
    }

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
