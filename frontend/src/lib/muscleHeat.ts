import { BODY_MAP_REGIONS, BodyMapView } from '../components/bodymap/bodyMapPaths';

/**
 * "Trained this week" on the Muscles figure: turns the backend's per-muscle
 * heat into per-region fills and one-line captions. Pure; tested.
 */

export interface MuscleHeatEntry {
  /** Catalog sub-muscle ("Quads"). */
  muscle: string;
  group: string;
  score: number;
  /** 0..1 */
  intensity: number;
  sets: number;
  assistSets: number;
  lastTrainedAt: string;
}

export interface MuscleHeat {
  days: number;
  generatedAt: string;
  muscles: MuscleHeatEntry[];
}

/** Floor so a lightly-touched muscle still shows as touched, not as nothing. */
const MIN_VISIBLE_ALPHA = 0.18;

/** #RRGGBB + 0..1 -> #RRGGBBAA */
export function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return hex + a;
}

export function heatByMuscle(heat: MuscleHeat | null): Map<string, MuscleHeatEntry> {
  const out = new Map<string, MuscleHeatEntry>();
  if (!heat) return out;
  for (const m of heat.muscles) out.set(m.muscle, m);
  return out;
}

/**
 * Fill alpha per region key on a view: the intensity of the region's catalog
 * sub-muscle, lifted to a visible floor; regions without heat get 0.
 */
export function heatAlphaByRegion(view: BodyMapView, heat: MuscleHeat | null): Record<string, number> {
  const byMuscle = heatByMuscle(heat);
  const out: Record<string, number> = {};
  for (const [key, region] of Object.entries(BODY_MAP_REGIONS[view])) {
    const entry = region.sub ? byMuscle.get(region.sub) : undefined;
    out[key] = entry ? Math.max(MIN_VISIBLE_ALPHA, Math.min(1, entry.intensity)) : 0;
  }
  return out;
}

/** Whole local days between two instants (0 = today). */
export function daysAgo(iso: string, now: Date): number {
  const then = new Date(iso);
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  return Math.max(0, Math.round((a - b) / 86_400_000));
}

/** "Trained today · 12 sets" / "Trained 3 days ago · 6 sets, assisted in 4" / "Not trained recently". */
export function describeHeat(entry: MuscleHeatEntry | undefined, now: Date): string {
  if (!entry) return 'Not trained recently';
  const d = daysAgo(entry.lastTrainedAt, now);
  const when = d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  const parts: string[] = [];
  if (entry.sets > 0) parts.push(`${entry.sets} ${entry.sets === 1 ? 'set' : 'sets'}`);
  if (entry.assistSets > 0) parts.push(`assisted in ${entry.assistSets}`);
  const detail = parts.length ? ` · ${parts.join(', ')}` : '';
  return `Trained ${when}${detail}`;
}
