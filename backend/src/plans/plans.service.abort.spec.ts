import { PlansService } from './plans.service';
import { runWithGenerationSignal } from '../common/generation-abort.context';
import type { GenerateSessionsDto } from './dto/generate-sessions.dto';

describe('PlansService.generateSessions — client abort', () => {
  it('throws before any Groq generator call when the signal is already aborted', async () => {
    // Spy generator: asserts NO Groq-backed call is made once aborted.
    const generator = {
      tryGenerateFullProgram: jest.fn(),
      generateWorkout: jest.fn(),
      polishSimpleBatchSessionCopy: jest.fn(),
    };
    const exercises = {
      findOne: jest.fn(),
      getCandidatesForGenerator: jest.fn(() => []),
    };
    const service = new PlansService(
      {} as never,
      generator as never,
      exercises as never,
      {} as never,
    );

    const dto = {
      goal: 'strength',
      location: 'gym',
      detailLevel: 'simple',
      sessions: [
        {
          weekIndex: 1,
          weekday: 'Monday',
          type: 'strength',
          durationMin: 45,
          durationMax: 45,
          isHardDay: false,
          title: 'Upper',
        },
      ],
    } as unknown as GenerateSessionsDto;

    const ac = new AbortController();
    ac.abort();

    await expect(
      runWithGenerationSignal(ac.signal, () =>
        service.generateSessions(dto, 'user-1'),
      ),
    ).rejects.toThrow(/aborted/i);

    expect(generator.tryGenerateFullProgram).not.toHaveBeenCalled();
    expect(generator.generateWorkout).not.toHaveBeenCalled();
    expect(generator.polishSimpleBatchSessionCopy).not.toHaveBeenCalled();
  });
});
