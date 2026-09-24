import type { MuscleInvolvement } from '../data/exercise-muscle-involvement';
import { groupOfRegion } from '../data/muscle-regions';

/**
 * "Recently trained": how recently and how much each anatomical region was
 * worked, from the user's logged sets. Pure, like `progress-stats.ts`.
 *
 * Model: every completed set contributes `weight` set-equivalents to each
 * region the exercise involves (the retag in exercise-muscle-involvement.ts:
 * primaries 0.6–1 with emphasis, secondaries 0.2–0.5), decayed by age with a
 * half-life of HALF_LIFE_DAYS. The score saturates into a 0..1 intensity so a
 * heavy leg week reads as "fully lit", not "brighter than anything else".
 *
 * Output is per REGION ("Semitendinosus"), which is what the figure paints;
 * `muscle` carries the catalog sub-muscle for callers that still think in
 * that vocabulary.
 */

export const HEAT_DEFAULT_DAYS = 7;
export const HEAT_MAX_DAYS = 28;
/** Age at which a set counts half. */
export const HALF_LIFE_DAYS = 3.5;
/** Decayed set-equivalents at which intensity reaches ~0.63; 3x this is ~0.95. */
export const SATURATION_SETS = 10;
/** Involvement weight at or above which a set counts as direct work on the region. */
export const DIRECT_WEIGHT = 0.6;

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
  muscles: MuscleInvolvement[];
}

export interface MuscleHeatEntry {
  /** Anatomical region key on the figure ("Semitendinosus"). */
  region: string;
  /** Catalog sub-muscle ("Hamstrings"), or the region itself when it has none. */
  muscle: string;
  /** Parent group as the filters spell it ("Legs"). */
  group: string;
  /** Decayed set-equivalents. */
  score: number;
  /** 0..1, saturating. */
  intensity: number;
  /** Raw completed sets where the region was a direct target (weight >= DIRECT_WEIGHT). */
  sets: number;
  /** Raw completed sets where the region assisted. */
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

export function computeMuscleHeat(
  logs: HeatLog[],
  lookup: (exerciseId: string) => HeatExercise | undefined,
  now: Date,
  days: number,
): MuscleHeat {
  const acc = new Map<
    string,
    {
      sub: string | null;
      score: number;
      sets: number;
      assistSets: number;
      last: number;
    }
  >();

  const since = heatRangeStart(days, now).getTime();
  for (const log of logs) {
    const at = log.startedAt.getTime();
    if (at < since || at > now.getTime() + 60_000) continue;
    const w = decay((now.getTime() - at) / (24 * 60 * 60 * 1000));
    for (const entry of log.entries) {
      const sets = entry.completedSets.filter((s) => s.completed).length;
      if (sets === 0) continue;
      const ex = lookup(entry.exerciseId);
      if (!ex || !ex.muscles || ex.muscles.length === 0) continue;
      for (const m of ex.muscles) {
        const cur = acc.get(m.region) ?? {
          sub: m.sub,
          score: 0,
          sets: 0,
          assistSets: 0,
          last: 0,
        };
        cur.score += w * m.weight * sets;
        if (m.weight >= DIRECT_WEIGHT) cur.sets += sets;
        else cur.assistSets += sets;
        cur.last = Math.max(cur.last, at);
        acc.set(m.region, cur);
      }
    }
  }

  const muscles: MuscleHeatEntry[] = Array.from(acc, ([region, v]) => ({
    region,
    muscle: v.sub ?? region,
    group: groupOfRegion(region),
    score: Math.round(v.score * 100) / 100,
    intensity: Math.round(intensityFor(v.score) * 1000) / 1000,
    sets: v.sets,
    assistSets: v.assistSets,
    lastTrainedAt: new Date(v.last).toISOString(),
  })).sort((a, b) => b.score - a.score || a.region.localeCompare(b.region));

  return { days, generatedAt: now.toISOString(), muscles };
}
