import {
  currentExcludedExerciseIds,
  runWithExcludedExerciseIds,
} from './excluded-exercises.context';

describe('excluded-exercises.context', () => {
  it('exposes the ids to nested async code within the run scope', async () => {
    const seen = await runWithExcludedExerciseIds(
      ['conventional_deadlift', ' trap_bar_deadlift '],
      async () => {
        await Promise.resolve();
        return currentExcludedExerciseIds();
      },
    );
    expect([...seen].sort()).toEqual([
      'conventional_deadlift',
      'trap_bar_deadlift',
    ]);
  });

  it('is empty outside any run scope and after an empty list', () => {
    expect(currentExcludedExerciseIds().size).toBe(0);
    const inside = runWithExcludedExerciseIds([], () =>
      currentExcludedExerciseIds(),
    );
    expect(inside.size).toBe(0);
  });

  it('does not leak between two scopes', async () => {
    await Promise.all([
      runWithExcludedExerciseIds(['a'], async () => {
        await new Promise((r) => setTimeout(r, 5));
        expect([...currentExcludedExerciseIds()]).toEqual(['a']);
      }),
      runWithExcludedExerciseIds(['b'], async () => {
        expect([...currentExcludedExerciseIds()]).toEqual(['b']);
      }),
    ]);
  });
});
