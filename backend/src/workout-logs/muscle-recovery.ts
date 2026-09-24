import type { MuscleInvolvement } from '../data/exercise-muscle-involvement';
import { groupOfRegion } from '../data/muscle-regions';

/**
 * Recovery estimate per body-map region ("how used is each muscle right now"),
 * from the user's logged sets. Pure, like `muscle-heat.ts`, which it extends:
 *
 * - Dose per session and region = completed sets × hardness × novelty × the
 *   exercise's involvement weight for that region (the retag). Hardness comes
 *   from logged RPE when present (RPE 8 = 1.0, clamped 0.6–1.2), novelty is a
 *   bump for an exercise not seen in the previous six weeks.
 * - A session's fatigue RISES after training and peaks a day or two later,
 *   then fades: f(t) = (t/τ)·e^(1−t/τ). Small muscles peak sooner (24 h) and
 *   clear faster than large ones (40 h); ~four vs seven days to clear.
 * - Doses still in play are summed and saturated into a 0..1 level, cut into
 *   five steps for the figure's scale.
 * - Calibration: the finish screen's 0–2 soreness answers stretch or shrink
 *   the person's curve (±15 %), so the estimate learns them over time.
 * - Corrections: a "sore" note pins the region to the top step and fades over
 *   SORE_NOTE_DAYS; a "fine" note discards doses from before it was made.
 */

export const RECOVERY_LOOKBACK_DAYS = 10;
export const NOVELTY_LOOKBACK_DAYS = 42;
export const NOVELTY_FACTOR = 1.4;
export const SATURATION_DOSE = 8;
export const SORE_NOTE_DAYS = 3;
export const STEP_THRESHOLDS = [0.08, 0.28, 0.48, 0.68, 0.85];
export const STEP_LABELS = [
  'Fresh',
  'Lightly worked',
  'Recovering',
  'Working hard',
  'Fatigued',
  'Very fatigued',
];
/** Hours to peak fatigue by muscle size. */
export const PEAK_HOURS = { small: 24, medium: 32, large: 40 } as const;

const LARGE = new Set([
  'Rectus Femoris',
  'Vastus Lateralis',
  'Vastus Medialis',
  'Biceps Femoris',
  'Semitendinosus',
  'Glute Max',
  'Lats',
  'Upper Back',
  'Lower Traps',
  'Erector Spinae',
  'Upper Chest',
  'Mid Chest',
  'Lower Chest',
  'Adductor Magnus',
  'Adductors',
]);
const SMALL = new Set([
  'Biceps (long head)',
  'Biceps (short head)',
  'Brachialis',
  'Triceps (long head)',
  'Triceps (medial head)',
  'Triceps (lateral head)',
  'Brachioradialis',
  'Wrist Extensors',
  'Wrist Flexors',
  'Flexor Carpi Ulnaris',
  'Gastrocnemius',
  'Gastrocnemius (medial)',
  'Gastrocnemius (lateral)',
  'Soleus',
  'Front Delts',
  'Side Delts',
  'Rear Delts',
  'Infraspinatus',
  'Obliques',
  'TFL',
  'Gracilis',
  'Sartorius',
  'Tibialis Anterior',
]);

export function peakHoursFor(region: string): number {
  return LARGE.has(region)
    ? PEAK_HOURS.large
    : SMALL.has(region)
      ? PEAK_HOURS.small
      : PEAK_HOURS.medium;
}

/** Fatigue from one session at `hours` after it, peaking at `tau`. */
export function fatigueCurve(hours: number, tau: number): number {
  if (hours <= 0) return 0;
  return (hours / tau) * Math.exp(1 - hours / tau);
}

export function hardnessFromRpe(rpes: (number | null | undefined)[]): number {
  const vals = rpes.filter((r): r is number => typeof r === 'number' && r > 0);
  if (vals.length === 0) return 1;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(0.6, Math.min(1.2, mean / 8));
}

/** Mean check-in soreness (0–2) -> curve multiplier 0.85..1.15; no answers -> 1. */
export function calibrationFromSoreness(
  answers: (number | null | undefined)[],
): number {
  const vals = answers.filter((s): s is number => typeof s === 'number');
  if (vals.length === 0) return 1;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return 1 + (mean - 1) * 0.15;
}

export function levelToStep(level: number): number {
  let step = 0;
  for (let i = 0; i < STEP_THRESHOLDS.length; i++)
    if (level >= STEP_THRESHOLDS[i]) step = i + 1;
  return step;
}

export interface RecoverySet {
  completed: boolean;
  rpe?: number | null;
}
export interface RecoveryEntry {
  exerciseId: string;
  completedSets: RecoverySet[];
}
export interface RecoveryLog {
  startedAt: Date;
  /** Post-session check-in soreness 0–2, when answered. */
  soreness?: number | null;
  entries: RecoveryEntry[];
}
export interface RecoveryExercise {
  muscles: MuscleInvolvement[];
}
export interface RecoveryNote {
  region: string;
  kind: 'sore' | 'fine';
  createdAt: Date;
}

export interface RecoveryRegion {
  region: string;
  /** Catalog sub-muscle, or the region itself when it has none. */
  muscle: string;
  group: string;
  /** 0..1 */
  level: number;
  /** 0 fresh .. 5 very fatigued */
  step: number;
  label: string;
  /** Raw completed sets that targeted it directly (weight >= 0.6) inside the window. */
  sets: number;
  assistSets: number;
  lastTrainedAt: string | null;
  /** Days until the estimate drops to "fresh"/"lightly worked"; 0 when it already has. */
  freshInDays: number;
  /** Any live correction. */
  note: { kind: 'sore' | 'fine'; at: string } | null;
  /** True when one of `exerciseIdsToday` works this region. */
  touchedToday: boolean;
}

export interface MuscleRecovery {
  generatedAt: string;
  regions: RecoveryRegion[];
}

interface Dose {
  at: number;
  amount: number;
}

export function computeMuscleRecovery(opts: {
  logs: RecoveryLog[];
  lookup: (exerciseId: string) => RecoveryExercise | undefined;
  notes: RecoveryNote[];
  now: Date;
  exerciseIdsToday?: string[];
}): MuscleRecovery {
  const { logs, lookup, notes, now } = opts;
  const nowMs = now.getTime();
  const windowStart = nowMs - RECOVERY_LOOKBACK_DAYS * 86_400_000;
  const calibration = calibrationFromSoreness(
    logs
      .filter((l) => l.startedAt.getTime() >= windowStart)
      .map((l) => l.soreness),
  );
  const noteByRegion = new Map(notes.map((n) => [n.region, n]));

  // First appearance of each exercise in the lookback, for novelty.
  const sorted = [...logs].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
  );
  const firstSeen = new Map<string, number>();
  for (const log of sorted) {
    for (const e of log.entries) {
      if (!firstSeen.has(e.exerciseId))
        firstSeen.set(e.exerciseId, log.startedAt.getTime());
    }
  }

  const doses = new Map<string, Dose[]>();
  const stats = new Map<
    string,
    { sub: string | null; sets: number; assistSets: number; last: number }
  >();
  for (const log of sorted) {
    const at = log.startedAt.getTime();
    if (at < windowStart || at > nowMs + 60_000) continue;
    for (const entry of log.entries) {
      const done = entry.completedSets.filter((s) => s.completed);
      if (done.length === 0) continue;
      const ex = lookup(entry.exerciseId);
      if (!ex || !ex.muscles || ex.muscles.length === 0) continue;
      const hardness = hardnessFromRpe(done.map((s) => s.rpe));
      // Novel = first time this exercise appears in the six-week lookback
      // (callers fetch NOVELTY_LOOKBACK_DAYS of logs for this reason).
      const novelty =
        (firstSeen.get(entry.exerciseId) ?? at) >= at - 60_000
          ? NOVELTY_FACTOR
          : 1;
      for (const m of ex.muscles) {
        const fine = noteByRegion.get(m.region);
        if (fine && fine.kind === 'fine' && at < fine.createdAt.getTime())
          continue;
        const list = doses.get(m.region) ?? [];
        list.push({ at, amount: done.length * hardness * novelty * m.weight });
        doses.set(m.region, list);
        const st = stats.get(m.region) ?? {
          sub: m.sub,
          sets: 0,
          assistSets: 0,
          last: 0,
        };
        if (m.weight >= 0.6) st.sets += done.length;
        else st.assistSets += done.length;
        st.last = Math.max(st.last, at);
        stats.set(m.region, st);
      }
    }
  }

  const levelAt = (region: string, t: number): number => {
    const tau = peakHoursFor(region) * calibration;
    let sum = 0;
    for (const d of doses.get(region) ?? [])
      sum += d.amount * fatigueCurve((t - d.at) / 3_600_000, tau);
    let level = 1 - Math.exp(-sum / SATURATION_DOSE);
    const note = noteByRegion.get(region);
    if (note && note.kind === 'sore') {
      const ageDays = (t - note.createdAt.getTime()) / 86_400_000;
      if (ageDays >= 0 && ageDays < SORE_NOTE_DAYS)
        level = Math.max(level, 1 - ageDays / SORE_NOTE_DAYS);
    }
    return level;
  };

  const todayIds = new Set(opts.exerciseIdsToday ?? []);
  const touched = new Set<string>();
  for (const id of todayIds)
    for (const m of lookup(id)?.muscles ?? []) touched.add(m.region);

  const regionsSeen = new Set<string>([
    ...doses.keys(),
    ...noteByRegion.keys(),
  ]);
  const regions: RecoveryRegion[] = [];
  for (const region of regionsSeen) {
    const level = levelAt(region, nowMs);
    const step = levelToStep(level);
    let freshInDays = 0;
    if (step >= 2) {
      freshInDays = 14;
      for (let h = 6; h <= 14 * 24; h += 6) {
        if (levelToStep(levelAt(region, nowMs + h * 3_600_000)) <= 1) {
          freshInDays = Math.ceil(h / 24);
          break;
        }
      }
    }
    const st = stats.get(region);
    const note = noteByRegion.get(region);
    regions.push({
      region,
      muscle: st?.sub ?? region,
      group: groupOfRegion(region),
      level: Math.round(level * 1000) / 1000,
      step,
      label: STEP_LABELS[step],
      sets: st?.sets ?? 0,
      assistSets: st?.assistSets ?? 0,
      lastTrainedAt: st && st.last ? new Date(st.last).toISOString() : null,
      freshInDays,
      note: note ? { kind: note.kind, at: note.createdAt.toISOString() } : null,
      touchedToday: touched.has(region),
    });
  }
  regions.sort((a, b) => b.level - a.level || a.region.localeCompare(b.region));
  return { generatedAt: now.toISOString(), regions };
}
