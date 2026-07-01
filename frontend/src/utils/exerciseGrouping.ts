import { Exercise } from '../services/exerciseService';

/**
 * One card in the results list: a family of equipment variants of the same lift.
 */
export interface ExerciseGroup {
  baseName: string;
  exercises: Exercise[];
  primaryExercise: Exercise; // The best-ranked variant in the family (headline)
}

/**
 * Group exercises into families using the server-computed `groupKey` (the name
 * minus equipment words, so "Flat Barbell Bench Press" and "Flat Dumbbell Bench
 * Press" merge while "Incline Bench Press" stays its own family). Rows without a
 * groupKey fall back to exact-name grouping, which never merges distinct lifts.
 *
 * Input order is the backend's quality sort (common first, then compound, then
 * equipment preference), so the first exercise seen in a family is its best-
 * ranked variant and becomes the headline — not the shortest-named one, which
 * used to promote obscure short names over the canonical lift.
 */
export function groupExercises(exercises: Exercise[]): ExerciseGroup[] {
  const groupsMap = new Map<string, Exercise[]>();

  exercises.forEach((exercise) => {
    const key = exercise.groupKey || exercise.name.trim().toLowerCase();
    const list = groupsMap.get(key);
    if (list) list.push(exercise);
    else groupsMap.set(key, [exercise]);
  });

  // Map iteration preserves insertion order, so families appear in the same
  // order the backend ranked their best variant.
  return Array.from(groupsMap.entries()).map(([baseName, exerciseList]) => ({
    baseName,
    exercises: exerciseList,
    primaryExercise: exerciseList[0],
  }));
}

/**
 * Get variation names (excluding the primary exercise name)
 * Only returns exercises that have a DIFFERENT name than the primary exercise
 * Deduplicates by name so each unique variation name appears only once
 */
export function getVariationNames(group: ExerciseGroup): string[] {
  if (group.exercises.length <= 1) return [];

  const primaryName = group.primaryExercise.name.trim().toLowerCase();

  // Filter out exercises that match the primary exercise by ID OR by name
  const variations = group.exercises.filter(ex => {
    // Exclude by ID
    if (ex.id === group.primaryExercise.id) return false;

    // Exclude if name matches (case-insensitive, trimmed)
    const exName = ex.name.trim().toLowerCase();
    if (exName === primaryName) return false;

    return true;
  });

  // Get unique variation names (deduplicate by name, case-insensitive)
  const uniqueNames = new Set<string>();
  const uniqueVariations: string[] = [];

  variations.forEach(ex => {
    const normalizedName = ex.name.trim().toLowerCase();
    if (!uniqueNames.has(normalizedName)) {
      uniqueNames.add(normalizedName);
      uniqueVariations.push(ex.name); // Keep original casing from first occurrence
    }
  });

  return uniqueVariations;
}
