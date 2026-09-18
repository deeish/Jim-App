import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped list of exercise ids the current user never wants to see
 * (their disliked list, 2026-09-17), read by every catalog pool pull in
 * `ExercisesService` and by the replacement picker.
 *
 * Mirrors `generation-abort.context.ts`: the alternative was threading an
 * `excludeIds` argument through the generator, four repair passes, every
 * enrichment swap, the floors and the cardio template, and missing one of
 * them would let a disliked lift back in through a side door. Null-safe:
 * outside a run scope the list is empty and everything behaves as before.
 */
const store = new AsyncLocalStorage<{ ids: ReadonlySet<string> }>();

export function runWithExcludedExerciseIds<T>(
  ids: ReadonlyArray<string>,
  fn: () => T,
): T {
  const clean = ids.map((id) => id.trim()).filter(Boolean);
  if (clean.length === 0) return fn();
  return store.run({ ids: new Set(clean) }, fn);
}

/** The current request's excluded ids, or an empty set outside a run scope. */
export function currentExcludedExerciseIds(): ReadonlySet<string> {
  return store.getStore()?.ids ?? EMPTY;
}

const EMPTY: ReadonlySet<string> = new Set();
