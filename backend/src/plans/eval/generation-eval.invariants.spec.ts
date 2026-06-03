import { runChunkRepairEnrichThenValidate } from './eval-harness';
import { createEvalMockExercisesService } from './mock-exercises-service-for-eval';
import type { EvalCatalogExercise } from './eval-types';
import type { GenerateSessionsDto } from '../dto/generate-sessions.dto';

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function mkCatalog(size: number): EvalCatalogExercise[] {
  const out: EvalCatalogExercise[] = [];
  const lowers = ['Squat', 'Hinge', 'Lunge'] as const;
  for (let i = 0; i < size; i++) {
    const mod = i % 6;
    if (mod === 0) {
      out.push({
        id: `ex_${i}`,
        name: `Cardio ${i}`,
        movementPatterns: [],
        primaryMuscleGroup: 'Cardio',
        prescriptionType: 'time',
      });
    } else if (mod === 1) {
      out.push({
        id: `ex_${i}`,
        name: `Pull ${i}`,
        movementPatterns: ['Pull'],
        primaryMuscleGroup: 'Back',
      });
    } else if (mod === 2 || mod === 3) {
      const p = lowers[mod - 2]!;
      out.push({
        id: `ex_${i}`,
        name: `${p} ${i}`,
        movementPatterns: [p],
        primaryMuscleGroup: 'Legs',
      });
    } else {
      out.push({
        id: `ex_${i}`,
        name: `Push ${i}`,
        movementPatterns: ['Push'],
        primaryMuscleGroup: 'Chest',
      });
    }
  }
  return out;
}

describe('generation eval invariants (randomized)', () => {
  const rng = mulberry32(0x51f00d);
  const catalog = mkCatalog(120);
  const mock = createEvalMockExercisesService(catalog);
  const dayTitles = ['Upper', 'Lower', 'Upper 2', 'Lower 2'];

  it('keeps core invariants across random chunks', async () => {
    for (let run = 0; run < 30; run++) {
      const specs: GenerateSessionsDto['sessions'] = dayTitles.map((t, i) => ({
        type: 'strength',
        title: t,
        durationMin: 35,
        durationMax: 55,
        isHardDay: i % 2 === 0,
        weekIndex: run,
        weekday: ['Monday', 'Tuesday', 'Thursday', 'Friday'][i]!,
      }));
      const sessions = specs.map((s, i) => {
        const exCount = 4 + Math.floor(rng() * 3);
        const ex = Array.from({ length: exCount }, (_v, idx) => {
          const row = pick(rng, catalog.slice(i * 10, i * 10 + 35));
          return {
            name: row.name,
            sets: 3,
            reps: 8 + (idx % 3),
            exerciseId: row.id,
          };
        });
        return {
          weekIndex: s.weekIndex,
          weekday: s.weekday,
          name: s.title ?? 'Strength',
          exercises: ex,
        };
      });

      const out = await runChunkRepairEnrichThenValidate({
        specs,
        sessions,
        catalog,
        effectiveDetailLevel: 'simple',
        enrichPrefs: {
          goal: 'hybrid',
          durationMinutes: 45,
          detailLevel: 'simple',
          cardioModalities: ['treadmill', 'bike'],
        },
      });

      expect(out.sessionsEnriched).toHaveLength(specs.length);
      for (const s of out.sessionsEnriched) {
        expect((s.exercises ?? []).length).toBeGreaterThan(0);
        expect(
          (s.exercises ?? []).every((e) => !!String(e.name ?? '').trim()),
        ).toBe(true);

        // Cardio rows should be clustered at the end after enrich.
        const rows = s.exercises ?? [];
        let seenCardio = false;
        for (const e of rows) {
          const id = e.exerciseId?.trim() ?? '';
          const isCardio = id
            ? mock.findOne(id)?.primaryMuscleGroup === 'Cardio'
            : false;
          if (isCardio) seenCardio = true;
          if (seenCardio && !isCardio) {
            throw new Error(
              `Non-cardio row appears after cardio in session "${s.name}"`,
            );
          }
        }
      }
      expect(out.validationAfterEnrich.issues).not.toContain(
        'duplicate_exercise_id_in_session',
      );
    }
  });

  /**
   * Phase 8 — push/pull ratio invariant. Aggregated across many random weeks,
   * total Push and total Pull exercises should stay within ~2.5× of each other.
   *
   * Trainers stagger Push and Pull volume to avoid postural drift; if the
   * generator systematically shipped 4× more Push than Pull, shoulder health
   * suffers. Cardio finishers and exercises without `Push`/`Pull` patterns are
   * ignored.
   */
  it('keeps Push:Pull ratio balanced in aggregate across random chunks', async () => {
    const byId = new Map(catalog.map((c) => [c.id, c]));
    let totalPush = 0;
    let totalPull = 0;
    for (let run = 0; run < 30; run++) {
      const specs: GenerateSessionsDto['sessions'] = dayTitles.map((t, i) => ({
        type: 'strength',
        title: t,
        durationMin: 35,
        durationMax: 55,
        isHardDay: i % 2 === 0,
        weekIndex: 100 + run,
        weekday: ['Monday', 'Tuesday', 'Thursday', 'Friday'][i]!,
      }));
      const sessions = specs.map((s, i) => {
        const exCount = 4 + Math.floor(rng() * 3);
        const ex = Array.from({ length: exCount }, (_v, idx) => {
          const row = pick(rng, catalog.slice(i * 10, i * 10 + 35));
          return {
            name: row.name,
            sets: 3,
            reps: 8 + (idx % 3),
            exerciseId: row.id,
          };
        });
        return {
          weekIndex: s.weekIndex,
          weekday: s.weekday,
          name: s.title ?? 'Strength',
          exercises: ex,
        };
      });

      const out = await runChunkRepairEnrichThenValidate({
        specs,
        sessions,
        catalog,
        effectiveDetailLevel: 'simple',
        enrichPrefs: {
          goal: 'hybrid',
          durationMinutes: 45,
          detailLevel: 'simple',
          cardioModalities: ['treadmill', 'bike'],
        },
      });

      for (const s of out.sessionsEnriched) {
        for (const e of s.exercises ?? []) {
          const id = e.exerciseId?.trim();
          if (!id) continue;
          const meta = byId.get(id);
          const patterns = meta?.movementPatterns ?? [];
          if (patterns.includes('Push')) totalPush++;
          if (patterns.includes('Pull')) totalPull++;
        }
      }
    }

    // Aggregate over all runs rather than per-week. A single 5-exercise week on
    // a synthetic fixture is too noisy to bound tightly — bidirectional split
    // purity now (correctly) strips incidental Push/Pull off leg days and back-
    // fills upper-day slots with the under-used pattern, so any one week can
    // swing. The systematic invariant — "neither side dominates by more than
    // ~2.5× across the whole sample" — is what protects against postural drift.
    expect(totalPush).toBeGreaterThan(0);
    expect(totalPull).toBeGreaterThan(0);
    const ratio = totalPush / totalPull;
    expect(ratio).toBeGreaterThanOrEqual(0.4);
    expect(ratio).toBeLessThanOrEqual(2.5);
  });
});
