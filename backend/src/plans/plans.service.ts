import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkoutGeneratorService } from '../workouts/workout-generator.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { GenerateSessionsDto } from './dto/generate-sessions.dto';
import { GenerateSingleSessionDto } from './dto/generate-single-session.dto';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workoutGenerator: WorkoutGeneratorService,
  ) {}

  /** Current plan = most recently updated plan for this user. */
  async getCurrent(userId: string) {
    const plan = await this.prisma.workoutPlan.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        planWorkouts: {
          orderBy: [{ weekNumber: 'asc' }, { dayOfWeek: 'asc' }, { orderInDay: 'asc' }],
        },
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
        planWorkouts: {
          orderBy: [{ weekNumber: 'asc' }, { dayOfWeek: 'asc' }, { orderInDay: 'asc' }],
        },
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
        planWorkouts: {
          orderBy: [{ weekNumber: 'asc' }, { dayOfWeek: 'asc' }, { orderInDay: 'asc' }],
        },
      },
    });
    if (!plan) throw new NotFoundException(`Plan with ID ${id} not found`);
    if (plan.userId && plan.userId !== userId) {
      throw new NotFoundException(`Plan with ID ${id} not found`);
    }
    return plan;
  }

  async create(dto: CreatePlanDto, userId: string) {
    const name = dto.name ?? `Plan ${new Date().toLocaleDateString()}`;

    const plan = await this.prisma.workoutPlan.create({
      data: {
        name,
        userId,
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
          })),
        },
      },
      include: {
        planWorkouts: {
          orderBy: [{ weekNumber: 'asc' }, { dayOfWeek: 'asc' }, { orderInDay: 'asc' }],
        },
      },
    });

    await this.createWorkoutsForPlan(plan.id, userId, this.getGeneratorContextFromDto(dto));
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

  /** Create a Workout for each PlanWorkout in week 1 (only for today and future days), with exercises from Groq (or rule-based fallback). */
  private async createWorkoutsForPlan(
    workoutPlanId: string,
    userId?: string,
    generatorContext?: { goal?: string; experience?: string; equipment?: string[]; limitations?: string[]; programTemplateId?: string },
  ) {
    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id: workoutPlanId },
      include: { planWorkouts: true },
    });
    if (!plan) return;

    const uid = userId ?? plan.userId ?? undefined;
    for (const pw of plan.planWorkouts) {
      if (pw.weekNumber !== 1) continue;
      if (!this.isDayTodayOrFuture(pw.dayOfWeek)) continue;

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
          })),
        },
      },
      include: {
        planWorkouts: {
          orderBy: [{ weekNumber: 'asc' }, { dayOfWeek: 'asc' }, { orderInDay: 'asc' }],
        },
      },
    });

    await this.createWorkoutsForPlan(plan.id, userId, this.getGeneratorContextFromDto(dto));
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
    return { sessions: results };
  }

  async generateSingleSession(dto: GenerateSingleSessionDto) {
    const goal = dto.goal ?? 'strength';
    const location = dto.location ?? 'gym';
    const equipment = location === 'home' ? [...PlansService.HOME_EQUIPMENT] : undefined;
    const limitations = dto.avoidConstraints ?? [];
    const difficulty = dto.isHardDay ? 'advanced' : 'intermediate';
    const duration = Math.round((dto.durationMin + dto.durationMax) / 2);
    const avoidPhrases = (dto.avoidConstraints ?? []).filter((p) => p.trim().length >= 2);

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

    return {
      weekIndex: dto.weekIndex,
      weekday: dto.weekday,
      name: generated.name,
      reasoning: generated.reasoning,
      warmUp: generated.warmUp,
      coolDown: generated.coolDown,
      exercises: filteredExercises,
    };
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
