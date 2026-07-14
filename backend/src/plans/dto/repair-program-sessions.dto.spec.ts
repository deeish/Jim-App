import { ValidationPipe } from '@nestjs/common';
import { RepairProgramSessionsDto } from './repair-program-sessions.dto';

/**
 * The client spreads its full generate request into the repair body
 * (`{...buildGenerateSessionsRequest(...), generatedSessions}`), and main.ts
 * runs ValidationPipe with `forbidNonWhitelisted`. Every generate-request
 * field the client can send must therefore be whitelisted here — a missing
 * field 400s the WHOLE request and the client silently skips repair (live:
 * `experienceLevel` + `mesoHint` did exactly that).
 */
describe('RepairProgramSessionsDto validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const realisticClientBody = {
    goal: 'strength',
    secondaryGoal: 'hybrid',
    location: 'gym',
    detailLevel: 'detailed',
    makeItEasier: false,
    restrictions: 'recovering from a knee tweak',
    sessions: [
      {
        type: 'strength',
        title: 'Push',
        durationMin: 30,
        durationMax: 45,
        isHardDay: true,
        weekIndex: 1,
        weekday: 'Monday',
      },
    ],
    cardioModalities: ['swim'],
    experienceLevel: 'beginner',
    equipmentTags: ['dumbbells', 'bands'],
    mesoHint: 'Progressive overload when recovery allows.',
    weekProgression: [
      {
        weekIndex: 1,
        phase: 'foundation',
        intensityPct: 60,
        volumeMultiplier: 1,
        repModifier: 0,
      },
    ],
    currentActivityLevel: '1-2',
    preferredExercises: ['Bench Press'],
    generatedSessions: [
      {
        weekIndex: 1,
        weekday: 'Monday',
        name: 'Push',
        exercises: [{ name: 'Push-Up', sets: 3, reps: 10 }],
      },
    ],
  };

  it('accepts a full generate-request body spread into the repair call', async () => {
    const out = (await pipe.transform(realisticClientBody, {
      type: 'body',
      metatype: RepairProgramSessionsDto,
    })) as RepairProgramSessionsDto;
    expect(out.experienceLevel).toBe('beginner');
    expect(out.weekProgression?.[0]?.phase).toBe('foundation');
    expect(out.sessions).toHaveLength(1);
  });

  it('still rejects genuinely unknown properties', async () => {
    await expect(
      pipe.transform(
        { ...realisticClientBody, totallyUnknownField: 1 },
        { type: 'body', metatype: RepairProgramSessionsDto },
      ),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([
          'property totallyUnknownField should not exist',
        ]),
      },
    });
  });
});
