/**
 * "Trained this week": how recently and how much each catalog muscle was
 * worked, from the user's logged sets. Pure, like `progress-stats.ts`.
 *
 * Model: every completed set is worth 1 for the exercise's primary muscles
 * (its `subMuscles`, or its whole primary group when the row has none) and
 * SECONDARY_WEIGHT for each sub-muscle of its secondary groups, decayed by age
 * with a half-life of HALF_LIFE_DAYS. The score saturates into a 0..1
 * intensity so a heavy leg week reads as "fully lit", not "brighter than
 * anything else on the figure".
 *
 * Group -> sub-muscle expansion mirrors the client's filter hierarchy and
 * `exerciseToHighlights`'s GROUP_DEFAULT_REGIONS; keep the three in step.
 */

export const HEAT_DEFAULT_DAYS = 7;
export const HEAT_MAX_DAYS = 28;
/** Age at which a set counts half. */
export const HALF_LIFE_DAYS = 3.5;
/** Decayed set-equivalents at which intensity reaches ~0.63; 3x this is ~0.95. */
export const SATURATION_SETS = 10;
export const SECONDARY_WEIGHT = 0.5;

export const GROUP_SUB_MUSCLES: Record<string, string[]> = {
  chest: ['Upper Chest', 'Mid Chest', 'Lower Chest'],
  back: ['Upper Back', 'Mid Back', 'Lower Back', 'Lats', 'Traps'],
  legs: [
    'Quads',
    'Hamstrings',
    'Glutes',
    'Calves',
    'Inner Thighs',
    'Outer Thighs',
  ],
  shoulders: ['Front Delts', 'Side Delts', 'Rear Delts', 'Rotator Cuff'],
  arms: ['Biceps', 'Triceps', 'Forearms'],
  core: ['Upper Abs', 'Lower Abs', 'Obliques'],
};

const GROUP_OF_SUB: Record<string, string> = Object.fromEntries(
  Object.entries(GROUP_SUB_MUSCLES).flatMap(([group, subs]) =>
    subs.map((s) => [s, group]),
  ),
);

export interface HeatSet {
  completed: boolean;
}
export interface HeatEntry {
  exerciseId: string;
  completedSets: HeatSet[];
}
export interface HeatLog {
  startedAt: Date;
  entries: HeatEntry[];
}
/** The slice of a catalog row the model needs. */
export interface HeatExercise {
  primaryMuscleGroup: string;
  subMuscles: string[];
  secondaryMuscleGroups: string[];
}

export interface MuscleHeatEntry {
  /** Catalog sub-muscle name ("Quads"). */
  muscle: string;
  /** Parent group as the filters spell it ("Legs"). */
  group: string;
  /** Decayed set-equivalents (primary 1, secondary SECONDARY_WEIGHT). */
  score: number;
  /** 0..1, saturating. */
  intensity: number;
  /** Raw completed sets that targeted it directly. */
  sets: number;
  /** Raw completed sets that worked it as a secondary. */
  assistSets: number;
  /** Most recent session that touched it, ISO. */
  lastTrainedAt: string;
}

export interface MuscleHeat {
  days: number;
  generatedAt: string;
  muscles: MuscleHeatEntry[];
}

export function resolveHeatDays(days?: number): number {
  if (days == null || !Number.isFinite(days)) return HEAT_DEFAULT_DAYS;
  return Math.max(1, Math.min(HEAT_MAX_DAYS, Math.round(days)));
}

export function heatRangeStart(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function decay(ageDays: number): number {
  return Math.pow(2, -Math.max(0, ageDays) / HALF_LIFE_DAYS);
}

function intensityFor(score: number): number {
  return 1 - Math.exp(-score / SATURATION_SETS);
}

function groupLabel(group: string): string {
  return group.charAt(0).toUpperCase() + group.slice(1);
}

export function computeMuscleHeat(
  logs: HeatLog[],
  lookup: (exerciseId: string) => HeatExercise | undefined,
  now: Date,
  days: number,
): MuscleHeat {
  const acc = new Map<
    string,
    { score: number; sets: number; assistSets: number; last: number }
  >();
  const bump = (
    muscle: string,
    weight: number,
    sets: number,
    at: number,
    assist: boolean,
  ) => {
    const cur = acc.get(muscle) ?? {
      score: 0,
      sets: 0,
      assistSets: 0,
      last: 0,
    };
    cur.score += weight * sets;
    if (assist) cur.assistSets += sets;
    else cur.sets += sets;
    cur.last = Math.max(cur.last, at);
    acc.set(muscle, cur);
  };

  const since = heatRangeStart(days, now).getTime();
  for (const log of logs) {
    const at = log.startedAt.getTime();
    if (at < since || at > now.getTime() + 60_000) continue;
    const ageDays = (now.getTime() - at) / (24 * 60 * 60 * 1000);
    const w = decay(ageDays);
    for (const entry of log.entries) {
      const sets = entry.completedSets.filter((s) => s.completed).length;
      if (sets === 0) continue;
      const ex = lookup(entry.exerciseId);
      if (!ex) continue;
      const primaries =
        ex.subMuscles.length > 0
          ? ex.subMuscles
          : (GROUP_SUB_MUSCLES[ex.primaryMuscleGroup.trim().toLowerCase()] ??
            []);
      const primarySet = new Set(primaries);
      for (const m of primaries) bump(m, w, sets, at, false);
      for (const g of ex.secondaryMuscleGroups) {
        for (const m of GROUP_SUB_MUSCLES[g.trim().toLowerCase()] ?? []) {
          if (primarySet.has(m)) continue;
          bump(m, w * SECONDARY_WEIGHT, sets, at, true);
        }
      }
    }
  }

  const muscles: MuscleHeatEntry[] = Array.from(acc, ([muscle, v]) => ({
    muscle,
    group: groupLabel(GROUP_OF_SUB[muscle] ?? ''),
    score: Math.round(v.score * 100) / 100,
    intensity: Math.round(intensityFor(v.score) * 1000) / 1000,
    sets: v.sets,
    assistSets: v.assistSets,
    lastTrainedAt: new Date(v.last).toISOString(),
  })).sort((a, b) => b.score - a.score || a.muscle.localeCompare(b.muscle));

  return { days, generatedAt: now.toISOString(), muscles };
}
