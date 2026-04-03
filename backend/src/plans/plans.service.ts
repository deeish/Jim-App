import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkoutGeneratorService } from '../workouts/workout-generator.service';
import { ExercisesService } from '../exercises/exercises.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { GenerateSessionsDto } from './dto/generate-sessions.dto';
import { GenerateSingleSessionDto } from './dto/generate-single-session.dto';
import {
  enrichGeneratedSession,
  type GeneratedSession,
} from './session-enrichment';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workoutGenerator: WorkoutGeneratorService,
    private readonly exercises: ExercisesService,
  ) {}

  /** Plan slots with ordered plan_exercises (for Plan screen detail + materialize). */
  private planWorkoutsInclude() {
    return {
      orderBy: [
        { weekNumber: 'asc' as const },
        { dayOfWeek: 'asc' as const },
        { orderInDay: 'asc' as const },
      ],
      include: {
        exercises: { orderBy: { orderIndex: 'asc' as const } },
      },
    };
  }

  /** Current plan = most recently updated plan for this user. */
  async getCurrent(userId: string) {
    const plan = await this.prisma.workoutPlan.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        planWorkouts: this.planWorkoutsInclude(),
      },
    });
    return plan;
  }

  /** Current plan + weekly workouts in one call (faster for Plan screen). */
  async getCurrentWithWeekly(userId: string) {
    const plan = await this.prisma.workoutPlan.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        planWorkouts: this.planWorkoutsInclude(),
      },
    });
    const weeklyWorkouts = plan
      ? await this.prisma.workout.findMany({
          where: { workoutPlanId: plan.id },
          include: { exercises: true },
          orderBy: { day: 'asc' },
        })
      : [];
    return { plan, weeklyWorkouts };
  }

  async getById(id: string, userId: string) {
    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id },
      include: {
        planWorkouts: this.planWorkoutsInclude(),
      },
    });
    if (!plan) throw new NotFoundException(`Plan with ID ${id} not found`);
    if (plan.userId && plan.userId !== userId) {
      throw new NotFoundException(`Plan with ID ${id} not found`);
    }
    return plan;
  }

  private dateOnlyFromYmd(ymd: string): Date {
    return new Date(`${ymd}T12:00:00.000Z`);
  }

  async create(dto: CreatePlanDto, userId: string) {
    const name = dto.name ?? `Plan ${new Date().toLocaleDateString()}`;

    const weekAnchorMonday = dto.weekAnchorMonday
      ? this.dateOnlyFromYmd(dto.weekAnchorMonday)
      : null;

    const plan = await this.prisma.workoutPlan.create({
      data: {
        name,
        userId,
        weekAnchorMonday,
        planWorkouts: {
          create: dto.slots.map((s) => ({
            weekNumber: s.weekNumber,
            dayOfWeek: s.dayOfWeek,
            title: s.title,
            detailLine: s.detailLine ?? undefined,
            type: s.type,
            durationMinutes: s.durationMinutes,
            intensity: s.intensity ?? undefined,
            orderInDay: s.orderInDay ?? 0,
            exercises: s.exercises?.length
              ? {
                  create: s.exercises.map((e, i) => ({
                    exerciseId:
                      (e.exerciseId && String(e.exerciseId).trim()) ||
                      `applied_${s.weekNumber}_${s.dayOfWeek}_${i}`,
                    name: e.name ?? null,
                    sets: e.sets,
                    reps: e.reps,
                    weight: e.weight ?? null,
                    notes: e.notes ?? null,
                    orderIndex: e.orderIndex ?? i,
                  })),
                }
              : undefined,
          })),
        },
      },
      include: {
        planWorkouts: this.planWorkoutsInclude(),
      },
    });

    await this.createWorkoutsForPlan(plan.id, userId, this.getGeneratorContextFromDto(dto), {
      fillAllEmptySlots: true,
    });
    return this.getById(plan.id, userId);
  }

  /** Monday of the week containing the given date (local). */
  private getWeekStart(d: Date): Date {
    const copy = new Date(d);
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  /** True if dayOfWeek (e.g. "Monday") is today or in the future for the current week. */
  private isDayTodayOrFuture(dayOfWeek: string): boolean {
    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayIndex = DAYS.indexOf(dayOfWeek);
    if (dayIndex < 0) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = this.getWeekStart(today);
    const slotDate = new Date(weekStart);
    slotDate.setDate(slotDate.getDate() + dayIndex);
    return slotDate.getTime() >= today.getTime();
  }

  private static readonly PLAN_DAYS = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ] as const;

  /** UTC midnight ms for the calendar day of `d` (interpreted in UTC). */
  private utcStartOfDayFromDate(d: Date): number {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  /** Calendar date (UTC) of this plan slot from anchor Monday + program week + weekday. */
  private slotUtcStartFromAnchor(
    anchorMonday: Date,
    weekNumber: number,
    dayOfWeek: string,
  ): number {
    const dayIndex = PlansService.PLAN_DAYS.indexOf(dayOfWeek as (typeof PlansService.PLAN_DAYS)[number]);
    const idx = dayIndex < 0 ? 0 : dayIndex;
    const base = this.utcStartOfDayFromDate(anchorMonday);
    const deltaDays = (weekNumber - 1) * 7 + idx;
    return base + deltaDays * 86400000;
  }

  /** Monday 00:00 UTC and Sunday 00:00 UTC of the ISO week containing `now`. */
  private utcWeekRangeContaining(now: Date): { weekStartMs: number; weekEndMs: number } {
    const y = now.getUTCFullYear();
    const m0 = now.getUTCMonth();
    const d = now.getUTCDate();
    const dow = now.getUTCDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const mondayMs = Date.UTC(y, m0, d + diff);
    const sundayMs = mondayMs + 6 * 86400000;
    return { weekStartMs: mondayMs, weekEndMs: sundayMs };
  }

  /** True if this slot should get an auto-generated Workout now (today or later, same UTC calendar week as today). */
  private shouldGenerateWorkoutForSlotAnchored(
    anchorMonday: Date,
    pw: { weekNumber: number; dayOfWeek: string },
    now: Date,
  ): boolean {
    const slotMs = this.slotUtcStartFromAnchor(anchorMonday, pw.weekNumber, pw.dayOfWeek);
    const todayMs = this.utcStartOfDayFromDate(now);
    if (slotMs < todayMs) return false;
    const { weekStartMs, weekEndMs } = this.utcWeekRangeContaining(now);
    return slotMs >= weekStartMs && slotMs <= weekEndMs;
  }

  /** Create a Workout from plan_exercises when the client applied preview exercises (no duplicate LLM). */
  private async ensureWorkoutFromPlanSlotExercises(
    pw: {
      id: string;
      title: string;
      dayOfWeek: string;
      detailLine: string | null;
      durationMinutes: number;
      exercises: Array<{
        exerciseId: string;
        name: string | null;
        sets: number;
        reps: number;
        weight: number | null;
        notes: string | null;
        orderIndex: number;
      }>;
    },
    workoutPlanId: string,
    userId?: string,
  ): Promise<void> {
    const existing = await this.prisma.workout.findFirst({ where: { planWorkoutId: pw.id } });
    if (existing) return;
    if (!pw.exercises.length) return;
    await this.prisma.workout.create({
      data: {
        name: pw.title,
        day: pw.dayOfWeek,
        estimatedDuration: pw.durationMinutes,
        focus: pw.detailLine ?? undefined,
        workoutPlanId,
        planWorkoutId: pw.id,
        userId,
        exercises: {
          create: pw.exercises.map((e, i) => ({
            name: e.name ?? 'Exercise',
            sets: e.sets,
            reps: e.reps,
            weight: e.weight ?? undefined,
            notes: e.notes ?? undefined,
            exerciseId:
              e.exerciseId && !/^(draft_|applied_)/.test(e.exerciseId) ? e.exerciseId : undefined,
            orderIndex: e.orderIndex ?? i,
          })),
        },
      },
    });
  }

  /**
   * Create Workout rows: first from client-supplied plan exercises (preview apply), then LLM for empty slots.
   * When `fillAllEmptySlots` is true (new/replaced plan from POST/PATCH), every empty slot gets a workout so
   * past calendar days are not skipped (otherwise detailLine can say "6 exercises" while DB has none).
   * Otherwise only slots in the current UTC week from today forward are filled (lighter touch for future callers).
   */
  private async createWorkoutsForPlan(
    workoutPlanId: string,
    userId?: string,
    generatorContext?: { goal?: string; experience?: string; equipment?: string[]; limitations?: string[]; programTemplateId?: string },
    options?: { fillAllEmptySlots?: boolean },
  ) {
    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id: workoutPlanId },
      include: {
        planWorkouts: {
          include: { exercises: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    });
    if (!plan) return;

    const uid = userId ?? plan.userId ?? undefined;
    const now = new Date();
    const anchor = plan.weekAnchorMonday;

    for (const pw of plan.planWorkouts) {
      if (pw.exercises.length > 0) {
        await this.ensureWorkoutFromPlanSlotExercises(pw, workoutPlanId, uid);
      }
    }

    const fillAll = options?.fillAllEmptySlots === true;

    for (const pw of plan.planWorkouts) {
      if (pw.exercises.length > 0) continue;

      if (!fillAll) {
        if (anchor) {
          if (!this.shouldGenerateWorkoutForSlotAnchored(anchor, pw, now)) continue;
        } else {
          if (pw.weekNumber !== 1) continue;
          if (!this.isDayTodayOrFuture(pw.dayOfWeek)) continue;
        }
      }

      const difficulty = this.intensityToDifficulty(pw.intensity);
      const generated = await this.workoutGenerator.generateWorkout({
        day: pw.dayOfWeek,
        userId: uid ?? undefined,
        preferences: {
          focus: pw.title,
          duration: pw.durationMinutes,
          difficulty,
          equipment: generatorContext?.equipment,
          goal: generatorContext?.goal,
          experience: generatorContext?.experience,
          limitations: generatorContext?.limitations,
          programTemplateId: generatorContext?.programTemplateId,
          programDayFocus: pw.title,
        },
      });

      await this.prisma.workout.create({
        data: {
          name: generated.name,
          day: pw.dayOfWeek,
          estimatedDuration: pw.durationMinutes,
          focus: pw.detailLine ?? undefined,
          reasoning: generated.reasoning ?? undefined,
          warmUp: generated.warmUp ?? undefined,
          coolDown: generated.coolDown ?? undefined,
          workoutPlanId,
          planWorkoutId: pw.id,
          userId,
          exercises: {
            create: generated.exercises.map((e, i) => ({
              name: e.name,
              sets: e.sets,
              reps: e.reps,
              weight: e.weight ?? undefined,
              notes: e.notes ?? undefined,
              exerciseId: e.exerciseId ?? undefined,
              orderIndex: e.orderIndex ?? i,
            })),
          },
        },
      });

      await this.prisma.planExercise.deleteMany({ where: { planWorkoutId: pw.id } });
      await this.prisma.planExercise.createMany({
        data: generated.exercises.map((e, i) => ({
          planWorkoutId: pw.id,
          exerciseId:
            (e.exerciseId && String(e.exerciseId).trim()) ||
            `generated_${pw.id.replace(/-/g, '').slice(0, 12)}_${i}`,
          name: e.name,
          sets: e.sets,
          reps: e.reps,
          weight: e.weight ?? null,
          notes: e.notes ?? null,
          orderIndex: e.orderIndex ?? i,
        })),
      });
    }
  }

  private getGeneratorContextFromDto(dto: CreatePlanDto): Parameters<PlansService['createWorkoutsForPlan']>[2] {
    return {
      goal: dto.goal,
      experience: dto.experience,
      equipment: dto.equipment,
      limitations: dto.limitations,
      programTemplateId: dto.programTemplateId,
    };
  }

  private intensityToDifficulty(intensity: string | null): 'beginner' | 'intermediate' | 'advanced' {
    if (!intensity) return 'intermediate';
    if (intensity === 'Easy') return 'beginner';
    if (intensity === 'Hard') return 'advanced';
    return 'intermediate';
  }

  async update(id: string, dto: CreatePlanDto, userId: string) {
    const existing = await this.prisma.workoutPlan.findUnique({
      where: { id },
      include: { planWorkouts: true },
    });
    if (!existing) throw new NotFoundException(`Plan with ID ${id} not found`);
    if (existing.userId && existing.userId !== userId) {
      throw new NotFoundException(`Plan with ID ${id} not found`);
    }

    const name = dto.name ?? existing.name;

    const weekAnchorMonday =
      dto.weekAnchorMonday !== undefined
        ? dto.weekAnchorMonday
          ? this.dateOnlyFromYmd(dto.weekAnchorMonday)
          : null
        : undefined;

    await this.prisma.$transaction([
      this.prisma.workout.updateMany({
        where: { workoutPlanId: id },
        data: { workoutPlanId: null, planWorkoutId: null },
      }),
      this.prisma.planWorkout.deleteMany({ where: { workoutPlanId: id } }),
    ]);

    const plan = await this.prisma.workoutPlan.update({
      where: { id },
      data: {
        name,
        ...(weekAnchorMonday !== undefined ? { weekAnchorMonday } : {}),
        planWorkouts: {
          create: dto.slots.map((s) => ({
            weekNumber: s.weekNumber,
            dayOfWeek: s.dayOfWeek,
            title: s.title,
            detailLine: s.detailLine ?? undefined,
            type: s.type,
            durationMinutes: s.durationMinutes,
            intensity: s.intensity ?? undefined,
            orderInDay: s.orderInDay ?? 0,
            exercises: s.exercises?.length
              ? {
                  create: s.exercises.map((e, i) => ({
                    exerciseId:
                      (e.exerciseId && String(e.exerciseId).trim()) ||
                      `applied_${s.weekNumber}_${s.dayOfWeek}_${i}`,
                    name: e.name ?? null,
                    sets: e.sets,
                    reps: e.reps,
                    weight: e.weight ?? null,
                    notes: e.notes ?? null,
                    orderIndex: e.orderIndex ?? i,
                  })),
                }
              : undefined,
          })),
        },
      },
      include: {
        planWorkouts: this.planWorkoutsInclude(),
      },
    });

    await this.createWorkoutsForPlan(plan.id, userId, this.getGeneratorContextFromDto(dto), {
      fillAllEmptySlots: true,
    });
    return this.getById(plan.id, userId);
  }

  /**
   * Generate session content (exercises, warmup, cooldown, reasoning) for multiple session specs.
   * Used by the frontend plan pipeline to fill in LLM-generated content per session.
   */
  /** Minimal equipment for home workouts (matches exercise library equipment names). */
  private static readonly HOME_EQUIPMENT = ['Dumbbell', 'Resistance Band', 'Bodyweight'] as const;

  async generateSessions(dto: GenerateSessionsDto): Promise<{
    sessions: Array<{
      weekIndex: number;
      weekday: string;
      name: string;
      reasoning?: string;
      warmUp?: string;
      coolDown?: string;
      exercises: Array<{
        name: string;
        sets: number;
        reps: number;
        weight?: number;
        notes?: string;
        exerciseId?: string;
      }>;
    }>;
  }> {
    const goal = dto.goal ?? 'strength';
    const location = dto.location ?? 'gym';
    const detailLevel = dto.detailLevel ?? 'detailed';
    const makeItEasier = dto.makeItEasier === true;
    const limitations = dto.avoidConstraints ?? [];
    const equipment =
      location === 'home'
        ? [...PlansService.HOME_EQUIPMENT]
        : undefined;

    const fullProgram = await this.workoutGenerator.tryGenerateFullProgram({
      sessions: dto.sessions.map((s) => ({
        weekIndex: s.weekIndex,
        weekday: s.weekday,
        title: s.title,
        type: s.type,
        durationMin: s.durationMin,
        durationMax: s.durationMax,
        isHardDay: s.isHardDay,
      })),
      goal,
      location,
      detailLevel,
      makeItEasier,
      avoidConstraints: limitations,
    });

    if (fullProgram && fullProgram.length === dto.sessions.length) {
      const results = fullProgram.map((session, i) => {
        const spec = dto.sessions[i];
        const avoidPhrases = [...new Set([...limitations, ...(spec?.avoidConstraints ?? [])])].filter(Boolean);
        const filteredExercises = this.filterExercisesByAvoidList(
          session.exercises,
          avoidPhrases,
        );
        return {
          weekIndex: session.weekIndex,
          weekday: session.weekday,
          name: session.name,
          reasoning: session.reasoning,
          warmUp: session.warmUp,
          coolDown: session.coolDown,
          cardioFinisher: session.cardioFinisher,
          exercises: filteredExercises,
        };
      });
      const enriched = await this.applySessionEnrichment(results, dto);
      return { sessions: enriched };
    }

    const results: Array<{
      weekIndex: number;
      weekday: string;
      name: string;
      reasoning?: string;
      warmUp?: string;
      coolDown?: string;
      cardioFinisher?: { suggestion: string };
      exercises: Array<{ name: string; sets: number; reps: number; weight?: number; notes?: string; exerciseId?: string }>;
    }> = [];
    const usedExerciseIdsByWeek = new Map<number, string[]>();

    for (const spec of dto.sessions) {
      const isHard = makeItEasier ? false : spec.isHardDay;
      const difficulty = makeItEasier ? 'beginner' : (isHard ? 'advanced' : 'intermediate');
      const duration = Math.round((spec.durationMin + spec.durationMax) / 2);
      const specLimits = spec.avoidConstraints?.length ? spec.avoidConstraints : limitations;
      const avoidPhrases = [...new Set([...limitations, ...(spec.avoidConstraints ?? [])])].filter(Boolean);
      const alreadyUsedThisWeek = usedExerciseIdsByWeek.get(spec.weekIndex) ?? [];

      let generated: Awaited<ReturnType<WorkoutGeneratorService['generateWorkout']>>;
      try {
        generated = await this.workoutGenerator.generateWorkout({
          day: spec.weekday,
          preferences: {
            focus: spec.title ?? spec.type,
            duration,
            difficulty,
            goal,
            equipment,
            limitations: specLimits,
            programDayFocus: spec.title ?? spec.type,
            detailLevel,
            excludeExerciseIds: alreadyUsedThisWeek.length ? alreadyUsedThisWeek : undefined,
          },
        });
      } catch (firstErr) {
        try {
          generated = await this.workoutGenerator.generateWorkout({
            day: spec.weekday,
            preferences: {
              focus: spec.title ?? spec.type,
              duration,
              difficulty,
              goal,
              equipment,
              limitations: specLimits,
              programDayFocus: spec.title ?? spec.type,
              detailLevel,
              excludeExerciseIds: alreadyUsedThisWeek.length ? alreadyUsedThisWeek : undefined,
            },
          });
        } catch {
          throw firstErr;
        }
      }

      const newIds = (generated.exercises ?? [])
        .map((e) => e.exerciseId)
        .filter((id): id is string => !!id);
      if (newIds.length) {
        const existing = usedExerciseIdsByWeek.get(spec.weekIndex) ?? [];
        usedExerciseIdsByWeek.set(spec.weekIndex, [...existing, ...newIds]);
      }

      const filteredExercises = this.filterExercisesByAvoidList(
        generated.exercises.map((e) => ({
          name: e.name,
          sets: e.sets,
          reps: e.reps,
          weight: e.weight,
          notes: e.notes,
          exerciseId: e.exerciseId,
        })),
        avoidPhrases,
      );

      results.push({
        weekIndex: spec.weekIndex,
        weekday: spec.weekday,
        name: generated.name,
        reasoning: generated.reasoning,
        warmUp: generated.warmUp,
        coolDown: generated.coolDown,
        cardioFinisher: generated.cardioFinisher,
        exercises: filteredExercises,
      });
    }
    const enriched = await this.applySessionEnrichment(results, dto);
    return { sessions: enriched };
  }

  /** Validate / repair session lists: compound ordering, pull balance, warm-up tied to main lift. */
  private async applySessionEnrichment(
    sessions: GeneratedSession[],
    dto: GenerateSessionsDto,
  ): Promise<GeneratedSession[]> {
    const equipment =
      dto.location === 'home'
        ? [...PlansService.HOME_EQUIPMENT]
        : undefined;
    return Promise.all(
      sessions.map((s, i) => {
        const spec = dto.sessions[i];
        if (!spec) return Promise.resolve(s);
        const avoidPhrases = [
          ...new Set([
            ...(dto.avoidConstraints ?? []),
            ...(spec.avoidConstraints ?? []),
          ]),
        ].filter((p) => typeof p === 'string' && p.trim().length >= 2);
        return enrichGeneratedSession(
          s,
          spec,
          this.exercises,
          equipment,
          avoidPhrases,
        );
      }),
    );
  }

  async generateSingleSession(dto: GenerateSingleSessionDto) {
    const goal = dto.goal ?? 'strength';
    const location = dto.location ?? 'gym';
    const equipment = location === 'home' ? [...PlansService.HOME_EQUIPMENT] : undefined;
    const limitations = dto.avoidConstraints ?? [];
    const difficulty = dto.isHardDay ? 'advanced' : 'intermediate';
    const duration = Math.round((dto.durationMin + dto.durationMax) / 2);
    const avoidPhrases = (dto.avoidConstraints ?? []).filter(
      (p) => typeof p === 'string' && p.trim().length >= 2,
    );

    const generated = await this.workoutGenerator.generateWorkout({
      day: dto.weekday,
      preferences: {
        focus: dto.title ?? dto.type,
        duration,
        difficulty,
        goal,
        equipment,
        limitations,
        programDayFocus: dto.title ?? dto.type,
        detailLevel: dto.detailLevel ?? 'detailed',
        excludeExerciseNames: dto.excludeExerciseNames?.length ? dto.excludeExerciseNames : undefined,
      },
    });

    const filteredExercises = this.filterExercisesByAvoidList(
      generated.exercises.map((e) => ({
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        weight: e.weight,
        notes: e.notes,
        exerciseId: e.exerciseId,
      })),
      avoidPhrases,
    );

    const session: GeneratedSession = {
      weekIndex: dto.weekIndex,
      weekday: dto.weekday,
      name: generated.name,
      reasoning: generated.reasoning,
      warmUp: generated.warmUp,
      coolDown: generated.coolDown,
      exercises: filteredExercises,
    };
    return enrichGeneratedSession(
      session,
      dto,
      this.exercises,
      equipment,
      avoidPhrases,
    );
  }

  /** Remove exercises whose name or notes match any avoid phrase (case-insensitive). Phrases shorter than 2 chars are ignored to avoid over-matching. */
  private filterExercisesByAvoidList(
    exercises: Array<{ name: string; sets: number; reps: number; weight?: number; notes?: string; exerciseId?: string }>,
    avoidPhrases: string[],
  ): typeof exercises {
    const lowerPhrases = avoidPhrases
      .map((p) => p.toLowerCase().trim())
      .filter((p) => p.length >= 2);
    if (lowerPhrases.length === 0) return exercises;
    return exercises.filter((e) => {
      const nameLower = (e.name ?? '').toLowerCase();
      const notesLower = (e.notes ?? '').toLowerCase();
      return !lowerPhrases.some((p) => nameLower.includes(p) || notesLower.includes(p));
    });
  }

  /** Remove a single slot from the plan. Unlinks the linked Workout if any. */
  async removeSlot(planId: string, slotId: string, userId: string) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[PlansService] removeSlot', { planId, slotId });
    }
    if (!slotId) {
      if (process.env.NODE_ENV !== 'production') console.warn('[PlansService] removeSlot: slotId is missing');
      throw new NotFoundException('Slot ID is required');
    }
    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id: planId },
      include: { planWorkouts: true },
    });
    if (!plan) throw new NotFoundException(`Plan with ID ${planId} not found`);
    if (plan.userId && plan.userId !== userId) {
      throw new NotFoundException(`Plan with ID ${planId} not found`);
    }
    const slot = plan.planWorkouts.find((pw) => pw.id === slotId);
    if (!slot) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[PlansService] removeSlot: slot not in plan', { slotId, planSlotIds: plan.planWorkouts.map((pw) => pw.id) });
      }
      throw new NotFoundException(`Slot with ID ${slotId} not found in this plan`);
    }
    await this.prisma.$transaction([
      this.prisma.workout.updateMany({
        where: { planWorkoutId: slotId },
        data: { workoutPlanId: null, planWorkoutId: null },
      }),
      this.prisma.planWorkout.delete({ where: { id: slotId } }),
    ]);
    return this.getById(planId, userId);
  }
}
