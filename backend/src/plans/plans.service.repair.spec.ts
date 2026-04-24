import { HttpException } from '@nestjs/common';
import { PlansService } from './plans.service';
import type { RepairProgramSessionsDto } from './dto/repair-program-sessions.dto';
import type { GeneratedSession } from './session-enrichment';

type RepairLibraryRow = {
  id: string;
  name: string;
  movementPatterns?: string[];
  primaryMuscleGroup?: string;
};

function buildExercisesMock(rows: RepairLibraryRow[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    findOne: jest.fn((id: string) => byId.get(id)),
    getCandidatesForGenerator: jest.fn(({ excludeIds }: { excludeIds?: string[] }) => {
      const ex = new Set(excludeIds ?? []);
      return rows.filter((r) => !ex.has(r.id));
    }),
    candidatesForChunkRepairScavenge: jest.fn((excludeIds: string[]) => {
      const ex = new Set(excludeIds ?? []);
      return rows.filter((r) => !ex.has(r.id));
    }),
  };
}

describe('PlansService.repairProgramSessions', () => {
  it('throws BAD_REQUEST when sessions and generatedSessions lengths differ', async () => {
    const exercises = buildExercisesMock([]);
    const service = new PlansService(
      {} as never,
      {} as never,
      exercises as never,
      {} as never,
    );

    const dto: RepairProgramSessionsDto = {
      goal: 'strength',
      location: 'gym',
      detailLevel: 'simple',
      sessions: [
        {
          type: 'strength',
          title: 'Upper',
          durationMin: 45,
          durationMax: 60,
          isHardDay: false,
          weekIndex: 1,
          weekday: 'Monday',
        },
      ],
      generatedSessions: [],
    };

    await expect(service.repairProgramSessions(dto)).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('repairs duplicate ids and returns generation notes', async () => {
    const exercises = buildExercisesMock([
      {
        id: 'dup-a',
        name: 'Bench Press',
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Chest',
      },
      {
        id: 'alt-push',
        name: 'Incline Dumbbell Press',
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Chest',
      },
    ]);
    const service = new PlansService(
      {} as never,
      {} as never,
      exercises as never,
      {} as never,
    );

    jest
      .spyOn(service as any, 'applySessionEnrichment')
      .mockImplementation(async (sessions: GeneratedSession[]) => sessions);

    const dto: RepairProgramSessionsDto = {
      goal: 'strength',
      location: 'gym',
      detailLevel: 'simple',
      sessions: [
        {
          type: 'strength',
          title: 'Upper',
          durationMin: 45,
          durationMax: 60,
          isHardDay: false,
          weekIndex: 1,
          weekday: 'Monday',
        },
        {
          type: 'strength',
          title: 'Push',
          durationMin: 45,
          durationMax: 60,
          isHardDay: false,
          weekIndex: 1,
          weekday: 'Tuesday',
        },
      ],
      generatedSessions: [
        {
          weekIndex: 1,
          weekday: 'Monday',
          name: 'Upper',
          exercises: [{ name: 'Bench Press', sets: 3, reps: 8, exerciseId: 'dup-a' }],
        },
        {
          weekIndex: 1,
          weekday: 'Tuesday',
          name: 'Push',
          exercises: [{ name: 'Bench Press', sets: 3, reps: 8, exerciseId: 'dup-a' }],
        },
      ],
    };

    const out = await service.repairProgramSessions(dto);
    expect(out.sessions[0]?.exercises?.[0]?.exerciseId).toBe('dup-a');
    expect(out.sessions[1]?.exercises?.[0]?.exerciseId).toBe('alt-push');
    expect(out.generationNotes?.some((n) => /repeated exercise/i.test(n))).toBe(
      true,
    );
  });
});
