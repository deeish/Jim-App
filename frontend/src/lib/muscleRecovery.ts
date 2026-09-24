import { BODY_MAP_REGIONS, BodyMapView } from '../components/bodymap/bodyMapPaths';

/**
 * The Recovery layer on the Muscles figure: turns the backend's per-region
 * recovery estimate into fills on one five-step scale, plus the sheet line.
 * Pure; tested.
 */

export type RecoveryNoteKind = 'sore' | 'fine';

export interface RecoveryRegion {
  region: string;
  muscle: string;
  group: string;
  level: number;
  /** 0 fresh .. 5 very fatigued */
  step: number;
  label: string;
  sets: number;
  assistSets: number;
  lastTrainedAt: string | null;
  freshInDays: number;
  note: { kind: RecoveryNoteKind; at: string } | null;
  touchedToday: boolean;
}

export interface MuscleRecovery {
  generatedAt: string;
  regions: RecoveryRegion[];
}

/**
 * Five steps, one warm family, lightness carrying the value and the hue
 * drifting amber -> red. Picked in OKLCH for even steps (~20 dE apart, 60–90
 * from either body tone), so the scale reads on both themes and under
 * colour-vision deficiency. Index 0 is step 1 ("lightly worked"); step 0 is
 * the figure's quiet tone.
 */
export const RECOVERY_SCALE = ['#F1AF57', '#E88519', '#D16022', '#C12B11', '#9B0E1E'] as const;

export const RECOVERY_STEP_LABELS = [
  'Fresh',
  'Lightly worked',
  'Recovering',
  'Working hard',
  'Fatigued',
  'Very fatigued',
] as const;

export function recoveryFill(step: number, quiet: string): string {
  if (step <= 0) return quiet;
  return RECOVERY_SCALE[Math.min(RECOVERY_SCALE.length, step) - 1];
}

export function recoveryByRegion(recovery: MuscleRecovery | null): Map<string, RecoveryRegion> {
  const out = new Map<string, RecoveryRegion>();
  if (!recovery) return out;
  for (const r of recovery.regions) out.set(r.region, r);
  return out;
}

/** Fill colour per region key on a view; regions the estimate has nothing on get the quiet tone. */
export function recoveryFillsByRegion(view: BodyMapView, recovery: MuscleRecovery | null, quiet: string): Record<string, string> {
  const byRegion = recoveryByRegion(recovery);
  const out: Record<string, string> = {};
  for (const key of Object.keys(BODY_MAP_REGIONS[view])) {
    out[key] = recoveryFill(byRegion.get(key)?.step ?? 0, quiet);
  }
  return out;
}

/** Whole local days between an instant and now (0 = today). */
export function daysAgoLocal(iso: string, now: Date): number {
  const then = new Date(iso);
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  return Math.max(0, Math.round((a - b) / 86_400_000));
}

/**
 * "Fatigued · trained yesterday, 16 sets · fresh in about 2 days" /
 * "Recovering · assisted in 6 · fresh tomorrow" / "Fresh · not trained recently".
 */
export function describeRecovery(entry: RecoveryRegion | undefined, now: Date): string {
  if (!entry || entry.step === 0) {
    const last = entry?.lastTrainedAt ? whenText(daysAgoLocal(entry.lastTrainedAt, now)) : null;
    return last ? `Fresh · trained ${last}` : 'Fresh · not trained recently';
  }
  const parts: string[] = [entry.label];
  if (entry.lastTrainedAt) {
    const when = whenText(daysAgoLocal(entry.lastTrainedAt, now));
    const work = entry.sets > 0 ? `, ${entry.sets} ${entry.sets === 1 ? 'set' : 'sets'}` : entry.assistSets > 0 ? `, assisted in ${entry.assistSets}` : '';
    parts.push(`trained ${when}${work}`);
  }
  if (entry.step >= 2) {
    parts.push(entry.freshInDays <= 0 ? 'fresh soon' : entry.freshInDays === 1 ? 'fresh tomorrow' : `fresh in about ${entry.freshInDays} days`);
  }
  return parts.join(' · ');
}

/** "You said still sore this morning" / "You said feeling fine yesterday". */
export function describeNote(note: RecoveryRegion['note'], now: Date): string | null {
  if (!note) return null;
  const d = daysAgoLocal(note.at, now);
  const when = d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  return `You said ${note.kind === 'sore' ? 'still sore' : 'feeling fine'} ${when}`;
}

function whenText(d: number): string {
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

/** Regions of today's session at step 3 or above, hottest first — what the pre-workout card names. */
export function fatiguedForToday(recovery: MuscleRecovery | null, minStep = 3): RecoveryRegion[] {
  if (!recovery) return [];
  return recovery.regions.filter((r) => r.touchedToday && r.step >= minStep).sort((a, b) => b.level - a.level);
}

/** Distinct catalog muscles of a region list, in order: "Quads and Hamstrings". */
export function muscleNamesSentence(regions: RecoveryRegion[]): string {
  const names = [...new Set(regions.map((r) => r.muscle))];
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
