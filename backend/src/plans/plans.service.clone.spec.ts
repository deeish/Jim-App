import { PlansService } from './plans.service';
import type { GeneratedSession } from './session-enrichment';
import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import { WeekProgressionDto } from './dto/generate-sessions.dto';

type Spec = GenerateSessionsDto['sessions'][number];

function makeSession(
  focus: string,
  sets = 3,
  reps = 10,
  weekIndex = 1,
  weekday = 'Monday',
): GeneratedSession {
  return {
    weekIndex,
    weekday,
    name: focus,
    reasoning: 'test reasoning',
    warmUp: 'warm up',
    coolDown: 'cool down',
    exercises: [{ name: 'Bench Press', sets, reps, exerciseId: 'bench-001' }],
  };
}

function makeSpec(focus: string, weekIndex = 2, weekday = 'Monday'): Spec {
  return {
    weekIndex,
    weekday,
    title: focus,
    type: 'strength',
    durationMin: 40,
    durationMax: 60,
    isHardDay: false,
  };
}

function makeProgression(
  weekIndex = 2,
  volumeMultiplier = 1.15,
  repModifier = -1,
): WeekProgressionDto {
  const p = new WeekProgressionDto();
  p.weekIndex = weekIndex;
  p.phase = 'progression';
  p.intensityPct = 70;
  p.volumeMultiplier = volumeMultiplier;
  p.repModifier = repModifier;
  return p;
}

const clone = (PlansService as any).tryCloneFirstWeekSessions as (
  specs: Spec[],
  week1ByFocus: Map<string, GeneratedSession>,
  weekProgression: WeekProgressionDto[],
) => GeneratedSession[] | null;

describe('PlansService.tryCloneFirstWeekSessions', () => {
  describe('happy path', () => {
    it('clones exercise rows verbatim (progression lands post-enrichment)', () => {
      const source = makeSession('push', 3, 10);
      const map = new Map([['push', source]]);
      const result = clone([makeSpec('push')], map, [
        makeProgression(2, 1.15, -1),
      ]);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      // Enrichment re-stamps prescriptions from role bands, so the clone must
      // not pre-apply progression math (it would be erased and then, if it
      // survived, double-applied by applyWeekProgressionToEnrichedSessions).
      expect(result![0].exercises[0].sets).toBe(3);
      expect(result![0].exercises[0].reps).toBe(10);
    });

    it('copies rows, not references — mutating the clone leaves the source intact', () => {
      const source = makeSession('push', 3, 10);
      const map = new Map([['push', source]]);
      const result = clone([makeSpec('push')], map, [makeProgression(2)]);

      result![0].exercises[0].sets = 99;
      expect(source.exercises[0].sets).toBe(3);
    });

    it('sets weekIndex and weekday from spec, not source', () => {
      const source = makeSession('push', 3, 10, 1, 'Monday');
      const map = new Map([['push', source]]);
      const result = clone([makeSpec('push', 3, 'Wednesday')], map, [
        makeProgression(3, 1.15, -2),
      ]);

      expect(result![0].weekIndex).toBe(3);
      expect(result![0].weekday).toBe('Wednesday');
    });

    it('preserves non-exercise fields (name, reasoning, warmUp, coolDown)', () => {
      const source = makeSession('legs', 4, 8);
      const map = new Map([['legs', source]]);
      const result = clone([makeSpec('legs')], map, [makeProgression()]);

      expect(result![0].name).toBe('legs');
      expect(result![0].reasoning).toBe('test reasoning');
      expect(result![0].warmUp).toBe('warm up');
      expect(result![0].coolDown).toBe('cool down');
    });
  });

  describe('null returns — fall back to LLM', () => {
    it('returns null when weekProgression has no entry for weekIndex', () => {
      const map = new Map([['push', makeSession('push')]]);
      const result = clone([makeSpec('push', 5)], map, [makeProgression(2)]);
      expect(result).toBeNull();
    });

    it('returns null when specs[0] weekIndex is null/undefined', () => {
      const spec = makeSpec('push');
      (spec as any).weekIndex = undefined;
      const map = new Map([['push', makeSession('push')]]);
      const result = clone([spec], map, [makeProgression()]);
      expect(result).toBeNull();
    });

    it('returns null when focus key is not in week1ByFocus map', () => {
      const map = new Map([['push', makeSession('push')]]);
      const result = clone([makeSpec('pull')], map, [makeProgression()]);
      expect(result).toBeNull();
    });

    it('returns null if any one spec in multi-session week has a focus mismatch', () => {
      const map = new Map([
        ['push', makeSession('push')],
        ['pull', makeSession('pull')],
        ['legs', makeSession('legs')],
      ]);
      const specs = [
        makeSpec('push'),
        makeSpec('pull'),
        makeSpec('cardio'), // mismatch
      ];
      const result = clone(specs, map, [makeProgression()]);
      expect(result).toBeNull();
    });
  });

  describe('multi-session week', () => {
    it('returns all sessions in spec order for a 4-day week', () => {
      const focuses = ['push', 'pull', 'legs', 'upper'];
      const map = new Map(focuses.map((f) => [f, makeSession(f)]));
      const specs = focuses.map((f) => makeSpec(f));
      const result = clone(specs, map, [makeProgression()]);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(4);
      result!.forEach((s, i) => {
        expect(s.name).toBe(focuses[i]);
      });
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty specs (does not return null)', () => {
      const map = new Map([['push', makeSession('push')]]);
      const result = clone([], map, [makeProgression()]);
      // Empty array is truthy — the outer loop will iterate 0 times and skip the LLM call
      expect(result).toEqual([]);
    });

    it('normalises focus key case when matching', () => {
      const source = makeSession('full body');
      const map = new Map([['full body', source]]);
      const spec = makeSpec('Full Body'); // capitalised — should still match
      const result = clone([spec], map, [makeProgression()]);
      expect(result).not.toBeNull();
    });

    it('falls back to "full body" key when title and type are both empty', () => {
      const source = makeSession('full body');
      const map = new Map([['full body', source]]);
      const spec = makeSpec('');
      spec.title = undefined;
      (spec as any).type = '';
      const result = clone([spec], map, [makeProgression()]);
      expect(result).not.toBeNull();
    });
  });
});
