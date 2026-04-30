/**
 * Cross-tab navigation: Plan / Plan Preview → Exercises stack → ExerciseDetail.
 * Library ids only; placeholders (draft_/applied_/generated_) are not routable.
 */

export function isLinkableLibraryExerciseId(raw: string | undefined | null): boolean {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!id) return false;
  if (/^(draft_|applied_|generated_)/i.test(id)) return false;
  return true;
}

export type OpenExerciseFromPlanContext = 'preview' | 'calendar' | 'workoutDetail';

/** Navigate to Search tab → ExerciseDetail (nested stack). */
export function navigateFromPlanToExerciseDetail(
  navigation: { getParent?: () => unknown },
  exerciseId: string,
  context: OpenExerciseFromPlanContext,
): void {
  const nav = navigation as {
    getParent?: () =>
      | { getParent?: () => { navigate?: (name: string, p: unknown) => void }; navigate?: (name: string, p: unknown) => void }
      | undefined;
  };
  const tabNav = nav?.getParent?.()?.getParent?.() ?? nav?.getParent?.();
  if (!tabNav || typeof (tabNav as { navigate?: unknown }).navigate !== 'function') return;
  (tabNav as { navigate: (name: string, p: unknown) => void }).navigate('Search', {
    screen: 'ExerciseDetail',
    params: {
      exerciseId,
      returnToPlanExerciseContext: context,
    },
  });
}

/** WorkoutDetail screen (Plan stack) → Exercises stack → ExerciseDetail (back returns to WorkoutDetail). */
export function navigateFromWorkoutDetailToExerciseDetail(
  navigation: { getParent?: () => unknown },
  exerciseId: string,
): void {
  const nav = navigation as {
    getParent?: () =>
      | { getParent?: () => { navigate?: (name: string, p: unknown) => void }; navigate?: (name: string, p: unknown) => void }
      | undefined;
  };
  const tabNav = nav?.getParent?.()?.getParent?.() ?? nav?.getParent?.();
  if (!tabNav || typeof (tabNav as { navigate?: unknown }).navigate !== 'function') return;
  (tabNav as { navigate: (name: string, p: unknown) => void }).navigate('Search', {
    screen: 'ExerciseDetail',
    params: {
      exerciseId,
      returnToPlanExerciseContext: 'workoutDetail' as const,
    },
  });
}

/** Workout tab (pre-start) → Exercises stack → ExerciseDetail. */
export function navigateFromWorkoutToExerciseDetail(
  navigation: { getParent?: () => unknown; navigate?: (name: string, p: unknown) => void },
  exerciseId: string,
): void {
  const params = {
    screen: 'ExerciseDetail' as const,
    params: { exerciseId },
  };
  const tryNav = (n: { navigate?: (name: string, p: unknown) => void } | undefined) => {
    if (n && typeof n.navigate === 'function') {
      n.navigate('Search', params);
      return true;
    }
    return false;
  };
  const nav = navigation as {
    getParent?: () =>
      | { getParent?: () => { navigate?: (name: string, p: unknown) => void }; navigate?: (name: string, p: unknown) => void }
      | undefined;
    navigate?: (name: string, p: unknown) => void;
  };
  const tabNav = nav?.getParent?.()?.getParent?.() ?? nav?.getParent?.();
  if (tryNav(tabNav as { navigate?: (name: string, p: unknown) => void })) return;
  tryNav(nav);
}
