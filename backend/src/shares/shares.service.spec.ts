import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { SharesService } from './shares.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from '../plans/plans.service';
import { SHARE_CODE_ALPHABET } from './share-code';

const OWNER = 'owner-1';
const RECIPIENT = 'recipient-1';
const CODE = 'ABCDEFGH';

const future = () => new Date(Date.now() + 7 * 86400000);
const past = () => new Date(Date.now() - 1000);

function uniqueError(): Error & { code: string } {
  const err = new Error('Unique constraint failed') as Error & {
    code: string;
  };
  err.code = 'P2002';
  return err;
}

function makePlanTree(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    userId: OWNER,
    name: 'Push Pull Legs',
    weekAnchorMonday: new Date('2026-07-13T12:00:00.000Z'),
    isActive: true,
    planWorkouts: [
      {
        id: 'pw-1',
        weekNumber: 1,
        dayOfWeek: 'Monday',
        title: 'Push Day',
        detailLine: '5 exercises',
        type: 'strength',
        durationMinutes: 60,
        intensity: 'Medium',
        orderInDay: 0,
        exercises: [
          {
            id: 'pe-1',
            exerciseId: 'bench_press_barbell_flat',
            name: 'Bench Press',
            sets: 4,
            reps: 6,
            repsMin: 6,
            repsMax: 10,
            durationSeconds: null,
            prescriptionType: 'reps',
            weight: 135,
            notes: 'Pause on chest',
            orderIndex: 0,
          },
          {
            id: 'pe-2',
            exerciseId: 'plank',
            name: 'Plank',
            sets: 3,
            reps: 1,
            repsMin: null,
            repsMax: null,
            durationSeconds: 45,
            prescriptionType: 'weird-value',
            weight: null,
            notes: null,
            orderIndex: 1,
          },
        ],
      },
      {
        // Slot with no plan_exercises: must backfill from materialized workout.
        id: 'pw-2',
        weekNumber: 2,
        dayOfWeek: 'Wednesday',
        title: 'Cardio',
        detailLine: null,
        type: 'cardio',
        durationMinutes: 30,
        intensity: null,
        orderInDay: 0,
        exercises: [],
      },
    ],
    workouts: [
      {
        id: 'w-materialized',
        planWorkoutId: 'pw-2',
        exercises: [
          {
            id: 'we-2',
            exerciseId: null,
            name: 'Treadmill Run',
            sets: 1,
            reps: 1,
            repsMin: null,
            repsMax: null,
            durationSeconds: 900,
            prescriptionType: 'time',
            weight: null,
            notes: null,
            orderIndex: 1,
          },
          {
            id: 'we-1',
            exerciseId: 'jump_rope',
            name: 'Jump Rope',
            sets: 1,
            reps: 1,
            repsMin: null,
            repsMax: null,
            durationSeconds: 300,
            prescriptionType: 'time',
            weight: null,
            notes: null,
            orderIndex: 0,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeWorkoutTree(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workout-1',
    userId: OWNER,
    name: 'Heavy Upper',
    day: 'Friday',
    estimatedDuration: 55,
    focus: 'Chest and back',
    reasoning: 'Because Friday',
    warmUp: 'Band pull-aparts',
    coolDown: 'Doorway stretch',
    exercises: [
      {
        id: 'we-10',
        exerciseId: 'row_barbell',
        name: 'Barbell Row',
        sets: 4,
        reps: 8,
        repsMin: 8,
        repsMax: 12,
        durationSeconds: null,
        prescriptionType: 'reps',
        weight: 115,
        notes: 'Strict form',
        orderIndex: 1,
      },
      {
        id: 'we-11',
        exerciseId: 'bench_press_barbell_flat',
        name: 'Bench Press',
        sets: 5,
        reps: 5,
        repsMin: null,
        repsMax: null,
        durationSeconds: null,
        prescriptionType: null,
        weight: 155,
        notes: null,
        orderIndex: 0,
      },
    ],
    ...overrides,
  };
}

function makeShare(overrides: Record<string, unknown> = {}) {
  return {
    id: 'share-1',
    code: CODE,
    kind: 'plan',
    ownerUserId: OWNER,
    senderName: 'Dylan',
    planId: 'plan-1',
    workoutId: null,
    createdAt: new Date(),
    expiresAt: future(),
    revokedAt: null,
    owner: { id: OWNER, email: 'dylan@example.com', name: null },
    redemptions: [],
    plan: makePlanTree(),
    workout: null,
    ...overrides,
  };
}

describe('SharesService', () => {
  let service: SharesService;

  const prismaMock = {
    share: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    shareRedemption: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    workoutPlan: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    workout: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const txMock = {
    workout: { create: jest.fn() },
    savedWorkout: { create: jest.fn() },
    shareRedemption: { create: jest.fn(), update: jest.fn() },
  };

  const plansServiceMock = {
    getCurrent: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (tx: typeof txMock) => Promise<unknown>)(txMock),
    );
    const module = await Test.createTestingModule({
      providers: [
        SharesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PlansService, useValue: plansServiceMock },
      ],
    }).compile();
    service = module.get(SharesService);
  });

  // ---------------------------------------------------------------------------
  // createShare
  // ---------------------------------------------------------------------------

  describe('createShare', () => {
    it('404s when the plan is missing or owned by someone else', async () => {
      prismaMock.workoutPlan.findUnique.mockResolvedValue(null);
      await expect(
        service.createShare({ kind: 'plan', targetId: 'nope' }, OWNER),
      ).rejects.toBeInstanceOf(NotFoundException);

      prismaMock.workoutPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        userId: 'someone-else',
        planWorkouts: [{ id: 'pw-1' }],
      });
      await expect(
        service.createShare({ kind: 'plan', targetId: 'plan-1' }, OWNER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('400s when the plan has no slots', async () => {
      prismaMock.workoutPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        userId: OWNER,
        planWorkouts: [],
      });
      await expect(
        service.createShare({ kind: 'plan', targetId: 'plan-1' }, OWNER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a workout owned only via its plan links (null userId)', async () => {
      prismaMock.workout.findUnique.mockResolvedValue({
        id: 'workout-1',
        userId: null,
        exercises: [{ id: 'we-1' }],
        workoutPlan: null,
        planWorkout: { workoutPlan: { userId: OWNER } },
      });
      prismaMock.share.findFirst.mockResolvedValue(null);
      prismaMock.share.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: 'share-9' }),
      );

      const result = await service.createShare(
        { kind: 'workout', targetId: 'workout-1' },
        OWNER,
      );
      expect(result.code).toHaveLength(8);
      expect(prismaMock.share.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'workout',
            workoutId: 'workout-1',
            ownerUserId: OWNER,
          }),
        }),
      );
    });

    it('400s when the workout has no exercises', async () => {
      prismaMock.workout.findUnique.mockResolvedValue({
        id: 'workout-1',
        userId: OWNER,
        exercises: [],
        workoutPlan: null,
        planWorkout: null,
      });
      await expect(
        service.createShare({ kind: 'workout', targetId: 'workout-1' }, OWNER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reuses an existing live share instead of minting a new code', async () => {
      prismaMock.workoutPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        userId: OWNER,
        planWorkouts: [{ id: 'pw-1' }],
      });
      const expiresAt = future();
      prismaMock.share.findFirst.mockResolvedValue({
        id: 'share-1',
        code: CODE,
        senderName: 'Dylan',
        expiresAt,
      });

      const result = await service.createShare(
        { kind: 'plan', targetId: 'plan-1', senderName: 'Dylan' },
        OWNER,
      );
      expect(result).toEqual({ code: CODE, expiresAt });
      expect(prismaMock.share.create).not.toHaveBeenCalled();
      expect(prismaMock.share.update).not.toHaveBeenCalled();
    });

    it('updates senderName on reuse when it changed', async () => {
      prismaMock.workoutPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        userId: OWNER,
        planWorkouts: [{ id: 'pw-1' }],
      });
      prismaMock.share.findFirst.mockResolvedValue({
        id: 'share-1',
        code: CODE,
        senderName: 'Old Name',
        expiresAt: future(),
      });

      await service.createShare(
        { kind: 'plan', targetId: 'plan-1', senderName: '  Dylan  ' },
        OWNER,
      );
      expect(prismaMock.share.update).toHaveBeenCalledWith({
        where: { id: 'share-1' },
        data: { senderName: 'Dylan' },
      });
    });

    it('creates a fresh share with a valid code and 30-day expiry', async () => {
      prismaMock.workoutPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        userId: OWNER,
        planWorkouts: [{ id: 'pw-1' }],
      });
      prismaMock.share.findFirst.mockResolvedValue(null);
      prismaMock.share.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: 'share-9' }),
      );

      const before = Date.now();
      const result = await service.createShare(
        { kind: 'plan', targetId: 'plan-1' },
        OWNER,
      );
      for (const ch of result.code) {
        expect(SHARE_CODE_ALPHABET).toContain(ch);
      }
      const ttlDays =
        (result.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
      expect(ttlDays).toBeGreaterThan(29.9);
      expect(ttlDays).toBeLessThanOrEqual(30.1);
    });

    it('retries with a fresh code on a P2002 collision', async () => {
      prismaMock.workoutPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        userId: OWNER,
        planWorkouts: [{ id: 'pw-1' }],
      });
      prismaMock.share.findFirst.mockResolvedValue(null);
      prismaMock.share.create
        .mockRejectedValueOnce(uniqueError())
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...data, id: 'share-9' }),
        );

      const result = await service.createShare(
        { kind: 'plan', targetId: 'plan-1' },
        OWNER,
      );
      expect(result.code).toHaveLength(8);
      expect(prismaMock.share.create).toHaveBeenCalledTimes(2);
      const [first, second] = prismaMock.share.create.mock.calls;
      expect(first[0].data.code).not.toBe(second[0].data.code);
    });
  });

  // ---------------------------------------------------------------------------
  // getByCode
  // ---------------------------------------------------------------------------

  describe('getByCode', () => {
    it('400s on malformed codes without touching the database', async () => {
      await expect(service.getByCode('nope', RECIPIENT)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaMock.share.findUnique).not.toHaveBeenCalled();
    });

    it('404s on unknown codes', async () => {
      prismaMock.share.findUnique.mockResolvedValue(null);
      await expect(service.getByCode(CODE, RECIPIENT)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('normalizes dashed lowercase input before lookup', async () => {
      prismaMock.share.findUnique.mockResolvedValue(null);
      await expect(
        service.getByCode('abcd-efgh', RECIPIENT),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.share.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: CODE } }),
      );
    });

    it('410s when expired, revoked, or the target row is gone', async () => {
      prismaMock.share.findUnique.mockResolvedValue(
        makeShare({ expiresAt: past() }),
      );
      await expect(service.getByCode(CODE, RECIPIENT)).rejects.toBeInstanceOf(
        GoneException,
      );

      prismaMock.share.findUnique.mockResolvedValue(
        makeShare({ revokedAt: new Date() }),
      );
      await expect(service.getByCode(CODE, RECIPIENT)).rejects.toBeInstanceOf(
        GoneException,
      );

      prismaMock.share.findUnique.mockResolvedValue(makeShare({ plan: null }));
      await expect(service.getByCode(CODE, RECIPIENT)).rejects.toBeInstanceOf(
        GoneException,
      );
    });

    it('builds the plan preview with week count, backfilled slots, and flags', async () => {
      prismaMock.share.findUnique.mockResolvedValue(makeShare());
      plansServiceMock.getCurrent.mockResolvedValue({ name: 'Old Plan' });

      const preview = await service.getByCode(CODE, RECIPIENT);
      expect(preview.kind).toBe('plan');
      expect(preview.sharedByName).toBe('Dylan');
      expect(preview.isOwnShare).toBe(false);
      expect(preview.alreadyRedeemed).toBe(false);
      expect(preview.recipientActivePlanName).toBe('Old Plan');
      expect(preview.plan?.name).toBe('Push Pull Legs');
      expect(preview.plan?.weekCount).toBe(2);
      expect(preview.plan?.slots).toHaveLength(2);
      // Slot with plan_exercises uses them directly.
      expect(preview.plan?.slots[0].exerciseCount).toBe(2);
      // Empty slot backfills from the materialized workout, sorted by orderIndex.
      expect(preview.plan?.slots[1].exerciseCount).toBe(2);
      expect(preview.plan?.slots[1].exercises[0].name).toBe('Jump Rope');
      expect(preview.plan?.slots[1].exercises[1].durationSeconds).toBe(900);
    });

    it('falls back through the sharedByName chain', async () => {
      prismaMock.share.findUnique.mockResolvedValue(
        makeShare({ senderName: null }),
      );
      plansServiceMock.getCurrent.mockResolvedValue(null);
      let preview = await service.getByCode(CODE, RECIPIENT);
      expect(preview.sharedByName).toBe('dylan');
      expect(preview.recipientActivePlanName).toBeNull();

      prismaMock.share.findUnique.mockResolvedValue(
        makeShare({
          senderName: null,
          owner: { id: OWNER, email: null, name: null },
        }),
      );
      preview = await service.getByCode(CODE, RECIPIENT);
      expect(preview.sharedByName).toBe('A friend');
    });

    it('marks isOwnShare for the sharer', async () => {
      prismaMock.share.findUnique.mockResolvedValue(makeShare());
      plansServiceMock.getCurrent.mockResolvedValue(null);
      const preview = await service.getByCode(CODE, OWNER);
      expect(preview.isOwnShare).toBe(true);
    });

    it('reports alreadyRedeemed only while the clone still exists', async () => {
      const redemption = {
        id: 'red-1',
        shareId: 'share-1',
        userId: RECIPIENT,
        clonedPlanId: 'clone-1',
        clonedWorkoutId: null,
      };
      prismaMock.share.findUnique.mockResolvedValue(
        makeShare({ redemptions: [redemption] }),
      );
      plansServiceMock.getCurrent.mockResolvedValue(null);

      prismaMock.workoutPlan.findUnique.mockResolvedValue({
        id: 'clone-1',
        userId: RECIPIENT,
      });
      let preview = await service.getByCode(CODE, RECIPIENT);
      expect(preview.alreadyRedeemed).toBe(true);
      expect(preview.redeemedPlanId).toBe('clone-1');

      prismaMock.workoutPlan.findUnique.mockResolvedValue(null);
      preview = await service.getByCode(CODE, RECIPIENT);
      expect(preview.alreadyRedeemed).toBe(false);
    });

    it('orders plan preview slots by real weekday order, not alphabetically', async () => {
      const plan = makePlanTree();
      const pushSlot = plan.planWorkouts[0] as Record<string, unknown>;
      plan.planWorkouts = [
        { ...pushSlot, id: 'pw-f', weekNumber: 1, dayOfWeek: 'Friday' },
        { ...pushSlot, id: 'pw-m', weekNumber: 1, dayOfWeek: 'Monday' },
      ] as typeof plan.planWorkouts;
      prismaMock.share.findUnique.mockResolvedValue(makeShare({ plan }));
      plansServiceMock.getCurrent.mockResolvedValue(null);

      const preview = await service.getByCode(CODE, RECIPIENT);
      expect(preview.plan?.slots.map((s) => s.dayOfWeek)).toEqual([
        'Monday',
        'Friday',
      ]);
    });

    it('builds the workout preview with exercises sorted by orderIndex', async () => {
      prismaMock.share.findUnique.mockResolvedValue(
        makeShare({
          kind: 'workout',
          planId: null,
          workoutId: 'workout-1',
          plan: null,
          workout: makeWorkoutTree(),
        }),
      );
      const preview = await service.getByCode(CODE, RECIPIENT);
      expect(preview.kind).toBe('workout');
      expect(preview.recipientActivePlanName).toBeUndefined();
      expect(preview.workout?.name).toBe('Heavy Upper');
      expect(preview.workout?.exercises[0].name).toBe('Bench Press');
      expect(preview.workout?.exercises[1].repsMin).toBe(8);
    });
  });

  // ---------------------------------------------------------------------------
  // accept
  // ---------------------------------------------------------------------------

  describe('accept', () => {
    it('400s when accepting your own share', async () => {
      prismaMock.share.findUnique.mockResolvedValue(makeShare());
      await expect(service.accept(CODE, OWNER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(plansServiceMock.create).not.toHaveBeenCalled();
    });

    it('returns the existing clone when already redeemed', async () => {
      const redemption = {
        id: 'red-1',
        shareId: 'share-1',
        userId: RECIPIENT,
        clonedPlanId: 'clone-1',
        clonedWorkoutId: null,
      };
      prismaMock.share.findUnique.mockResolvedValue(
        makeShare({ redemptions: [redemption] }),
      );
      prismaMock.workoutPlan.findUnique.mockResolvedValue({
        id: 'clone-1',
        userId: RECIPIENT,
      });

      const result = await service.accept(CODE, RECIPIENT);
      expect(result).toEqual({
        kind: 'plan',
        planId: 'clone-1',
        workoutId: undefined,
        alreadyRedeemed: true,
      });
      expect(plansServiceMock.create).not.toHaveBeenCalled();
    });

    it('clones a plan through PlansService.create with a faithful DTO', async () => {
      prismaMock.share.findUnique.mockResolvedValue(makeShare());
      plansServiceMock.create.mockResolvedValue({ id: 'clone-1' });
      prismaMock.shareRedemption.create.mockResolvedValue({ id: 'red-1' });

      const result = await service.accept(CODE, RECIPIENT);
      expect(result).toEqual({
        kind: 'plan',
        planId: 'clone-1',
        alreadyRedeemed: false,
      });

      expect(plansServiceMock.create).toHaveBeenCalledTimes(1);
      const [dto, userId] = plansServiceMock.create.mock.calls[0];
      expect(userId).toBe(RECIPIENT);
      expect(dto.name).toBe('Push Pull Legs');
      expect(dto.weekAnchorMonday).toBeUndefined();

      const push = dto.slots[0];
      expect(push).toMatchObject({
        weekNumber: 1,
        dayOfWeek: 'Monday',
        title: 'Push Day',
        detailLine: '5 exercises',
        type: 'strength',
        durationMinutes: 60,
        intensity: 'Medium',
        orderInDay: 0,
      });
      expect(push.exercises[0]).toEqual({
        exerciseId: 'bench_press_barbell_flat',
        name: 'Bench Press',
        sets: 4,
        reps: 6,
        repsMin: 6,
        repsMax: 10,
        durationSeconds: undefined,
        prescriptionType: 'reps',
        weight: 135,
        notes: 'Pause on chest',
        orderIndex: 0,
      });
      // Free-text prescriptionType outside the DTO union is dropped.
      expect(push.exercises[1].prescriptionType).toBeUndefined();
      expect(push.exercises[1].durationSeconds).toBe(45);

      // Empty slot backfilled from the materialized workout (sorted, null id -> '').
      const cardio = dto.slots[1];
      expect(cardio.exercises).toHaveLength(2);
      expect(cardio.exercises[0]).toMatchObject({
        exerciseId: 'jump_rope',
        name: 'Jump Rope',
        durationSeconds: 300,
        prescriptionType: 'time',
      });
      expect(cardio.exercises[1].exerciseId).toBe('');

      expect(prismaMock.shareRedemption.create).toHaveBeenCalledWith({
        data: {
          shareId: 'share-1',
          userId: RECIPIENT,
          clonedPlanId: 'clone-1',
        },
      });
    });

    it('returns success when redemption bookkeeping fails after the plan clone', async () => {
      prismaMock.share.findUnique.mockResolvedValue(makeShare());
      plansServiceMock.create.mockResolvedValue({ id: 'clone-1' });
      prismaMock.shareRedemption.create.mockRejectedValue(
        new Error('db hiccup'),
      );
      const warnSpy = jest
        .spyOn(
          (service as unknown as { logger: { warn: (m: string) => void } })
            .logger,
          'warn',
        )
        .mockImplementation(() => {});

      const result = await service.accept(CODE, RECIPIENT);
      expect(result).toEqual({
        kind: 'plan',
        planId: 'clone-1',
        alreadyRedeemed: false,
      });
      expect(warnSpy).toHaveBeenCalled();
      // The clone must NOT be rolled back over bookkeeping.
      expect(prismaMock.workoutPlan.delete).not.toHaveBeenCalled();
    });

    it('heals the plan double-accept race: deletes the loser clone and re-activates the winner', async () => {
      prismaMock.share.findUnique.mockResolvedValue(makeShare());
      plansServiceMock.create.mockResolvedValue({ id: 'loser-clone' });
      prismaMock.shareRedemption.create.mockRejectedValue(uniqueError());
      prismaMock.shareRedemption.findUnique.mockResolvedValue({
        id: 'red-1',
        clonedPlanId: 'winner-clone',
        clonedWorkoutId: null,
      });

      const result = await service.accept(CODE, RECIPIENT);
      expect(result).toEqual({
        kind: 'plan',
        planId: 'winner-clone',
        alreadyRedeemed: true,
      });
      expect(prismaMock.workout.deleteMany).toHaveBeenCalledWith({
        where: { workoutPlanId: 'loser-clone', userId: RECIPIENT },
      });
      expect(prismaMock.workoutPlan.delete).toHaveBeenCalledWith({
        where: { id: 'loser-clone' },
      });
      expect(prismaMock.workoutPlan.updateMany).toHaveBeenCalledWith({
        where: { id: 'winner-clone', userId: RECIPIENT },
        data: { isActive: true },
      });
    });

    it('re-clones and updates the redemption when the earlier clone was deleted', async () => {
      const redemption = {
        id: 'red-1',
        shareId: 'share-1',
        userId: RECIPIENT,
        clonedPlanId: 'deleted-clone',
        clonedWorkoutId: null,
      };
      prismaMock.share.findUnique.mockResolvedValue(
        makeShare({ redemptions: [redemption] }),
      );
      prismaMock.workoutPlan.findUnique.mockResolvedValue(null); // clone gone
      plansServiceMock.create.mockResolvedValue({ id: 'clone-2' });

      const result = await service.accept(CODE, RECIPIENT);
      expect(result).toEqual({
        kind: 'plan',
        planId: 'clone-2',
        alreadyRedeemed: false,
      });
      expect(prismaMock.shareRedemption.update).toHaveBeenCalledWith({
        where: { id: 'red-1' },
        data: { clonedPlanId: 'clone-2', clonedWorkoutId: null },
      });
    });

    it('clones a workout with every column, auto-saves it, and records the redemption in one transaction', async () => {
      prismaMock.share.findUnique.mockResolvedValue(
        makeShare({
          kind: 'workout',
          planId: null,
          workoutId: 'workout-1',
          plan: null,
          workout: makeWorkoutTree(),
        }),
      );
      txMock.workout.create.mockResolvedValue({ id: 'wclone-1' });

      const result = await service.accept(CODE, RECIPIENT);
      expect(result).toEqual({
        kind: 'workout',
        workoutId: 'wclone-1',
        alreadyRedeemed: false,
      });

      const createArg = txMock.workout.create.mock.calls[0][0];
      expect(createArg.data).toMatchObject({
        name: 'Heavy Upper',
        day: 'Friday',
        estimatedDuration: 55,
        focus: 'Chest and back',
        reasoning: 'Because Friday',
        warmUp: 'Band pull-aparts',
        coolDown: 'Doorway stretch',
        userId: RECIPIENT,
      });
      expect(createArg.data.workoutPlanId).toBeUndefined();
      expect(createArg.data.planWorkoutId).toBeUndefined();
      // Sorted by source orderIndex, then re-numbered.
      const rows = createArg.data.exercises.create;
      expect(rows[0]).toMatchObject({
        name: 'Bench Press',
        sets: 5,
        reps: 5,
        weight: 155,
        orderIndex: 0,
      });
      expect(rows[1]).toMatchObject({
        name: 'Barbell Row',
        repsMin: 8,
        repsMax: 12,
        prescriptionType: 'reps',
        notes: 'Strict form',
        orderIndex: 1,
      });

      expect(txMock.savedWorkout.create).toHaveBeenCalledWith({
        data: { userId: RECIPIENT, workoutId: 'wclone-1' },
      });
      expect(txMock.shareRedemption.create).toHaveBeenCalledWith({
        data: {
          shareId: 'share-1',
          userId: RECIPIENT,
          clonedWorkoutId: 'wclone-1',
        },
      });
    });

    it('returns the winner when the workout double-accept race rolls back', async () => {
      prismaMock.share.findUnique.mockResolvedValue(
        makeShare({
          kind: 'workout',
          planId: null,
          workoutId: 'workout-1',
          plan: null,
          workout: makeWorkoutTree(),
        }),
      );
      prismaMock.$transaction.mockRejectedValue(uniqueError());
      prismaMock.shareRedemption.findUnique.mockResolvedValue({
        id: 'red-1',
        clonedPlanId: null,
        clonedWorkoutId: 'winner-workout',
      });

      const result = await service.accept(CODE, RECIPIENT);
      expect(result).toEqual({
        kind: 'workout',
        workoutId: 'winner-workout',
        alreadyRedeemed: true,
      });
    });
  });
});
