import type {
  GeneratedSession,
  GeneratedSessionExercise,
} from './session-enrichment';
import {
  nameMatchesAvoidList,
  sessionTitleIsLowerEmphasis,
  sessionTitleIsUpperEmphasis,
} from './session-enrichment';
import {
  getRoleAwareScheme,
  getRoleRestSeconds,
  getRoleTargetRir,
} from '../data/set-rep-schemes';
import { plannedLiftingMinutes } from '../workouts/workout-generator.service';

/**
 * Muscle exposure floor (rig run 2026-09-17, second pass).
 *
 * The pattern floors guarantee a horizontal press exists somewhere in the
 * week; they do not guarantee a big muscle is trained twice. A four-day
 * Upper/Lower came back with chest on Monday only (bench and dips) and an
 * Upper 2 of press, row, chin-up and face pull. With three or more lifting
 * days every big muscle should be hit on two, which is what the coach check
 * scores. This pass adds one isolation for a once-a-week muscle to a day
 * that fits it, has room, and does not already train it, so the model's
 * week still stands and the muscle gets its second exposure.
 */

export const BIG_MUSCLES = ['Chest', 'Back', 'Legs', 'Shoulders'] as const;
type BigMuscle = (typeof BIG_MUSCLES)[number];

const SECONDS_UNDER_LOAD = 35;
const WARMUP_SECONDS = 6 * 60;
const MAX_ROWS_PER_SESSION = 6;
const MIN_SETS_TO_ADD = 2;

export type ExposureExerciseMeta = {
  id: string;
  name: string;
  primaryMuscleGroup?: string;
  secondaryMuscleGroups?: string[];
  movementPatterns?: string[];
  type?: string;
  prescriptionType?: string;
};

export type ExposureLibrary = {
  findOne(id: string): ExposureExerciseMeta | undefined;
  getCandidatesForGenerator(options: {
    focus: string;
    equipment?: string[];
    excludeIds?: string[];
    limit?: number;
  }): ExposureExerciseMeta[];
};

type Spec = {
  type: string;
  title?: string;
  weekIndex: number;
  weekday: string;
  durationMin: number;
  durationMax: number;
};

function hostAccepts(title: string | undefined, muscle: BigMuscle): boolean {
  const t = (title ?? '').toLowerCase();
  const upper = sessionTitleIsUpperEmphasis(title);
  const lower = sessionTitleIsLowerEmphasis(title);
  const fullBody = !upper && !lower;
  if (muscle === 'Legs') return lower || fullBody;
  if (muscle === 'Back')
    return fullBody || (upper && !/\bpush\b|\bchest\b/.test(t));
  return fullBody || (upper && !/\bpull\b|\bback\b/.test(t));
}

function focusFor(muscle: BigMuscle): string {
  return muscle === 'Legs' ? 'lower' : muscle.toLowerCase();
}

function isCardio(
  e: GeneratedSessionExercise,
  meta: ExposureExerciseMeta | undefined,
): boolean {
  if (e.prescriptionType === 'time' || e.durationSeconds != null) return true;
  return (meta?.primaryMuscleGroup ?? e.primaryMuscleGroup ?? '') === 'Cardio';
}

function setCost(e: GeneratedSessionExercise): number {
  return (e.restSeconds ?? 90) + SECONDS_UNDER_LOAD;
}

function spareSeconds(
  session: GeneratedSession,
  spec: Spec,
  goal: string | undefined,
  findMeta: (id: string) => ExposureExerciseMeta | undefined,
): number {
  const minutes = plannedLiftingMinutes({
    durationMin: spec.durationMin,
    durationMax: spec.durationMax,
    sessionType: spec.type,
    goal,
  });
  let cost = 0;
  for (const e of session.exercises ?? []) {
    const meta = e.exerciseId ? findMeta(e.exerciseId) : undefined;
    if (isCardio(e, meta)) {
      cost += (e.durationSeconds ?? 0) * Math.max(1, e.sets || 1);
      continue;
    }
    cost += Math.max(0, e.sets ?? 0) * setCost(e);
  }
  return minutes * 60 - WARMUP_SECONDS - cost;
}

export type ExposureFloorResult = {
  sessions: GeneratedSession[];
  repairs: number;
  notes: string[];
};

export function enforceMuscleExposureFloor(args: {
  sessions: GeneratedSession[];
  specs: Spec[];
  library: ExposureLibrary;
  equipment?: string[];
  avoidConstraintsGlobal?: string[];
  prefs: { goal?: string; difficulty?: string };
}): ExposureFloorResult {
  const { specs, library, equipment, prefs } = args;
  if (args.sessions.length !== specs.length) {
    return { sessions: args.sessions, repairs: 0, notes: [] };
  }
  const sessions = args.sessions.map((s) => ({
    ...s,
    exercises: (s.exercises ?? []).map((e) => ({ ...e })),
  }));
  const findMeta = (id: string) => library.findOne(id);
  const avoid = (args.avoidConstraintsGlobal ?? []).filter(
    (p) => typeof p === 'string' && p.trim().length >= 2,
  );
  const notes: string[] = [];
  let repairs = 0;

  for (const weekIndex of [...new Set(specs.map((s) => s.weekIndex))]) {
    const idx = specs
      .map((s, i) =>
        s.weekIndex === weekIndex &&
        s.type === 'strength' &&
        (sessions[i]!.exercises?.length ?? 0) > 0
          ? i
          : -1,
      )
      .filter((i) => i >= 0);
    if (idx.length < 3) continue;

    const daysTraining = (muscle: BigMuscle): number[] =>
      idx.filter((i) =>
        sessions[i]!.exercises.some((e) => {
          const meta = e.exerciseId ? findMeta(e.exerciseId) : undefined;
          return (
            !isCardio(e, meta) &&
            (e.sets ?? 0) > 0 &&
            (meta?.primaryMuscleGroup ?? e.primaryMuscleGroup) === muscle
          );
        }),
      );
    const usedIds = () =>
      new Set(
        idx.flatMap((i) =>
          sessions[i]!.exercises.map((e) => e.exerciseId?.trim()).filter(
            (x): x is string => !!x,
          ),
        ),
      );
    const usedNames = () =>
      new Set(
        idx.flatMap((i) =>
          sessions[i]!.exercises.map((e) =>
            (e.name ?? '').trim().toLowerCase(),
          ),
        ),
      );

    for (const muscle of BIG_MUSCLES) {
      const trained = daysTraining(muscle);
      if (trained.length === 0 || trained.length >= 2) continue; // untrained is the model's split choice; the coach check reports it
      const hosts = idx
        .filter((i) => !trained.includes(i))
        .filter((i) => hostAccepts(specs[i]!.title, muscle))
        .filter(
          (i) =>
            sessions[i]!.exercises.filter(
              (e) => !isCardio(e, findMeta(e.exerciseId ?? '')),
            ).length < MAX_ROWS_PER_SESSION,
        )
        .map((i) => ({
          i,
          spare: spareSeconds(sessions[i]!, specs[i]!, prefs.goal, findMeta),
        }))
        .filter((h) => h.spare >= MIN_SETS_TO_ADD * (60 + SECONDS_UNDER_LOAD))
        .sort((a, b) => b.spare - a.spare);
      const host = hosts[0];
      if (!host) {
        notes.push(
          `${muscle} once this week and no day with room for a second exposure`,
        );
        continue;
      }
      const ids = usedIds();
      const names = usedNames();
      const pool = library.getCandidatesForGenerator({
        focus: focusFor(muscle),
        equipment: equipment?.length ? equipment : undefined,
        excludeIds: [...ids],
        limit: 120,
      });
      const fits = (c: ExposureExerciseMeta) =>
        (c.primaryMuscleGroup ?? '') === muscle &&
        !ids.has(c.id) &&
        !names.has(c.name.trim().toLowerCase()) &&
        !nameMatchesAvoidList(c.name, avoid) &&
        !(c.movementPatterns ?? []).includes('Hinge');
      const pick =
        pool.find(
          (c) => fits(c) && (c.type ?? '').toLowerCase() === 'isolation',
        ) ?? pool.find(fits);
      if (!pick) {
        notes.push(
          `${muscle} once this week and no catalog fit for a second exposure`,
        );
        continue;
      }
      const scheme = getRoleAwareScheme(
        prefs.goal,
        prefs.difficulty,
        'isolation',
      );
      const spareSets = Math.floor(
        host.spare /
          (getRoleRestSeconds(prefs.goal, prefs.difficulty, 'isolation') +
            SECONDS_UNDER_LOAD),
      );
      const sets = Math.max(MIN_SETS_TO_ADD, Math.min(scheme.sets, spareSets));
      const row: GeneratedSessionExercise = {
        name: pick.name,
        exerciseId: pick.id,
        sets,
        reps: scheme.repsMin,
        repsMin: scheme.repsMin,
        repsMax: scheme.repsMax,
        restSeconds: getRoleRestSeconds(
          prefs.goal,
          prefs.difficulty,
          'isolation',
        ),
        targetRir: getRoleTargetRir(prefs.goal, prefs.difficulty, 'isolation'),
        prescriptionType:
          (pick.prescriptionType as GeneratedSessionExercise['prescriptionType']) ??
          'reps',
        primaryMuscleGroup: pick.primaryMuscleGroup,
        ...(pick.secondaryMuscleGroups?.length
          ? { secondaryMuscleGroups: [...pick.secondaryMuscleGroups] }
          : {}),
        notes: `Added so ${muscle.toLowerCase()} is trained twice this week; twice a week grows and holds strength better than once.`,
      };
      // Before the core and cardio tail, after the lifts.
      const rows = sessions[host.i]!.exercises;
      const tailStart = rows.findIndex((e) => {
        const meta = e.exerciseId ? findMeta(e.exerciseId) : undefined;
        return (
          isCardio(e, meta) ||
          (meta?.primaryMuscleGroup ?? e.primaryMuscleGroup) === 'Core'
        );
      });
      const insertAt = tailStart >= 0 ? tailStart : rows.length;
      sessions[host.i]!.exercises = [
        ...rows.slice(0, insertAt),
        row,
        ...rows.slice(insertAt),
      ];
      repairs += 1;
      notes.push(
        `${specs[host.i]!.title ?? specs[host.i]!.weekday} (week ${weekIndex}): +${pick.name} ${sets} sets so ${muscle} is trained twice`,
      );
    }
  }
  // Untouched sessions go back as the caller's own objects.
  const out = sessions.map((s, i) => {
    const before = args.sessions[i]!;
    const changed =
      (s.exercises ?? []).length !== (before.exercises ?? []).length;
    return changed ? s : before;
  });
  return { sessions: out, repairs, notes };
}
