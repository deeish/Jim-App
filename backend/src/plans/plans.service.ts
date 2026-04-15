import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  WorkoutGeneratorService,
  exerciseTargetsForSession,
  plainWorkoutTitle,
} from '../workouts/workout-generator.service';
import { ExercisesService } from '../exercises/exercises.service';
import { CreatePlanDto, PlanSlotDto } from './dto/create-plan.dto';
import { GenerateSessionsDto } from './dto/generate-sessions.dto';
import { GenerateSingleSessionDto } from './dto/generate-single-session.dto';
import {
  enrichGeneratedSession,
  type GeneratedSession,
} from './session-enrichment';

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workoutGenerator: WorkoutGeneratorService,
    private readonly exercises: ExercisesService,
    private readonly config: ConfigService,
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

    await this.createWorkoutsForPlan(
      plan.id,
      userId,
      this.getGeneratorContextFromDto(dto),
      {
        fillAllEmptySlots: true,
      },
    );
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
    const DAYS = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
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
    const dayIndex = PlansService.PLAN_DAYS.indexOf(
      dayOfWeek as (typeof PlansService.PLAN_DAYS)[number],
    );
    const idx = dayIndex < 0 ? 0 : dayIndex;
    const base = this.utcStartOfDayFromDate(anchorMonday);
    const deltaDays = (weekNumber - 1) * 7 + idx;
    return base + deltaDays * 86400000;
  }

  /** Monday 00:00 UTC and Sunday 00:00 UTC of the ISO week containing `now`. */
  private utcWeekRangeContaining(now: Date): {
    weekStartMs: number;
    weekEndMs: number;
  } {
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
    const slotMs = this.slotUtcStartFromAnchor(
      anchorMonday,
      pw.weekNumber,
      pw.dayOfWeek,
    );
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
    const existing = await this.prisma.workout.findFirst({
      where: { planWorkoutId: pw.id },
    });
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
              e.exerciseId && !/^(draft_|applied_)/.test(e.exerciseId)
                ? e.exerciseId
                : undefined,
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
    generatorContext?: {
      goal?: string;
      experience?: string;
      equipment?: string[];
      limitations?: string[];
      programTemplateId?: string;
    },
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
          if (!this.shouldGenerateWorkoutForSlotAnchored(anchor, pw, now))
            continue;
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

      await this.prisma.planExercise.deleteMany({
        where: { planWorkoutId: pw.id },
      });
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

  private getGeneratorContextFromDto(
    dto: CreatePlanDto,
  ): Parameters<PlansService['createWorkoutsForPlan']>[2] {
    return {
      goal: dto.goal,
      experience: dto.experience,
      equipment: dto.equipment,
      limitations: dto.limitations,
      programTemplateId: dto.programTemplateId,
    };
  }

  private intensityToDifficulty(
    intensity: string | null,
  ): 'beginner' | 'intermediate' | 'advanced' {
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

    await this.createWorkoutsForPlan(
      plan.id,
      userId,
      this.getGeneratorContextFromDto(dto),
      {
        fillAllEmptySlots: true,
      },
    );
    return this.getById(plan.id, userId);
  }

  /**
   * Generate session content (exercises, warmup, cooldown, reasoning) for multiple session specs.
   * Used by the frontend plan pipeline to fill in LLM-generated content per session.
   */
  /** Minimal equipment for home workouts (matches exercise library equipment names). */
  private static readonly HOME_EQUIPMENT = [
    'Dumbbell',
    'Resistance Band',
    'Bodyweight',
  ] as const;

  /** Matches `WorkoutGeneratorService.generateFullProgram` batch size (2–7 sessions per Groq call). */
  private static readonly GENERATE_SESSIONS_BATCH_SIZE = 7;

  /** Raw picks kept for recency; over-counted on purpose (repeats allowed). */
  private static readonly PRIOR_EXERCISE_HISTORY_MAX = 500;

  /** Unique ids passed to prompts / exclude lists; oldest→newest so `.slice(-N)` = freshest. */
  private static readonly PRIOR_CONTEXT_MAX_UNIQUE = 120;

  /**
   * Unique exercise ids from the tail of a chronological list (newest at end of tail).
   * Returns oldest→newest among included uniques so callers can `ids.slice(-48)` for “most recent”.
   */
  private static priorExerciseIdsOldestFirstAmongRecent(
    chronological: string[],
    maxTail: number,
    maxUnique: number,
  ): string[] {
    const tail = chronological
      .slice(-maxTail)
      .map((id) => String(id ?? '').trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const mostRecentFirst: string[] = [];
    for (let i = tail.length - 1; i >= 0; i--) {
      const id = tail[i]!;
      if (seen.has(id)) continue;
      seen.add(id);
      mostRecentFirst.push(id);
      if (mostRecentFirst.length >= maxUnique) break;
    }
    return mostRecentFirst.reverse();
  }

  /**
   * Preserve global session order while batching: weeks in first-appearance order,
   * each week split into slices of at most 7 training days.
   */
  private partitionSessionsForBatching(
    sessions: GenerateSessionsDto['sessions'],
  ): Array<{
    indices: number[];
    specs: GenerateSessionsDto['sessions'];
  }> {
    const weekOrder: number[] = [];
    const weekToIndices = new Map<number, number[]>();
    for (let i = 0; i < sessions.length; i++) {
      const w = sessions[i].weekIndex;
      if (!weekToIndices.has(w)) {
        weekToIndices.set(w, []);
        weekOrder.push(w);
      }
      weekToIndices.get(w)!.push(i);
    }
    const chunks: Array<{
      indices: number[];
      specs: GenerateSessionsDto['sessions'];
    }> = [];
    for (const weekIndex of weekOrder) {
      const indices = weekToIndices.get(weekIndex)!;
      for (
        let start = 0;
        start < indices.length;
        start += PlansService.GENERATE_SESSIONS_BATCH_SIZE
      ) {
        const slice = indices.slice(
          start,
          start + PlansService.GENERATE_SESSIONS_BATCH_SIZE,
        );
        chunks.push({
          indices: slice,
          specs: slice.map((idx) => sessions[idx]),
        });
      }
    }
    return chunks;
  }

  /** One JSON line per chunk for log aggregation (path, counts, no PII). */
  private logGenerateSessionsChunkEvent(payload: {
    path:
      | 'hybrid_ok'
      | 'hybrid_quality_fallback'
      | 'hybrid_rule_failed'
      | 'hybrid_bad_shape'
      | 'batch_ok'
      | 'per_session';
    sessionCount: number;
    weekMin: number;
    effectiveDetailLevel: 'simple' | 'detailed';
    makeItEasier: boolean;
    polishApplied?: boolean;
  }): void {
    this.logger.log(JSON.stringify({ event: 'generate_sessions_chunk', ...payload }));
  }

  /** After hybrid rule+polish: ensure each day meets the same min exercise counts as Groq prompts expect. */
  private hybridChunkPassesQualityGate(
    specs: GenerateSessionsDto['sessions'],
    sessions: GeneratedSession[],
  ): boolean {
    if (sessions.length !== specs.length) return false;
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]!;
      const session = sessions[i]!;
      const duration = Math.round((spec.durationMin + spec.durationMax) / 2);
      const isCardioOrRecovery =
        spec.type === 'cardio' || spec.type === 'recovery';
      const { minExercises } = exerciseTargetsForSession(
        duration,
        'simple',
        isCardioOrRecovery,
      );
      const count = (session.exercises ?? []).filter((e) =>
        String(e.name ?? '').trim(),
      ).length;
      if (count < minExercises) return false;
    }
    return true;
  }

  /**
   * Phase D (simple only): rule-based exercise selection per day, then one compact Groq JSON pass
   * for session titles and warm-up / cool-down / reasoning. On polish failure, returns rule-only copy.
   * Returns null if rule generation fails for any day so the caller can fall back to full Groq paths.
   */
  private async tryHybridSimpleChunk(
    specs: GenerateSessionsDto['sessions'],
    goal: string,
    location: 'gym' | 'home',
    limitations: string[],
    equipment: string[] | undefined,
    priorContextExerciseIds: string[],
  ): Promise<
    { sessions: GeneratedSession[]; polishApplied: boolean } | null
  > {
    const cappedPrior = [
      ...new Set(
        priorContextExerciseIds
          .map((id) => String(id ?? '').trim())
          .filter(Boolean),
      ),
    ].slice(-PlansService.PRIOR_CONTEXT_MAX_UNIQUE);

    const results: GeneratedSession[] = [];
    const usedExerciseIdsByWeek = new Map<number, string[]>();
    const polishDays: Array<{
      weekday: string;
      focusLabel: string;
      exerciseNames: string[];
    }> = [];

    for (const spec of specs) {
      const isHard = spec.isHardDay;
      const difficulty = isHard ? 'advanced' : 'intermediate';
      const duration = Math.round((spec.durationMin + spec.durationMax) / 2);
      const specLimits = spec.avoidConstraints?.length
        ? spec.avoidConstraints
        : limitations;
      const avoidPhrases = [
        ...new Set([...limitations, ...(spec.avoidConstraints ?? [])]),
      ].filter(Boolean);
      const alreadyUsedThisWeek =
        usedExerciseIdsByWeek.get(spec.weekIndex) ?? [];
      const excludeMerged = [
        ...new Set([...cappedPrior, ...alreadyUsedThisWeek]),
      ];

      let generated: Awaited<
        ReturnType<WorkoutGeneratorService['generateWorkout']>
      >;
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
            detailLevel: 'simple',
            excludeExerciseIds: excludeMerged.length
              ? excludeMerged
              : undefined,
            skipGroq: true,
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
              detailLevel: 'simple',
              excludeExerciseIds: excludeMerged.length
                ? excludeMerged
                : undefined,
              skipGroq: true,
            },
          });
        } catch {
          return null;
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
      polishDays.push({
        weekday: spec.weekday,
        focusLabel: (spec.title ?? spec.type ?? 'Session').trim(),
        exerciseNames: filteredExercises.map((e) => e.name).filter(Boolean),
      });
    }

    const apiKey = this.config.get<string>('GROQ_API_KEY')?.trim();
    if (!apiKey) return { sessions: results, polishApplied: false };

    const equipmentNote =
      location === 'home'
        ? equipment?.length
          ? equipment.join(', ')
          : 'home / bodyweight'
        : 'general gym equipment';

    const polish = await this.workoutGenerator.polishSimpleBatchSessionCopy(
      { goal, equipmentNote, days: polishDays },
      apiKey,
    );
    if (!polish || polish.length !== results.length) {
      return { sessions: results, polishApplied: false };
    }

    for (let i = 0; i < results.length; i++) {
      const p = polish[i]!;
      const s = results[i]!;
      s.name = p.name;
      if (p.reasoning !== undefined) s.reasoning = p.reasoning;
      if (p.warmUp !== undefined) s.warmUp = p.warmUp;
      if (p.coolDown !== undefined) s.coolDown = p.coolDown;
    }
    return { sessions: results, polishApplied: true };
  }

  private async generateSessionsForSpecChunk(
    specs: GenerateSessionsDto['sessions'],
    dto: GenerateSessionsDto,
    goal: string,
    location: 'gym' | 'home',
    detailLevel: 'simple' | 'detailed',
    makeItEasier: boolean,
    limitations: string[],
    equipment: string[] | undefined,
    /** Oldest→newest unique ids from recent picks (see `priorExerciseIdsOldestFirstAmongRecent`). */
    priorContextExerciseIds: string[],
  ): Promise<GeneratedSession[]> {
    const weekMin = Math.min(...specs.map((s) => s.weekIndex));
    /** Later preview weeks use the compact Groq style when the user chose detailed (tokens + truncation). */
    const effectiveDetailLevel =
      detailLevel === 'detailed' && weekMin >= 2 ? 'simple' : detailLevel;

    const cappedPrior = [
      ...new Set(
        priorContextExerciseIds
          .map((id) => String(id ?? '').trim())
          .filter(Boolean),
      ),
    ].slice(-PlansService.PRIOR_CONTEXT_MAX_UNIQUE);

    if (!makeItEasier && effectiveDetailLevel === 'simple') {
      const hybridResult = await this.tryHybridSimpleChunk(
        specs,
        goal,
        location,
        limitations,
        equipment,
        cappedPrior,
      );
      if (hybridResult === null) {
        this.logGenerateSessionsChunkEvent({
          path: 'hybrid_rule_failed',
          sessionCount: specs.length,
          weekMin,
          effectiveDetailLevel,
          makeItEasier,
        });
      } else if (hybridResult.sessions.length !== specs.length) {
        this.logGenerateSessionsChunkEvent({
          path: 'hybrid_bad_shape',
          sessionCount: specs.length,
          weekMin,
          effectiveDetailLevel,
          makeItEasier,
        });
      } else if (
        this.hybridChunkPassesQualityGate(specs, hybridResult.sessions)
      ) {
        this.logGenerateSessionsChunkEvent({
          path: 'hybrid_ok',
          sessionCount: specs.length,
          weekMin,
          effectiveDetailLevel,
          makeItEasier,
          polishApplied: hybridResult.polishApplied,
        });
        return hybridResult.sessions;
      } else {
        this.logGenerateSessionsChunkEvent({
          path: 'hybrid_quality_fallback',
          sessionCount: specs.length,
          weekMin,
          effectiveDetailLevel,
          makeItEasier,
          polishApplied: hybridResult.polishApplied,
        });
      }
    }

    const mapBatchToSessions = (
      fullProgram: NonNullable<
        Awaited<ReturnType<WorkoutGeneratorService['tryGenerateFullProgram']>>
      >,
    ): GeneratedSession[] =>
      fullProgram.map((session, i) => {
        const spec = specs[i];
        const avoidPhrases = [
          ...new Set([...limitations, ...(spec?.avoidConstraints ?? [])]),
        ].filter(Boolean);
        const filteredExercises = this.filterExercisesByAvoidList(
          session.exercises,
          avoidPhrases,
        );
        return {
          weekIndex: session.weekIndex,
          weekday: session.weekday,
          name: plainWorkoutTitle(
            session.name,
            (spec?.title ?? spec?.type ?? 'Session').trim(),
            spec?.weekday ?? '',
          ),
          reasoning: session.reasoning,
          warmUp: session.warmUp,
          coolDown: session.coolDown,
          cardioFinisher: session.cardioFinisher,
          exercises: filteredExercises,
        };
      });

    if (specs.length >= 2) {
      const fullProgram = await this.workoutGenerator.tryGenerateFullProgram({
        sessions: specs.map((s) => ({
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
        detailLevel: effectiveDetailLevel,
        makeItEasier,
        avoidConstraints: limitations,
        priorWeekExerciseIds: cappedPrior.length ? cappedPrior : undefined,
      });
      if (fullProgram && fullProgram.length === specs.length) {
        this.logGenerateSessionsChunkEvent({
          path: 'batch_ok',
          sessionCount: specs.length,
          weekMin,
          effectiveDetailLevel,
          makeItEasier,
        });
        return mapBatchToSessions(fullProgram);
      }
    }

    const results: GeneratedSession[] = [];
    const usedExerciseIdsByWeek = new Map<number, string[]>();

    for (const spec of specs) {
      const isHard = makeItEasier ? false : spec.isHardDay;
      const difficulty = makeItEasier
        ? 'beginner'
        : isHard
          ? 'advanced'
          : 'intermediate';
      const duration = Math.round((spec.durationMin + spec.durationMax) / 2);
      const specLimits = spec.avoidConstraints?.length
        ? spec.avoidConstraints
        : limitations;
      const avoidPhrases = [
        ...new Set([...limitations, ...(spec.avoidConstraints ?? [])]),
      ].filter(Boolean);
      const alreadyUsedThisWeek =
        usedExerciseIdsByWeek.get(spec.weekIndex) ?? [];
      const excludeMerged = [
        ...new Set([...cappedPrior, ...alreadyUsedThisWeek]),
      ];

      let generated: Awaited<
        ReturnType<WorkoutGeneratorService['generateWorkout']>
      >;
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
            detailLevel: effectiveDetailLevel,
            excludeExerciseIds: excludeMerged.length
              ? excludeMerged
              : undefined,
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
              detailLevel: effectiveDetailLevel,
              excludeExerciseIds: excludeMerged.length
                ? excludeMerged
                : undefined,
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

    this.logGenerateSessionsChunkEvent({
      path: 'per_session',
      sessionCount: specs.length,
      weekMin,
      effectiveDetailLevel,
      makeItEasier,
    });
    return results;
  }

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
      location === 'home' ? [...PlansService.HOME_EQUIPMENT] : undefined;

    const chunks = this.partitionSessionsForBatching(dto.sessions);
    const orderedResults: GeneratedSession[] = new Array(dto.sessions.length);
    /** Chronological exercise picks (repeats allowed) for true “recent usage” semantics. */
    let priorExerciseHistory: string[] = [];

    for (const chunk of chunks) {
      const priorContextIds = PlansService.priorExerciseIdsOldestFirstAmongRecent(
        priorExerciseHistory,
        PlansService.PRIOR_EXERCISE_HISTORY_MAX,
        PlansService.PRIOR_CONTEXT_MAX_UNIQUE,
      );
      const chunkResults = await this.generateSessionsForSpecChunk(
        chunk.specs,
        dto,
        goal,
        location,
        detailLevel,
        makeItEasier,
        limitations,
        equipment,
        priorContextIds,
      );
      if (chunkResults.length !== chunk.indices.length) {
        throw new HttpException(
          'Session generation produced an unexpected number of results.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      for (let j = 0; j < chunk.indices.length; j++) {
        orderedResults[chunk.indices[j]] = chunkResults[j];
      }
      for (const session of chunkResults) {
        for (const ex of session.exercises ?? []) {
          const id = ex.exerciseId?.trim();
          if (id) priorExerciseHistory.push(id);
        }
      }
      priorExerciseHistory = priorExerciseHistory.slice(
        -PlansService.PRIOR_EXERCISE_HISTORY_MAX,
      );
    }

    const enriched = await this.applySessionEnrichment(orderedResults, dto);
    return { sessions: enriched };
  }

  /** Validate / repair session lists: compound ordering, pull balance, warm-up tied to main lift. */
  private async applySessionEnrichment(
    sessions: GeneratedSession[],
    dto: GenerateSessionsDto,
  ): Promise<GeneratedSession[]> {
    const equipment =
      dto.location === 'home' ? [...PlansService.HOME_EQUIPMENT] : undefined;
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
    const equipment =
      location === 'home' ? [...PlansService.HOME_EQUIPMENT] : undefined;
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
        excludeExerciseNames: dto.excludeExerciseNames?.length
          ? dto.excludeExerciseNames
          : undefined,
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
    exercises: Array<{
      name: string;
      sets: number;
      reps: number;
      weight?: number;
      notes?: string;
      exerciseId?: string;
    }>,
    avoidPhrases: string[],
  ): typeof exercises {
    const lowerPhrases = avoidPhrases
      .map((p) => p.toLowerCase().trim())
      .filter((p) => p.length >= 2);
    if (lowerPhrases.length === 0) return exercises;
    return exercises.filter((e) => {
      const nameLower = (e.name ?? '').toLowerCase();
      const notesLower = (e.notes ?? '').toLowerCase();
      return !lowerPhrases.some(
        (p) => nameLower.includes(p) || notesLower.includes(p),
      );
    });
  }

  /**
   * Insert one plan_workout (+ optional exercises) and materialize linked Workout when exercises exist.
   * Caller must have already authorized access to `planId`.
   */
  private async appendPlanSlotCore(
    planId: string,
    orderSlots: Array<{
      weekNumber: number;
      dayOfWeek: string;
      orderInDay: number;
    }>,
    slot: PlanSlotDto,
    userId: string,
  ) {
    let orderInDay = slot.orderInDay ?? 0;
    if (slot.orderInDay === undefined || slot.orderInDay === null) {
      const sameDay = orderSlots.filter(
        (pw) =>
          pw.weekNumber === slot.weekNumber && pw.dayOfWeek === slot.dayOfWeek,
      );
      orderInDay =
        sameDay.length === 0
          ? 0
          : Math.max(...sameDay.map((s) => s.orderInDay)) + 1;
    }

    const created = await this.prisma.planWorkout.create({
      data: {
        workoutPlanId: planId,
        weekNumber: slot.weekNumber,
        dayOfWeek: slot.dayOfWeek,
        title: slot.title,
        detailLine: slot.detailLine ?? undefined,
        type: slot.type,
        durationMinutes: slot.durationMinutes,
        intensity: slot.intensity ?? undefined,
        orderInDay,
        exercises: slot.exercises?.length
          ? {
              create: slot.exercises.map((e, i) => ({
                exerciseId:
                  (e.exerciseId && String(e.exerciseId).trim()) ||
                  `applied_${slot.weekNumber}_${slot.dayOfWeek}_${i}`,
                name: e.name ?? null,
                sets: e.sets,
                reps: e.reps,
                weight: e.weight ?? null,
                notes: e.notes ?? null,
                orderIndex: e.orderIndex ?? i,
              })),
            }
          : undefined,
      },
      include: {
        exercises: { orderBy: { orderIndex: 'asc' as const } },
      },
    });

    if (created.exercises.length > 0) {
      await this.ensureWorkoutFromPlanSlotExercises(created, planId, userId);
    }

    return this.getById(planId, userId);
  }

  /**
   * Append a slot to the user's current plan (same resolution as GET /plans/me).
   * Prefer this over addSlot(planId) from the client so a wrong/stale id cannot 404.
   */
  async addSlotToCurrentPlan(userId: string, slot: PlanSlotDto) {
    const plan = await this.prisma.workoutPlan.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        planWorkouts: {
          select: { weekNumber: true, dayOfWeek: true, orderInDay: true },
        },
      },
    });
    if (!plan) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          code: 'NO_CURRENT_PLAN',
          message: 'No workout plan found for this account.',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    return this.appendPlanSlotCore(plan.id, plan.planWorkouts, slot, userId);
  }

  /**
   * Append a single plan slot (e.g. from exercise library). Does not delete or recreate other slots.
   * When exercises are included, creates the linked Workout row without running full-plan LLM passes.
   */
  async addSlot(planId: string, slot: PlanSlotDto, userId: string) {
    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id: planId },
      include: {
        planWorkouts: {
          select: { weekNumber: true, dayOfWeek: true, orderInDay: true },
        },
      },
    });
    if (!plan) throw new NotFoundException(`Plan with ID ${planId} not found`);
    if (plan.userId && plan.userId !== userId) {
      throw new NotFoundException(`Plan with ID ${planId} not found`);
    }

    return this.appendPlanSlotCore(
      plan.id,
      plan.planWorkouts,
      slot,
      userId,
    );
  }

  /** Remove a single slot from the plan. Unlinks the linked Workout if any. */
  async removeSlot(planId: string, slotId: string, userId: string) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[PlansService] removeSlot', { planId, slotId });
    }
    if (!slotId) {
      if (process.env.NODE_ENV !== 'production')
        console.warn('[PlansService] removeSlot: slotId is missing');
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
        console.warn('[PlansService] removeSlot: slot not in plan', {
          slotId,
          planSlotIds: plan.planWorkouts.map((pw) => pw.id),
        });
      }
      throw new NotFoundException(
        `Slot with ID ${slotId} not found in this plan`,
      );
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
