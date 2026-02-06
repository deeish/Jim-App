import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkoutGeneratorService } from '../workouts/workout-generator.service';
import { CreatePlanDto } from './dto/create-plan.dto';

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
