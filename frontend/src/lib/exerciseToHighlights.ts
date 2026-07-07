import { BODY_MAP_REGIONS, BodyMapView } from '../components/bodymap/bodyMapPaths';

/**
 * Maps a catalog exercise's muscle metadata onto body-map regions so
 * MuscleBodyMap can glow the right anatomy. Pure logic, no rendering.
 *
 * Rules (round-3 plan):
 * - `subMuscles` present -> those regions at full intensity.
 * - No usable subMuscles -> ALL regions of the primary group glow (still
 *   informative, e.g. a generic "Back" exercise lights the whole back).
 * - `secondaryMuscleGroups` (group names from the API) -> their region sets
 *   at reduced intensity, never overriding a primary region.
 * - Cardio / unknown metadata -> null; the caller keeps the MuscleGroupDisc.
 * - Unknown muscle names are skipped silently — catalog typos must never
 *   blank a row.
 */

export type BodyMapHighlight = { region: string; intensity: number };
export type ExerciseBodyMap = { highlights: BodyMapHighlight[]; view: BodyMapView };

/** Structural subset of Exercise this mapping needs (works for plan-day exercises too). */
export type BodyMappableExercise = {
  primaryMuscleGroup?: string | null;
  subMuscles?: string[] | null;
  secondaryMuscleGroups?: string[] | null;
};

const PRIMARY_INTENSITY = 1;
const SECONDARY_INTENSITY = 0.4;

// Region sets per muscle group — the group's sub-muscles, same vocabulary as
// MUSCLE_HIERARCHY / the backend's SUB_MUSCLE_MAP. Cardio has no regions on
// purpose: cardio rows keep the heart-pulse disc.
const GROUP_DEFAULT_REGIONS: Record<string, string[]> = {
  chest: ['Upper Chest', 'Mid Chest', 'Lower Chest'],
  back: ['Upper Back', 'Mid Back', 'Lower Back', 'Lats', 'Traps'],
  legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Inner Thighs', 'Outer Thighs'],
  shoulders: ['Front Delts', 'Side Delts', 'Rear Delts', 'Rotator Cuff'],
  arms: ['Biceps', 'Triceps', 'Forearms'],
  core: ['Upper Abs', 'Lower Abs', 'Obliques'],
};

const KNOWN_REGIONS = new Set([
  ...Object.keys(BODY_MAP_REGIONS.front),
  ...Object.keys(BODY_MAP_REGIONS.back),
]);

/**
 * The view a region "belongs" to when choosing which figure to show. Calves
 * and Forearms exist on both views; their canonical home is where the bulk of
 * the muscle is (gastrocnemius -> back, wrist flexors -> front).
 */
function canonicalView(region: string): BodyMapView {
  if (region === 'Calves') return 'back';
  if (region === 'Forearms') return 'front';
  return BODY_MAP_REGIONS.front[region] ? 'front' : 'back';
}

/** Picks front/back by where the highlight intensity concentrates; ties go front. */
export function pickBodyMapView(highlights: BodyMapHighlight[]): BodyMapView {
  let front = 0;
  let back = 0;
  for (const h of highlights) {
    if (canonicalView(h.region) === 'front') front += h.intensity;
    else back += h.intensity;
  }
  return back > front ? 'back' : 'front';
}

/**
 * Tile variant for the mini row tiles: primary regions only, view picked from
 * them alone. At 44px the 0.4 secondary washes would muddy the single-hue
 * read that makes the list scannable, and a strong secondary could even drag
 * the view away from the muscle the exercise is named for — secondaries stay
 * on the detail hero where there is room to read them. Exercises without
 * sub-muscle data still glow their whole group; cardio/unknown stays null.
 */
export function exerciseToTileHighlights(exercise: BodyMappableExercise): ExerciseBodyMap | null {
  const mapped = exerciseToHighlights(exercise);
  if (!mapped) return null;
  const highlights = mapped.highlights.filter((h) => h.intensity >= PRIMARY_INTENSITY);
  return { highlights, view: pickBodyMapView(highlights) };
}

export function exerciseToHighlights(exercise: BodyMappableExercise): ExerciseBodyMap | null {
  const group = (exercise.primaryMuscleGroup ?? '').trim().toLowerCase();
  const namedRegions = (exercise.subMuscles ?? []).filter((m) => KNOWN_REGIONS.has(m));
  const primaries = namedRegions.length > 0 ? namedRegions : GROUP_DEFAULT_REGIONS[group] ?? [];
  if (primaries.length === 0) return null;

  const intensityByRegion = new Map<string, number>();
  for (const region of primaries) intensityByRegion.set(region, PRIMARY_INTENSITY);
  for (const secondary of exercise.secondaryMuscleGroups ?? []) {
    const regions = GROUP_DEFAULT_REGIONS[(secondary ?? '').trim().toLowerCase()] ?? [];
    for (const region of regions) {
      if (!intensityByRegion.has(region)) intensityByRegion.set(region, SECONDARY_INTENSITY);
    }
  }

  const highlights = Array.from(intensityByRegion, ([region, intensity]) => ({
    region,
    intensity,
  }));
  return { highlights, view: pickBodyMapView(highlights) };
}
