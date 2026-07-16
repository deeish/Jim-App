import type {
  GeneratedSession,
  GeneratedSessionExercise,
} from './session-enrichment';
import { baseMovementKey } from './base-movement-key';
import { equipmentSatisfies } from '../data/exercise-mappings';

/**
 * Deterministic cardio-day builder. `type: 'cardio'` sessions previously passed
 * through enrichment untouched, shipping raw LLM rows like "2×15 trail hiking"
 * with no time prescription or metadata. This module replaces the LLM's cardio
 * content entirely: one modality main block (steady or intervals, alternating
 * across the plan's cardio days) plus two short core rows, with warm-up and
 * cool-down copy stamped — a clear, executable plan with zero model reliance.
 */

/** Aligns with `WorkoutGeneratorService.cardioExerciseMatchesModality`. */
export function cardioNameMatchesModality(
  name: string,
  modality: string,
): boolean {
  const n = (name ?? '').toLowerCase();
  const m = modality.toLowerCase().trim();
  if (!m) return false;
  if (m === 'run' || m === 'running') return /\b(run|jog|treadmill)\b/i.test(n);
  if (m === 'bike' || m === 'cycle')
    return /\b(bike|bicycle|cycle|assault bike|air bike)\b/i.test(n);
  if (m === 'row' || m === 'rowing') return /\b(row|rowing)\b/i.test(n);
  if (m === 'swim' || m === 'swimming') return /\b(swim)\b/i.test(n);
  if (m === 'elliptical')
    return /\b(elliptical|arc trainer|cross trainer)\b/i.test(n);
  return n.includes(m);
}

type CardioTemplateExerciseMeta = {
  id: string;
  name: string;
  primaryMuscleGroup?: string;
  secondaryMuscleGroups?: string[];
  prescriptionType?: GeneratedSessionExercise['prescriptionType'];
  /** Required equipment labels; empty/omitted = doable anywhere. */
  primaryEquipment?: string[];
  equipment?: string[];
};

export type CardioTemplateLibrary = {
  findOne(id: string): CardioTemplateExerciseMeta | undefined;
  getCandidatesForGenerator(options: {
    focus: string;
    equipment?: string[];
    excludeIds?: string[];
    limit?: number;
  }): CardioTemplateExerciseMeta[];
};

/**
 * Candidate library ids per whitelisted modality (see
 * `PlansService.CARDIO_MODALITY_WHITELIST`), in preference order — the first
 * candidate whose required equipment the user actually has wins (a home run
 * day gets the outdoor jog, not a treadmill). Steady is the default style;
 * intervals alternate in on every second cardio day.
 */
const MODALITY_MAIN_IDS: Record<
  string,
  { steady: string[]; intervals: string[] }
> = {
  run: {
    steady: ['treadmill_jog_steady', 'outdoor_jog_steady'],
    intervals: ['treadmill_run_intervals', 'outdoor_run_intervals'],
  },
  bike: {
    steady: ['stationary_bike_steady'],
    intervals: ['stationary_bike_intervals'],
  },
  row: {
    steady: ['rowing_machine_steady'],
    intervals: ['rowing_machine_intervals'],
  },
  elliptical: {
    steady: ['elliptical_steady'],
    intervals: ['elliptical_intervals'],
  },
  swim: { steady: ['swimming_laps_easy'], intervals: ['swimming_laps_easy'] },
};

/** Modality-neutral fallback when no listed modality resolves in the catalog. */
const FALLBACK_MAIN_ID = 'zone_2_training_session';

function nameMatchesAvoid(name: string, phrases: string[]): boolean {
  const nl = (name ?? '').toLowerCase();
  return phrases.some((p) => {
    const x = p.toLowerCase().trim();
    return x.length >= 2 && nl.includes(x);
  });
}

function mainBlockRow(
  meta: CardioTemplateExerciseMeta,
  seconds: number,
  style: 'steady' | 'intervals',
  minutes: number,
): GeneratedSessionExercise {
  const notes =
    style === 'steady'
      ? `${minutes} min at a steady, conversational pace (zone 2). If you can't talk in short sentences, ease off.`
      : `${minutes} min total: 3 min easy, then alternate 1 min brisk / 2 min easy. Finish the last 2 min easy.`;
  return {
    name: meta.name,
    exerciseId: meta.id,
    sets: 1,
    reps: seconds,
    durationSeconds: seconds,
    prescriptionType: 'time',
    notes,
    primaryMuscleGroup: meta.primaryMuscleGroup ?? 'Cardio',
    ...(meta.secondaryMuscleGroups?.length
      ? { secondaryMuscleGroups: [...meta.secondaryMuscleGroups] }
      : {}),
  };
}

function coreRow(meta: CardioTemplateExerciseMeta): GeneratedSessionExercise {
  const isTime = meta.prescriptionType === 'time';
  return {
    name: meta.name,
    exerciseId: meta.id,
    sets: 3,
    reps: isTime ? 40 : 12,
    ...(isTime ? { durationSeconds: 40 } : {}),
    prescriptionType: isTime ? 'time' : 'reps',
    notes: 'Easy core work while your heart rate settles. Quality over speed.',
    ...(meta.primaryMuscleGroup
      ? { primaryMuscleGroup: meta.primaryMuscleGroup }
      : {}),
    ...(meta.secondaryMuscleGroups?.length
      ? { secondaryMuscleGroups: [...meta.secondaryMuscleGroups] }
      : {}),
  };
}

function resolveMainExercise(
  library: CardioTemplateLibrary,
  modalities: string[] | undefined,
  style: 'steady' | 'intervals',
  cardioDayIndex: number,
  avoidPhrases: string[],
  equipment: string[] | undefined,
): CardioTemplateExerciseMeta | undefined {
  // The modality map bypasses the generation pools, so it must apply the same
  // required-equipment rule itself — a home run day must resolve to the
  // outdoor jog, and swim without a pool must fall through entirely.
  const usable = (meta: CardioTemplateExerciseMeta | undefined) =>
    !!meta &&
    !nameMatchesAvoid(meta.name, avoidPhrases) &&
    (!equipment?.length ||
      equipmentSatisfies(meta.primaryEquipment ?? meta.equipment, equipment));
  const listed = (modalities ?? [])
    .map((m) => m.toLowerCase().trim())
    .filter((m) => m in MODALITY_MAIN_IDS);
  // Rotate through the user's modalities across cardio days for variety.
  const ordered = listed.length
    ? [...listed.slice(cardioDayIndex % listed.length), ...listed]
    : [];
  for (const m of ordered) {
    for (const id of MODALITY_MAIN_IDS[m]![style]) {
      const meta = library.findOne(id);
      if (usable(meta)) return meta;
    }
  }
  const fallback = library.findOne(FALLBACK_MAIN_ID);
  if (usable(fallback)) return fallback;
  // Last resort: any catalog Cardio row the user's equipment supports.
  return library
    .getCandidatesForGenerator({
      focus: 'cardio',
      equipment: equipment?.length ? equipment : undefined,
      limit: 30,
    })
    .find((c) => c.primaryMuscleGroup === 'Cardio' && usable(c));
}

function pickCoreRows(
  library: CardioTemplateLibrary,
  equipment: string[] | undefined,
  excludeIds: string[],
  avoidPhrases: string[],
  count: number,
): CardioTemplateExerciseMeta[] {
  const pool = library.getCandidatesForGenerator({
    focus: 'core',
    equipment: equipment?.length ? equipment : undefined,
    excludeIds,
    limit: 40,
  });
  const picks: CardioTemplateExerciseMeta[] = [];
  const usedKeys = new Set<string>();
  for (const c of pool) {
    if (picks.length >= count) break;
    if (c.primaryMuscleGroup !== 'Core') continue;
    if (nameMatchesAvoid(c.name, avoidPhrases)) continue;
    const key = baseMovementKey(c.id);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    picks.push(c);
  }
  return picks;
}

export type BuildCardioDaySessionArgs = {
  session: GeneratedSession;
  library: CardioTemplateLibrary;
  equipment?: string[];
  avoidPhrases?: string[];
  /** Normalized, ordered user preference (run, bike, row, elliptical, swim). */
  modalities?: string[];
  /** Session length target (mean of durationMin/Max). Defaults to 30. */
  durationMinutes?: number;
  /** 0-based index among the request's cardio days — alternates steady/intervals and rotates modalities. */
  cardioDayIndex?: number;
  /** Ids already used elsewhere in the chunk so core picks stay distinct. */
  chunkExcludeExerciseIds?: string[];
};

/**
 * Returns a new session whose exercises are the deterministic cardio template.
 * Falls back to the original session untouched only when the catalog offers no
 * usable Cardio row at all (practically impossible with the shipped library).
 */
export function buildCardioDaySession(
  args: BuildCardioDaySessionArgs,
): GeneratedSession {
  const avoidPhrases = args.avoidPhrases ?? [];
  const cardioDayIndex = Math.max(0, args.cardioDayIndex ?? 0);
  const style: 'steady' | 'intervals' =
    cardioDayIndex % 2 === 0 ? 'steady' : 'intervals';

  const main = resolveMainExercise(
    args.library,
    args.modalities,
    style,
    cardioDayIndex,
    avoidPhrases,
    args.equipment,
  );
  if (!main) return args.session;

  const rawDuration = args.durationMinutes;
  const duration =
    typeof rawDuration === 'number' &&
    Number.isFinite(rawDuration) &&
    rawDuration > 0
      ? Math.min(90, Math.max(15, Math.round(rawDuration)))
      : 30;
  // Budget: ~5 min warm-up + ~4 min cool-down (copy) and ~6 min core rows.
  const mainMinutes = Math.max(8, duration - 15);
  const mainSeconds = mainMinutes * 60;

  const core = pickCoreRows(
    args.library,
    args.equipment,
    [
      main.id,
      ...(args.chunkExcludeExerciseIds ?? []).filter((id) => id.trim()),
    ],
    avoidPhrases,
    2,
  );

  const exercises: GeneratedSessionExercise[] = [
    mainBlockRow(main, mainSeconds, style, mainMinutes),
    ...core.map(coreRow),
  ];

  const styleLabel =
    style === 'steady' ? 'a steady zone-2 block' : 'brisk/easy intervals';
  const reasoning = `Aerobic base day: ${styleLabel} on the ${main.name.toLowerCase()}, then short core work while you cool down. Easy on the joints and simple to repeat each week.`;
  const warmUp = `5 min very easy pace on the ${main.name.toLowerCase()} to ramp your heart rate, plus a few leg swings and ankle circles.`;
  const coolDown =
    '3–4 min easy walking to bring your heart rate down, then stretch calves, quads, and hip flexors.';

  return {
    ...args.session,
    exercises,
    warmUp,
    coolDown,
    reasoning,
  };
}
