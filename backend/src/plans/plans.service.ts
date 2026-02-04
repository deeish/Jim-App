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
}
