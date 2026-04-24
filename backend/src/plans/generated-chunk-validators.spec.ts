import type { GenerateSessionsDto } from './dto/generate-sessions.dto';
import type { GeneratedSession } from './session-enrichment';
import {
  buildRetryPriorExerciseIds,
  type ChunkValidatorIssue,
  validateGeneratedProgramChunk,
} from './generated-chunk-validators';

function spec(
  overrides: Partial<GenerateSessionsDto['sessions'][number]> = {},
): GenerateSessionsDto['sessions'][number] {
  return {
    type: 'strength',
    durationMin: 45,
    durationMax: 60,
    isHardDay: false,
    weekIndex: 1,
    weekday: 'Monday',
    ...overrides,
  };
}

function session(
  exercises: GeneratedSession['exercises'],
  overrides: Partial<GeneratedSession> = {},
): GeneratedSession {
  return {
    weekIndex: 1,
    weekday: 'Monday',
    name: 'Test',
    exercises,
    ...overrides,
  };
}

describe('validateGeneratedProgramChunk', () => {
  it('passes for distinct ids and enough exercises', () => {
    const specs = [spec({ weekday: 'Mon' }), spec({ weekday: 'Tue' })];
    const six = (offset: number) =>
      Array.from({ length: 6 }, (_, i) => ({
        name: `E${offset}-${i}`,
        sets: 3,
        reps: 8,
        exerciseId: `id${offset * 10 + i}`,
      }));
    const sessions = [session(six(0)), session(six(1), { weekday: 'Tuesday' })];
    const r = validateGeneratedProgramChunk(specs, sessions, 'detailed');
    expect(r.ok).toBe(true);
    expect(r.duplicateExerciseIds).toEqual([]);
  });

  it('fails when same id appears in two sessions', () => {
    const specs = [spec({ weekday: 'Mon' }), spec({ weekday: 'Tue' })];
    const dup = 'same-id';
    const fill = (prefix: string, dupId: string | null, start: number) =>
      Array.from({ length: 6 }, (_, i) => ({
        name: `${prefix}${i}`,
        sets: 3,
        reps: 8,
        exerciseId: i === 0 && dupId ? dupId : `${prefix}-id-${start + i}`,
      }));
    const sessions = [
      session(fill('A', dup, 1)),
      session(fill('B', dup, 20), { weekday: 'Tuesday' }),
    ];
    const r = validateGeneratedProgramChunk(specs, sessions, 'detailed');
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('duplicate_exercise_id_across_chunk');
    expect(r.duplicateExerciseIds).toContain(dup);
  });

  it('fails when same id twice in one session', () => {
    const specs = [spec()];
    const dup = 'twice';
    const sessions = [
      session([
        { name: 'A', sets: 3, reps: 8, exerciseId: dup },
        { name: 'B', sets: 3, reps: 8, exerciseId: dup },
        { name: 'C', sets: 3, reps: 8, exerciseId: 'c' },
        { name: 'D', sets: 3, reps: 8, exerciseId: 'd' },
        { name: 'E', sets: 3, reps: 8, exerciseId: 'e' },
        { name: 'F', sets: 3, reps: 8, exerciseId: 'f' },
      ]),
    ];
    const r = validateGeneratedProgramChunk(specs, sessions, 'detailed');
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('duplicate_exercise_id_in_session');
  });

  it('fails below min exercises for strength detailed', () => {
    const specs = [spec()];
    const sessions = [
      session([
        { name: 'A', sets: 3, reps: 8, exerciseId: 'a' },
        { name: 'B', sets: 3, reps: 8, exerciseId: 'b' },
      ]),
    ];
    const r = validateGeneratedProgramChunk(specs, sessions, 'detailed');
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('below_min_exercises');
  });

  it('fails when upper-focus strength day includes library Squat/Hinge (with metadata map)', () => {
    const specs = [spec({ title: 'Upper' })];
    const meta = new Map<string, string[]>([
      ['hinge1', ['Hinge', 'Pull']],
      ['push1', ['Push']],
    ]);
    const sessions = [
      session([
        { name: 'Sumo DL', sets: 4, reps: 5, exerciseId: 'hinge1' },
        { name: 'Bench', sets: 4, reps: 8, exerciseId: 'push1' },
        { name: 'C', sets: 3, reps: 10, exerciseId: 'c' },
        { name: 'D', sets: 3, reps: 10, exerciseId: 'd' },
        { name: 'E', sets: 3, reps: 10, exerciseId: 'e' },
        { name: 'F', sets: 3, reps: 10, exerciseId: 'f' },
      ]),
    ];
    const r = validateGeneratedProgramChunk(
      specs,
      sessions,
      'detailed',
      meta,
    );
    expect(r.ok).toBe(false);
    expect(r.issues).toContain('primary_lower_pattern_on_upper_focus');
    expect(r.patternClashExerciseIds).toContain('hinge1');
    expect(r.patternClashExerciseIds).not.toContain('push1');
  });

  it('passes upper-focus when metadata map omitted (backward compatible)', () => {
    const specs = [spec({ title: 'Upper' })];
    const six = Array.from({ length: 6 }, (_, i) => ({
      name: `E${i}`,
      sets: 3,
      reps: 8,
      exerciseId: `id${i}`,
    }));
    const sessions = [session(six)];
    const r = validateGeneratedProgramChunk(specs, sessions, 'detailed');
    expect(r.ok).toBe(true);
    expect(r.patternClashExerciseIds).toEqual([]);
  });

  it('passes upper-focus when hinge exercise has no metadata entry', () => {
    const specs = [spec({ title: 'Push' })];
    const meta = new Map<string, string[]>([['push1', ['Push']]]);
    const sessions = [
      session([
        { name: 'Mystery', sets: 4, reps: 5, exerciseId: 'unknown' },
        ...Array.from({ length: 5 }, (_, i) => ({
          name: `E${i}`,
          sets: 3,
          reps: 8,
          exerciseId: `id${i}`,
        })),
      ]),
    ];
    const r = validateGeneratedProgramChunk(
      specs,
      sessions,
      'detailed',
      meta,
    );
    expect(r.ok).toBe(true);
  });
});

describe('buildRetryPriorExerciseIds', () => {
  it('places pattern clash ids on tail like duplicates', () => {
    const prior = ['p1'];
    const sessions: GeneratedSession[] = [
      session([
        { name: 'A', sets: 3, reps: 8, exerciseId: 'hinge1' },
        { name: 'B', sets: 3, reps: 8, exerciseId: 'b' },
      ]),
    ];
    const validation = {
      ok: false,
      issues: [
        'primary_lower_pattern_on_upper_focus',
      ] as ChunkValidatorIssue[],
      duplicateExerciseIds: [] as string[],
      patternClashExerciseIds: ['hinge1'],
    };
    const out = buildRetryPriorExerciseIds({
      cappedPrior: prior,
      validation,
      sessions,
    });
    expect(out.includes('hinge1')).toBe(true);
    expect(out[out.length - 1]).toBe('hinge1');
  });

  it('places duplicate ids after base so they survive slice', () => {
    const prior = ['p1', 'p2'];
    const sessions: GeneratedSession[] = [
      session([
        { name: 'A', sets: 3, reps: 8, exerciseId: 'x' },
        { name: 'B', sets: 3, reps: 8, exerciseId: 'y' },
      ]),
    ];
    const validation = {
      ok: false,
      issues: ['duplicate_exercise_id_across_chunk'] as ChunkValidatorIssue[],
      duplicateExerciseIds: ['x'],
      patternClashExerciseIds: [] as string[],
    };
    const out = buildRetryPriorExerciseIds({
      cappedPrior: prior,
      validation,
      sessions,
    });
    expect(out.includes('x')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(48);
  });
});
