import { Exercise } from '../services/exerciseService';

/**
 * Keywords that indicate exercise variations (to be removed when finding base name)
 */
const VARIATION_KEYWORDS = [
  'paused', 'pause',
  'tempo', 'slow', 'fast',
  'incline', 'decline', 'flat',
  'wide', 'narrow', 'close',
  'single', 'one', 'unilateral',
  'double', 'two', 'bilateral',
  'alternating', 'alt',
  'concentric', 'eccentric',
  'isometric', 'iso',
  'explosive', 'plyometric',
  'reverse', 'negative',
  '45-degree', '45 degree', '45°',
  '90-degree', '90 degree', '90°',
  'seated', 'standing', 'lying',
  'dumbbell', 'barbell', 'cable', 'machine',
];

/**
 * Extract the base exercise name by removing variation keywords
 */
export function getBaseExerciseName(exerciseName: string): string {
  let baseName = exerciseName.toLowerCase();
  
  // Remove variation keywords
  VARIATION_KEYWORDS.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    baseName = baseName.replace(regex, '');
  });
  
  // Clean up extra spaces and trim
  baseName = baseName.replace(/\s+/g, ' ').trim();
  
  // If we removed too much, fall back to original
  if (baseName.length < 3) {
    return exerciseName;
  }
  
  // Capitalize first letter of each word
  return baseName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Group exercises by their base name
 */
export interface ExerciseGroup {
  baseName: string;
  exercises: Exercise[];
  primaryExercise: Exercise; // The "main" exercise (usually the first or most common)
}

export function groupExercises(exercises: Exercise[]): ExerciseGroup[] {
  const groupsMap = new Map<string, Exercise[]>();
  
  // Group exercises by base name
  exercises.forEach(exercise => {
    const baseName = getBaseExerciseName(exercise.name);
    if (!groupsMap.has(baseName)) {
      groupsMap.set(baseName, []);
    }
    groupsMap.get(baseName)!.push(exercise);
  });
  
  // Convert to array and select primary exercise
  const groups: ExerciseGroup[] = Array.from(groupsMap.entries()).map(([baseName, exerciseList]) => {
    // Primary exercise is the one with the shortest name (usually the base version)
    const primaryExercise = exerciseList.reduce((prev, current) => 
      current.name.length < prev.name.length ? current : prev
    );
    
    return {
      baseName,
      exercises: exerciseList,
      primaryExercise,
    };
  });
  
  // Sort groups by base name
  return groups.sort((a, b) => a.baseName.localeCompare(b.baseName));
}

/**
 * Check if an exercise group has variations (more than 1 exercise)
 */
export function hasVariations(group: ExerciseGroup): boolean {
  return group.exercises.length > 1;
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
