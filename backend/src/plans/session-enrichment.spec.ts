import { enrichGeneratedSession, type GeneratedSession } from './session-enrichment';

describe('enrichGeneratedSession prescriptionType', () => {
  it('uses library prescriptionType when exerciseId resolves', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Upper Strength',
      exercises: [
        { name: 'Custom Bracing Drill', sets: 3, reps: 10, exerciseId: 'hold_1' },
      ],
    };

    const exercisesService = {
      findOne: (id: string) => {
        if (id === 'hold_1') {
          return {
            id: 'hold_1',
            name: 'Custom Bracing Drill',
            prescriptionType: 'time' as const,
            movementPatterns: ['Push'],
            primaryMuscleGroup: 'Core',
          };
        }
        return undefined;
      },
      getCandidatesForGenerator: () => [],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper' },
      exercisesService as any,
      [],
      [],
    );

    expect(out.exercises[0]?.prescriptionType).toBe('time');
  });

  it('falls back to name inference when exerciseId is missing', async () => {
    const session: GeneratedSession = {
      weekIndex: 1,
      weekday: 'Monday',
      name: 'Grip Strength',
      exercises: [{ name: 'Dead Hang', sets: 4, reps: 30 }],
    };

    const exercisesService = {
      findOne: () => undefined,
      getCandidatesForGenerator: () => [],
    };

    const out = await enrichGeneratedSession(
      session,
      { type: 'strength', title: 'Upper Pull' },
      exercisesService as any,
      [],
      [],
    );

    expect(out.exercises[0]?.prescriptionType).toBe('time');
  });
});
