import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

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

    await this.createWorkoutsForPlan(plan.id);
    return this.getById(plan.id, userId);
  }

  /** Create a Workout for each PlanWorkout in week 1 so weekly/today flow has one per day. */
  private async createWorkoutsForPlan(workoutPlanId: string) {
    const plan = await this.prisma.workoutPlan.findUnique({
      where: { id: workoutPlanId },
      include: { planWorkouts: true },
    });
    if (!plan) return;

    const userId = plan.userId ?? undefined;
    for (const pw of plan.planWorkouts) {
      if (pw.weekNumber !== 1) continue;
      await this.prisma.workout.create({
        data: {
          name: pw.title,
          day: pw.dayOfWeek,
          estimatedDuration: pw.durationMinutes,
          focus: pw.detailLine ?? undefined,
          workoutPlanId,
          planWorkoutId: pw.id,
          userId,
        },
      });
    }
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

    await this.createWorkoutsForPlan(plan.id);
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
