import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ExercisesService } from '../exercises/exercises.service';
import Groq from 'groq-sdk';
import { GenerateWorkoutDto } from './dto/generate-workout.dto';
import { CreateWorkoutDto } from './dto/create-workout.dto';
import {
  getSlotsForFocus,
  normalizeFocusToKey,
  type FocusKey,
} from '../data/program-templates';
import { getAnchorIdsForFocus } from '../data/anchor-exercises';
import { getSetRepGuidelines } from '../data/set-rep-schemes';
import { secondaryMusclesForPreview } from '../data/muscle-preview-tags';
import { inferPrescriptionTypeFromExerciseName } from '../data/exercise-prescription';
import {
  coachCopyToneBlock,
  sessionCoachingRailLine,
} from '../plans/session-coaching-rails';

/** Minimal shape for generator candidates (from exercise library). Metadata used for rules and prompts. */
export interface CandidateExercise {
  id: string;
  name: string;
  primaryMuscleGroup: string;
  equipment: string[];
  /** From library: Push, Pull, Squat, Hinge, Lunge, Carry. Used for slot enforcement. */
  movementPatterns: string[];
  /**
   * From library: e.g. Hamstrings, Upper Chest, Lats. First entry treated as the
   * primary mover (drives the per-session sub-muscle cap + prompt-pool rotation).
   */
  subMuscles: string[];
  /** Derived: bench, overhead, squat, row, etc. One per pattern for variety. */
  variationGroup: string;
  /** First equipment or "mixed". */
  equipmentType: string;
}

/** Last performance for one exercise (from logs). */
export interface LastPerformance {
  weight?: number;
  reps: number;
  setNumber?: number;
}

/**
 * Scales exercise count to session length so typical 45–60m strength work feels complete.
 * Prompt range + backfill minimum; cardio/recovery stay lighter.
 */
/** Exported for plan chunk quality gates (must match batch / per-session targets). */
export function exerciseTargetsForSession(
  durationMinutes: number,
  detailLevel: 'simple' | 'detailed',
  isCardioOrRecovery: boolean,
): { minExercises: number; promptRange: string } {
  if (isCardioOrRecovery) {
    return { minExercises: 3, promptRange: '3-6' };
  }
  const d = Math.max(25, Math.min(120, durationMinutes));
  if (detailLevel === 'simple') {
    if (d <= 40) return { minExercises: 4, promptRange: '4-5' };
    if (d <= 55) return { minExercises: 5, promptRange: '5-6' };
    return { minExercises: 6, promptRange: '6-8' };
  }
  if (d <= 38) return { minExercises: 5, promptRange: '5-6' };
  if (d <= 55) return { minExercises: 6, promptRange: '6-8' };
  return { minExercises: 7, promptRange: '7-10' };
}

/**
 * When true, batch Groq prompts require a library Cardio exercise last on strength days.
 * Same rule as `WorkoutGeneratorService` private `programGoalWantsCardioFinisher`.
 */
export function goalWantsStrengthCardioFinisher(
  goal: string | undefined,
): boolean {
  const g = (goal ?? '').toLowerCase();
  return (
    g.includes('hybrid') ||
    g.includes('fat loss') ||
    g.includes('fat_loss') ||
    g.includes('endurance') ||
    g.includes('balanced') ||
    g.includes('conditioning') ||
    g === 'cardio'
  );
}

const HYPE_TITLE_TOKEN = /\b(blast|beast|savage|shred|inferno|torch|obliterate|nitro)\b/i;
const HYPE_BODY_FOCUS_LINE =
  /\b(upper|lower)\s+body\s+(blast|power|strength|endurance)\b/i;
const HYPE_PUSH_PULL_LINE = /\b(push|pull)\s+(power|blast|strength)\b/i;

/**
 * Replace flashy LLM workout titles with "focus · weekday" for calmer preview copy.
 * Exported so plan polish / mapping can reuse the same rules.
 */
export function plainWorkoutTitle(
  raw: string | undefined,
  focusLabel: string,
  weekday: string,
): string {
  const label = (focusLabel || 'Session').trim();
  const w = (weekday || '').trim();
  const n = (raw ?? '').trim();
  const usePlain =
    !n ||
    n.length > 72 ||
    HYPE_TITLE_TOKEN.test(n) ||
    HYPE_BODY_FOCUS_LINE.test(n) ||
    HYPE_PUSH_PULL_LINE.test(n);
  const short =
    label.length > 48 ? `${label.slice(0, 46).replace(/\s+$/, '').trim()}…` : label;
  if (usePlain) {
    return w ? `${short} · ${w}` : short;
  }
  return n.slice(0, 120);
}

/** Upper bound from strings like "5-8" or "3-6" for hard caps in batch prompts. */
function maxExercisesFromPromptRange(promptRange: string): number {
  const m = promptRange.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) {
    const hi = parseInt(m[2]!, 10);
    if (!Number.isNaN(hi)) return hi;
  }
  const lo = parseInt(promptRange.replace(/[^\d].*/, '') || '0', 10);
  return lo > 0 ? lo : 10;
}

const MAX_PRIOR_WEEK_IDS_IN_BATCH_PROMPT = 48;

/** Merged focus-aware pool size (tabular lines); slightly under old 65 JSON rows. */
const BATCH_CANDIDATE_CAP = 58;

const PER_SESSION_CANDIDATE_LIMIT = 72;

/** Output cap per exercise when `experienceLevel === 'beginner'` (Groq completion size). */
export const BEGINNER_EXERCISE_NOTE_MAX_CHARS = 120;

/** Per-exercise `notes` only for beginner experience; strip and cap otherwise. */
export function normalizeExerciseNoteForOutput(
  raw: unknown,
  wantsNotes: boolean,
): string | undefined {
  if (!wantsNotes) return undefined;
  if (raw == null) return undefined;
  const s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  return s.slice(0, BEGINNER_EXERCISE_NOTE_MAX_CHARS);
}

function compactExerciseNameForBatchPrompt(name: string): string {
  return (name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\t/g, ' ')
    .slice(0, 56);
}

function formatCandidatesTabularForBatch(
  candidates: CandidateExercise[],
): string {
  return candidates
    .map(
      (c) =>
        `${c.id}\t${compactExerciseNameForBatchPrompt(c.name)}\t${(c.primaryMuscleGroup ?? '').slice(0, 28)}`,
    )
    .join('\n');
}

type GroqUsageLogShape = {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{ finish_reason?: string | null }>;
};

/** One Groq chat.completions call — for log aggregation / dashboards (no PII). */
export type GroqCompletionUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  finish_reason?: string | null;
};

export type FullProgramDaySession = {
  weekIndex: number;
  weekday: string;
  name: string;
  reasoning?: string;
  warmUp?: string;
  coolDown?: string;
  cardioFinisher?: { suggestion: string };
  exercises: Array<{
    name: string;
    sets: number;
    reps: number;
    weight?: number;
    notes?: string;
    exerciseId?: string;
  }>;
};

/** `null` = no Groq attempt (bad input / no candidates). */
export type GenerateFullProgramOutcome =
  | { ok: true; sessions: FullProgramDaySession[]; usage: GroqCompletionUsage }
  | { ok: false; usage?: GroqCompletionUsage };

function groqUsageFromResponse(response: GroqUsageLogShape): GroqCompletionUsage {
  const u = response.usage;
  return {
    prompt_tokens: u?.prompt_tokens,
    completion_tokens: u?.completion_tokens,
    total_tokens: u?.total_tokens,
    finish_reason: response.choices?.[0]?.finish_reason ?? null,
  };
}

/** Result of one per-session Groq call (`generateWithGroq`). */
export type GenerateWithGroqOutcome =
  | { ok: true; workout: CreateWorkoutDto; usage: GroqCompletionUsage }
  | { ok: false; usage: GroqCompletionUsage };

@Injectable()
export class WorkoutGeneratorService {
  private readonly logger = new Logger(WorkoutGeneratorService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly exercisesService: ExercisesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * @param groqUsageSink When set, each completed Groq `generateWithGroq` attempt appends
   *        one usage object (success or parse/length failure after the API returned).
   */
  async generateWorkout(
    generateWorkoutDto: GenerateWorkoutDto,
    groqUsageSink?: GroqCompletionUsage[],
  ): Promise<CreateWorkoutDto> {
    const { day, preferences, userId } = generateWorkoutDto;
    const focus = preferences?.focus ?? 'full body';
    const equipment = preferences?.equipment ?? [];

    const recentIds = userId ? await this.getRecentExerciseIds(userId) : [];
    const excludeFromVariety = preferences?.excludeExerciseIds ?? [];
    const allExclude = [...new Set([...recentIds, ...excludeFromVariety])];
    const rawCandidates = this.exercisesService.getCandidatesForGenerator({
      focus,
      equipment: equipment.length ? equipment : undefined,
      excludeIds: allExclude,
      limit: PER_SESSION_CANDIDATE_LIMIT,
    });

    const excludeNames = preferences?.excludeExerciseNames ?? [];
    let filtered = rawCandidates;
    if (excludeNames.length > 0) {
      const lowerExclude = excludeNames
        .map((n) => n.toLowerCase().trim())
        .filter((n) => n.length >= 2);
      if (lowerExclude.length > 0) {
        filtered = rawCandidates.filter(
          (c) =>
            !lowerExclude.some((ex) =>
              (c.name ?? '').toLowerCase().includes(ex),
            ),
        );
        if (filtered.length < 4) filtered = rawCandidates;
      }
    }
    const anchorIds = getAnchorIdsForFocus(focus);
    const toCandidate = (e: {
      id: string;
      name: string;
      primaryMuscleGroup: string;
      equipment?: string[];
      movementPatterns?: string[];
      subMuscles?: string[];
    }): CandidateExercise => ({
      id: e.id,
      name: e.name,
      primaryMuscleGroup: e.primaryMuscleGroup,
      equipment: e.equipment ?? [],
      movementPatterns: e.movementPatterns ?? [],
      subMuscles: e.subMuscles ?? [],
      variationGroup: this.getVariationGroupFromName(e.name),
      equipmentType: e.equipment && e.equipment[0] ? e.equipment[0] : 'mixed',
    });
    const focusKeyForCardio = normalizeFocusToKey(focus);
    let candidateList = this.buildCandidateListWithAnchorsFirst(
      filtered.map(toCandidate),
      anchorIds,
    );
    if (
      this.programGoalWantsCardioFinisher(preferences?.goal) &&
      focusKeyForCardio !== 'cardio' &&
      focusKeyForCardio !== 'recovery'
    ) {
      candidateList = this.appendCardioCandidatesToPool(
        candidateList,
        equipment,
        allExclude,
        14,
      );
    }

    const setRep = getSetRepGuidelines(
      preferences?.goal,
      preferences?.difficulty ?? preferences?.experience,
    );

    let lastPerformance: Map<string, LastPerformance> = new Map();
    if (userId && candidateList.length > 0) {
      lastPerformance = await this.getLastPerformanceForExercises(
        userId,
        candidateList.map((c) => c.id),
      );
    }

    const apiKey = this.config.get<string>('GROQ_API_KEY');
    const skipGroq = preferences?.skipGroq === true;
    if (apiKey?.trim() && candidateList.length >= 4 && !skipGroq) {
      try {
        const outcome = await this.generateWithGroq(
          generateWorkoutDto,
          apiKey,
          candidateList,
          setRep,
          lastPerformance,
        );
        if (groqUsageSink) groqUsageSink.push(outcome.usage);
        if (outcome.ok) return this.attachLibraryMuscleTags(outcome.workout);
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[WorkoutGenerator] Groq failed, using rule-based:',
            (err as Error)?.message ?? err,
          );
        }
      }
    }

    return this.attachLibraryMuscleTags(
      this.generateWorkoutByRules(candidateList, day, preferences, setRep),
    );
  }

  /** Attach primary/secondary muscle + prescription from library for preview clients. */
  private attachLibraryMuscleTags(workout: CreateWorkoutDto): CreateWorkoutDto {
    return {
      ...workout,
      exercises: workout.exercises.map((ex) => {
        const id = ex.exerciseId?.trim();
        if (!id) return ex;
        const meta = this.exercisesService.findOne(id);
        if (!meta) return ex;
        const secondaries = secondaryMusclesForPreview(
          meta.secondaryMuscleGroups,
          meta.primaryMuscleGroup,
        );
        return {
          ...ex,
          primaryMuscleGroup: meta.primaryMuscleGroup,
          ...(secondaries.length ? { secondaryMuscleGroups: secondaries } : {}),
          prescriptionType:
            meta.prescriptionType ??
            inferPrescriptionTypeFromExerciseName(ex.name),
        };
      }),
    };
  }

  /** Derive variation group from exercise name for one-per-pattern rules. */
  private getVariationGroupFromName(name: string): string {
    const n = (name ?? '').toLowerCase();
    const patterns = [
      'squat',
      'deadlift',
      'lunge',
      'hip thrust',
      'thrust',
      'row',
      'pulldown',
      'push-down',
      'pull-up',
      'pullup',
      'bench',
      'overhead',
      'dip',
      'fly',
      'flye',
      'crossover',
      'extension',
      'raise',
      'curl',
      'pullover',
      'press',
      'crunch',
      'plank',
    ];
    for (const p of patterns) {
      if (n.includes(p)) return p;
    }
    return n.split(/\s+/).pop() ?? n.slice(0, 20);
  }

  /** Build candidate list: 1–2 anchors at top, then rest anchors, then shuffled non-anchors. Output is shuffled for prompt so model doesn’t always see same order. */
  private buildCandidateListWithAnchorsFirst(
    candidates: CandidateExercise[],
    anchorIds: string[],
  ): CandidateExercise[] {
    const byId = new Map(candidates.map((e) => [e.id, e]));
    const anchorsInCandidates: CandidateExercise[] = [];
    const seen = new Set<string>();
    for (const id of anchorIds) {
      const c = byId.get(id);
      if (c && !seen.has(id)) {
        anchorsInCandidates.push(c);
        seen.add(id);
      }
    }
    const nonAnchors = candidates.filter((c) => !seen.has(c.id));
    const shuffledNonAnchors = this.shuffleArray([...nonAnchors]);
    if (anchorsInCandidates.length === 0) return shuffledNonAnchors;

    const leadCount = Math.min(
      anchorsInCandidates.length,
      Math.random() > 0.5 ? 2 : 1,
    );
    const leadIndices = new Set<number>();
    while (leadIndices.size < leadCount) {
      leadIndices.add(Math.floor(Math.random() * anchorsInCandidates.length));
    }
    const leadAnchors = anchorsInCandidates.filter((_, i) =>
      leadIndices.has(i),
    );
    const otherAnchors = anchorsInCandidates.filter(
      (_, i) => !leadIndices.has(i),
    );
    return [...leadAnchors, ...otherAnchors, ...shuffledNonAnchors];
  }

  /** Fisher–Yates shuffle for deterministic-size arrays (e.g. candidate list). */
  private shuffleArray<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /**
   * Order candidates so the list sent to the LLM is balanced by primary muscle group
   * (e.g. Push day: Chest, Shoulders, Arms round-robin) instead of chest-heavy.
   * Reduces bias toward "top" exercises for one group.
   */
  private balanceCandidateOrderForPrompt(
    candidates: CandidateExercise[],
    focusKey: FocusKey | string,
  ): CandidateExercise[] {
    const key = String(focusKey).toLowerCase();
    if (candidates.length <= 1) return [...candidates];

    const orderByFocus: Record<string, string[]> = {
      push: ['Chest', 'Shoulders', 'Arms'],
      pull: ['Back', 'Arms'],
      legs: ['Legs', 'Core'],
      lower: ['Legs', 'Core'],
      upper: ['Chest', 'Back', 'Shoulders', 'Arms'],
      'upper body': ['Chest', 'Back', 'Shoulders', 'Arms'],
      'lower body': ['Legs', 'Core'],
      chest: ['Chest'],
      back: ['Back'],
      shoulders: ['Shoulders'],
      arms: ['Arms'],
    };
    const groupOrder = orderByFocus[key];
    if (!groupOrder?.length) return this.shuffleArray([...candidates]);

    const byGroup = new Map<string, CandidateExercise[]>();
    for (const g of groupOrder) byGroup.set(g, []);
    const other: CandidateExercise[] = [];
    for (const c of candidates) {
      const group = c.primaryMuscleGroup ?? '';
      if (byGroup.has(group)) byGroup.get(group)!.push(c);
      else other.push(c);
    }

    // Within each primary group, rotate across sub-muscles so the prompt pool
    // doesn't lead with three Hamstring lifts (or three Upper-Chest pushes) in a
    // row. The first sub-muscle on each row is treated as the primary mover.
    const sortedGroups = groupOrder.map((g) =>
      this.subMuscleRotateWithinPrimary(byGroup.get(g) ?? []),
    );
    const result: CandidateExercise[] = [];
    let idx = 0;
    while (true) {
      let added = 0;
      for (const list of sortedGroups) {
        if (idx < list.length) {
          result.push(list[idx]);
          added++;
        }
      }
      if (added === 0) break;
      idx++;
    }
    result.push(...this.shuffleArray(other));
    return result;
  }

  /**
   * Round-robin candidates inside one primary group by their first sub-muscle so
   * Groq sees a varied pool (Hamstrings → Quads → Glutes → Hamstrings…) instead
   * of a clump. Rows without sub-muscle metadata fall into a single bucket and
   * are interleaved at the end of each pass.
   */
  private subMuscleRotateWithinPrimary(
    list: CandidateExercise[],
  ): CandidateExercise[] {
    if (list.length <= 1) return [...list];
    const buckets = new Map<string, CandidateExercise[]>();
    const noSub: CandidateExercise[] = [];
    for (const c of this.shuffleArray([...list])) {
      const key = String(c.subMuscles?.[0] ?? '').trim();
      if (!key) {
        noSub.push(c);
        continue;
      }
      let arr = buckets.get(key);
      if (!arr) {
        arr = [];
        buckets.set(key, arr);
      }
      arr.push(c);
    }
    const lanes = [...buckets.values(), ...(noSub.length ? [noSub] : [])];
    const out: CandidateExercise[] = [];
    let idx = 0;
    while (true) {
      let added = 0;
      for (const lane of lanes) {
        if (idx < lane.length) {
          out.push(lane[idx]);
          added++;
        }
      }
      if (added === 0) break;
      idx++;
    }
    return out;
  }

  private libraryRowToCandidate(e: {
    id: string;
    name: string;
    primaryMuscleGroup: string;
    equipment?: string[];
    movementPatterns?: string[];
    subMuscles?: string[];
  }): CandidateExercise {
    return {
      id: e.id,
      name: e.name,
      primaryMuscleGroup: e.primaryMuscleGroup,
      equipment: e.equipment ?? [],
      movementPatterns: e.movementPatterns ?? [],
      subMuscles: e.subMuscles ?? [],
      variationGroup: this.getVariationGroupFromName(e.name),
      equipmentType: e.equipment && e.equipment[0] ? e.equipment[0] : 'mixed',
    };
  }

  /** Hybrid / fat-loss / endurance goals: merge real Cardio library rows into the batch pool so Groq can assign machine/modality finishers. */
  private programGoalWantsCardioFinisher(goal: string | undefined): boolean {
    return goalWantsStrengthCardioFinisher(goal);
  }

  /** ~25–40 chars; only when user picked modalities (saves tokens when empty). */
  private compactCardioModalityHint(modalities: string[] | undefined): string {
    if (!modalities?.length) return '';
    return ` Prefer last Cardio id: ${modalities.join('>')}.`;
  }

  private cardioExerciseMatchesModality(
    exerciseName: string,
    modality: string,
  ): boolean {
    const n = (exerciseName ?? '').toLowerCase();
    switch (modality) {
      case 'run':
        return (
          /\b(treadmill|sprint)\b/i.test(n) ||
          (/\brun\b/i.test(n) && !/row/i.test(n))
        );
      case 'bike':
        return /bike|cycle|spin|airdyne/i.test(n);
      case 'row':
        return /row|erg|skierg|ski erg/i.test(n);
      case 'swim':
        return /swim/i.test(n);
      case 'elliptical':
        return /elliptical|arc trainer|cross trainer/i.test(n);
      default:
        return false;
    }
  }

  private pickCardioFinisherCandidate(
    candidates: CandidateExercise[],
    excludeExerciseIds: Set<string>,
    modalities: string[] | undefined,
  ): CandidateExercise | undefined {
    const pool = candidates.filter(
      (c) =>
        c.primaryMuscleGroup === 'Cardio' &&
        c.id &&
        !excludeExerciseIds.has(c.id),
    );
    if (pool.length === 0) return undefined;
    if (!modalities?.length) return pool[0];
    for (const m of modalities) {
      const hit = pool.find((c) =>
        this.cardioExerciseMatchesModality(c.name, m),
      );
      if (hit) return hit;
    }
    return pool[0];
  }

  private appendCardioCandidatesToPool(
    pool: CandidateExercise[],
    equipment: string[],
    excludeIds: string[],
    maxAdd: number,
  ): CandidateExercise[] {
    const seen = new Set(pool.map((c) => c.id));
    const cardioRaw = this.exercisesService.getCandidatesForGenerator({
      focus: 'cardio',
      equipment: equipment.length ? equipment : undefined,
      excludeIds: [...new Set([...excludeIds, ...seen])],
      limit: maxAdd + 24,
    });
    const added: CandidateExercise[] = [];
    for (const row of cardioRaw) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      added.push(this.libraryRowToCandidate(row));
      if (added.length >= maxAdd) break;
    }
    return [...pool, ...added].slice(0, PER_SESSION_CANDIDATE_LIMIT);
  }

  private moveCardioExercisesLast(
    exercises: Array<{
      name: string;
      sets: number;
      reps: number;
      weight?: number;
      notes?: string;
      exerciseId?: string;
    }>,
    idToCandidate: Map<string, CandidateExercise>,
  ): void {
    const other: typeof exercises = [];
    const cardio: typeof exercises = [];
    for (const ex of exercises) {
      const c = ex.exerciseId
        ? idToCandidate.get(ex.exerciseId.trim())
        : undefined;
      if (c?.primaryMuscleGroup === 'Cardio') cardio.push(ex);
      else other.push(ex);
    }
    if (cardio.length === 0) return;
    exercises.length = 0;
    exercises.push(...other, ...cardio);
  }

  /**
   * Union of focus-specific candidate pulls (deduped), capped for batch prompts.
   * Falls back toward full-body fill when the union is thin.
   */
  private mergeCandidatesForBatchProgram(
    sessions: Array<{ title?: string; type: string }>,
    equipment: string[],
    programGoal?: string,
  ): CandidateExercise[] {
    const focusLabelsInOrder: string[] = [];
    const seen = new Set<string>();
    for (const s of sessions) {
      const label = ((s.title ?? s.type).trim() || 'full body').trim();
      const key = label.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        focusLabelsInOrder.push(label);
      }
    }
    const nFocus = Math.max(1, focusLabelsInOrder.length);
    const perFocus = Math.max(
      12,
      Math.min(28, Math.ceil(BATCH_CANDIDATE_CAP / nFocus)),
    );

    const mergedById = new Map<string, CandidateExercise>();
    focus: for (const focus of focusLabelsInOrder) {
      const list = this.exercisesService.getCandidatesForGenerator({
        focus,
        equipment: equipment.length ? equipment : undefined,
        excludeIds: [],
        limit: perFocus,
      });
      for (const row of list) {
        const c = this.libraryRowToCandidate(row);
        if (!mergedById.has(c.id)) mergedById.set(c.id, c);
        if (mergedById.size >= BATCH_CANDIDATE_CAP) break focus;
      }
    }

    if (mergedById.size < 24) {
      const excludeIds = Array.from(mergedById.keys());
      const fill = this.exercisesService.getCandidatesForGenerator({
        focus: 'full body',
        equipment: equipment.length ? equipment : undefined,
        excludeIds,
        limit: Math.max(0, BATCH_CANDIDATE_CAP - mergedById.size) + 12,
      });
      for (const row of fill) {
        const c = this.libraryRowToCandidate(row);
        if (!mergedById.has(c.id)) mergedById.set(c.id, c);
        if (mergedById.size >= BATCH_CANDIDATE_CAP) break;
      }
    }

    if (this.programGoalWantsCardioFinisher(programGoal)) {
      const excludeIds = Array.from(mergedById.keys());
      const cardioPick = this.exercisesService.getCandidatesForGenerator({
        focus: 'cardio',
        equipment: equipment.length ? equipment : undefined,
        excludeIds,
        limit: 18,
      });
      for (const row of cardioPick) {
        const c = this.libraryRowToCandidate(row);
        if (!mergedById.has(c.id)) mergedById.set(c.id, c);
        if (mergedById.size >= BATCH_CANDIDATE_CAP) break;
      }
    }

    const anchorIdOrder: string[] = [];
    const anchorSeen = new Set<string>();
    for (const focus of focusLabelsInOrder) {
      for (const id of getAnchorIdsForFocus(focus)) {
        if (!anchorSeen.has(id)) {
          anchorSeen.add(id);
          anchorIdOrder.push(id);
        }
      }
    }

    const capped = Array.from(mergedById.values()).slice(0, BATCH_CANDIDATE_CAP);
    return this.buildCandidateListWithAnchorsFirst(capped, anchorIdOrder);
  }

  /** Last ~8 workouts' exercise IDs for variety (avoid repeating). */
  private async getRecentExerciseIds(
    userId: string,
    limit = 25,
  ): Promise<string[]> {
    const workouts = await this.prisma.workout.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { exercises: true },
    });
    const ids = new Set<string>();
    for (const w of workouts) {
      for (const e of w.exercises) {
        if (e.exerciseId) ids.add(e.exerciseId);
      }
      if (ids.size >= limit) break;
    }
    return Array.from(ids);
  }

  /** Per-exercise last performance (most recent log, best set by weight). */
  private async getLastPerformanceForExercises(
    userId: string,
    exerciseIds: string[],
  ): Promise<Map<string, LastPerformance>> {
    const idSet = new Set(exerciseIds);
    const logs = await this.prisma.workoutLog.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 30,
      include: {
        entries: { include: { completedSets: true } },
      },
    });
    const result = new Map<string, LastPerformance>();
    for (const log of logs) {
      for (const entry of log.entries) {
        if (
          entry.exerciseId &&
          idSet.has(entry.exerciseId) &&
          !result.has(entry.exerciseId)
        ) {
          const sets = entry.completedSets?.filter((s) => s.completed) ?? [];
          const best = sets.reduce<{ weight: number; reps: number } | null>(
            (acc, s) => {
              const w = s.weight ?? 0;
              if (!acc) return { weight: w, reps: s.reps };
              if (w > acc.weight) return { weight: w, reps: s.reps };
              return acc;
            },
            null,
          );
          if (best) {
            result.set(entry.exerciseId, {
              weight: best.weight > 0 ? best.weight : undefined,
              reps: best.reps,
            });
          }
        }
      }
      if (result.size === exerciseIds.length) break;
    }
    return result;
  }

  /**
   * Generate a full multi-day program in one LLM call so the model sees the whole week
   * and can produce a coherent plan (e.g. PPL, Upper/Lower). Returns null on parse failure
   * or if not enough candidates; caller should fall back to per-session generation.
   * Token usage: ~65 exercises as tab-separated lines (id, name, muscle) + system/user text;
   * output max 4096 (3200 when detailLevel is simple). Well under Groq llama-3.3-70b context (131k).
   */
  async generateFullProgram(
    options: {
      sessions: Array<{
        weekIndex: number;
        weekday: string;
        title?: string;
        type: string;
        durationMin: number;
        durationMax: number;
        isHardDay: boolean;
      }>;
      goal?: string;
      equipment?: string[];
      limitations?: string[];
      detailLevel?: 'simple' | 'detailed';
      makeItEasier?: boolean;
      experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
      /** Exercise ids already used in earlier weeks (or sub-chunks); soft-avoid for variety. */
      priorWeekExerciseIds?: string[];
      /** Ordered run, bike, … — short batch prompt suffix + candidate bias */
      cardioModalities?: string[];
      /** Periodization / preview-scope hint (≤200 chars) */
      mesoHint?: string;
    },
    apiKey: string,
  ): Promise<GenerateFullProgramOutcome | null> {
    const {
      sessions,
      goal = 'hypertrophy',
      equipment = [],
      limitations = [],
      detailLevel = 'detailed',
      makeItEasier = false,
      experienceLevel: experienceLevelOpt,
      priorWeekExerciseIds = [],
      cardioModalities,
      mesoHint,
    } = options;
    if (sessions.length < 2 || sessions.length > 7) return null;

    const priorUniqueForPrompt = [
      ...new Set((priorWeekExerciseIds ?? []).filter(Boolean)),
    ].slice(-MAX_PRIOR_WEEK_IDS_IN_BATCH_PROMPT);

    const difficulty: 'beginner' | 'intermediate' | 'advanced' = makeItEasier
      ? 'beginner'
      : experienceLevelOpt === 'beginner' || experienceLevelOpt === 'advanced'
        ? experienceLevelOpt
        : 'intermediate';
    const wantsExerciseNotes = experienceLevelOpt === 'beginner';
    const setRep = getSetRepGuidelines(goal, difficulty);

    let candidates = this.mergeCandidatesForBatchProgram(
      sessions,
      equipment,
      goal,
    );
    if (candidates.length < 20) {
      const fallbackRaw = this.exercisesService.getCandidatesForGenerator({
        focus: 'full body',
        equipment: equipment.length ? equipment : undefined,
        excludeIds: [],
        limit: 65,
      });
      candidates = this.buildCandidateListWithAnchorsFirst(
        fallbackRaw.map((e) => this.libraryRowToCandidate(e)),
        getAnchorIdsForFocus('full body'),
      );
    }
    if (candidates.length < 20) return null;

    if (
      this.programGoalWantsCardioFinisher(goal) &&
      !candidates.some((c) => c.primaryMuscleGroup === 'Cardio')
    ) {
      const cardioExtra = this.exercisesService.getCandidatesForGenerator({
        focus: 'cardio',
        equipment: equipment.length ? equipment : undefined,
        excludeIds: candidates.map((c) => c.id),
        limit: 16,
      });
      for (const row of cardioExtra) {
        const c = this.libraryRowToCandidate(row);
        if (candidates.some((x) => x.id === c.id)) continue;
        candidates.push(c);
        if (candidates.length >= BATCH_CANDIDATE_CAP) break;
      }
    }

    const candidateTable = formatCandidatesTabularForBatch(candidates);

    const dayLines = sessions
      .map((s, i) => {
        const focus = (s.title ?? s.type).trim() || 'full body';
        const duration = Math.round((s.durationMin + s.durationMax) / 2);
        const fk = normalizeFocusToKey(focus);
        const isCardioOrRec = fk === 'cardio' || fk === 'recovery';
        const targets = exerciseTargetsForSession(
          duration,
          detailLevel,
          isCardioOrRec,
        );
        const maxN = maxExercisesFromPromptRange(targets.promptRange);
        const rail = sessionCoachingRailLine({
          focusLabel: focus,
          sessionType: s.type,
          goal,
          experienceLevel: difficulty,
          wantsStrengthCardioFinisher:
            this.programGoalWantsCardioFinisher(goal) &&
            String(s.type).toLowerCase() === 'strength',
        });
        return `Day ${i + 1} (${focus}, ${s.weekday}, ~${duration} min): Choose ${targets.promptRange} exercises from the list that fit this day's focus (enough volume for ~${duration} minutes). Hard cap: at most ${maxN} objects in the "exercises" array for this day. Use ONLY exercise "id" values from the list. Main compounds first, then accessories. Within this day use only one movement variant (e.g. one bench press, not flat + incline in same day). Session rail: ${rail}`;
      })
      .join('\n');

    const focusCounts = new Map<string, number>();
    for (const s of sessions) {
      const focus = (s.title ?? s.type).trim() || 'full body';
      focusCounts.set(focus, (focusCounts.get(focus) ?? 0) + 1);
    }
    const hasRepeatedFocus = [...focusCounts.values()].some((c) => c > 1);
    const varietyInstruction = hasRepeatedFocus
      ? '\nImportant: Multiple days have the same focus (e.g. several Push or Pull days). Vary exercise selection across those days—do not repeat the same exercise lineup on every Push day. Pick different compounds and accessories so each week feels fresh.'
      : '';

    const priorWeekInstruction =
      priorUniqueForPrompt.length > 0
        ? `\nMulti-week context: these exercise ids already appeared earlier in this plan preview—prefer different ids from the list when they fit the day equally well (still honor each day's focus and volume): ${priorUniqueForPrompt.join(', ')}.`
        : '';

    const equipmentStr = equipment.length
      ? equipment.join(', ')
      : 'general gym equipment';
    const limitationsBlock =
      limitations.length > 0
        ? `\nLimitations (respect these): ${limitations.slice(0, 8).join('; ').slice(0, 200)}.`
        : '';

    const nameRules =
      'Workout "name" must be plain and short: prefer the day focus label plus an optional "A"/"B" or "1"/"2" when the same focus repeats (e.g. "Upper · A", "Lower · B"). No hype words: Blast, Power, Beast, Savage, Shred, Endurance, Destroy, Nitro, Inferno, or similar marketing.';

    const exercisesSchemaLine = wantsExerciseNotes
      ? `  - "exercises": array of objects, each with "exerciseId" (must be an id from the list), "sets" (number), "reps" (number), and optionally "notes" (string, ≤${BEGINNER_EXERCISE_NOTE_MAX_CHARS} chars: one line, form or intent only). Order: main compounds first, then accessories.`
      : `  - "exercises": array of objects, each with "exerciseId" (must be an id from the list), "sets" (number), "reps" (number) only — do NOT include "notes". Order: main compounds first, then accessories.`;

    const structureBlock =
      detailLevel === 'simple'
        ? `Structure:
- "programSummary": string (1–2 short sentences describing the program).
- "days": array of objects, one per day, in the same order as the day list below. Each day object must have:
  - "name": string (${nameRules})
  - "reasoning": string (one short sentence)
  - "warmUp": string (one short sentence)
  - "coolDown": string (one short sentence)
${exercisesSchemaLine}`
        : `Structure:
- "programSummary": string (2-4 sentences describing the program and how the days work together).
- "days": array of objects, one per day, in the same order as the day list below. Each day object must have:
  - "name": string (${nameRules})
  - "reasoning": string (1-3 sentences on why this day is structured this way)
  - "warmUp": string (1-2 sentences)
  - "coolDown": string (1-2 sentences)
${exercisesSchemaLine}`;

    const systemPrompt = `You are a certified fitness trainer designing a full weekly program in one response. You must choose exercises ONLY from the provided list by their "id". Respond with exactly one JSON object, no markdown.

Exercise list format: each line is id<TAB>exercise name<TAB>primary muscle (header columns only—parse each line; use the first field as the id for "exerciseId").

${structureBlock}
For the first two exercises of each day, prefer the strongest, well-known primary compounds for that day's pattern (e.g. main bench or push-up variant for horizontal push; pull-up or row for pull; squat or leg press for legs only on Lower/Legs days)—not redundant variations of the same pattern on the same day.
Rep selection: pick rep numbers in the middle of the allowed range; main compounds can be slightly lower reps than accessories (2–4 reps lower is fine).
When the program has multiple days with the same focus (e.g. Push on day 1 and Push on day 4), vary which exercises you pick for each so the user gets variety across weeks—avoid repeating the same workout.

${coachCopyToneBlock()}`;

    const conditioningBlock = this.programGoalWantsCardioFinisher(goal)
      ? `\nConditioning (user goal includes strength + conditioning): For each day whose type is **strength**, end that day's "exercises" array with exactly ONE exercise taken from the list rows whose third column (muscle) is **Cardio** (bike, rower, ski erg, treadmill, elliptical, versa climber, assault runner, etc.)—a short machine/modality finisher. Put it **last**. Keep total exercises for that day within each day's range/cap (drop a small accessory if needed to fit; keep main compounds). Do **not** add this extra cardio line on days that are already cardio or recovery.`
      : '';
    const conditioningModalityHint =
      this.compactCardioModalityHint(cardioModalities);

    const restHint =
      setRep.restSeconds != null && setRep.restSeconds > 0
        ? ` Rest between working sets: about ${setRep.restSeconds}s unless notes say otherwise.`
        : '';

    const mesoTrim = (mesoHint ?? '').trim().slice(0, 200);
    const mesoBlock = mesoTrim.length ? `\nProgram intent: ${mesoTrim}` : '';

    const userPrompt = `Design a ${sessions.length}-day program. Use ONLY exercise ids from the first column of each line below.
${candidateTable}
${priorWeekInstruction}

${dayLines}
${varietyInstruction}
${conditioningBlock}${conditioningModalityHint}${mesoBlock}

Set/rep: ${setRep.description} (${setRep.setsMin}-${setRep.setsMax} sets, ${setRep.repsMin}-${setRep.repsMax} reps).${restHint} Goal: ${goal}. Difficulty: ${difficulty}. Equipment: ${equipmentStr}.${limitationsBlock}

Return valid JSON: "programSummary" (string) and "days" (array of ${sessions.length} objects). Each day: "name", "reasoning", "warmUp", "coolDown", "exercises" (array of objects with exerciseId, sets, reps${wantsExerciseNotes ? ', optional notes (≤' + String(BEGINNER_EXERCISE_NOTE_MAX_CHARS) + ' chars each)' : '; omit notes on every exercise'}).`;

    const groq = new Groq({ apiKey });
    let response: GroqUsageLogShape & {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const batchMaxTokens = detailLevel === 'simple' ? 3200 : 4096;
    try {
      response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.6,
        max_tokens: batchMaxTokens,
      });
    } catch {
      return null;
    }

    this.logGroqCompletionMeta('generateFullProgram', response);
    const usage = groqUsageFromResponse(response);
    const finishReason = response.choices?.[0]?.finish_reason;
    if (finishReason === 'length') return { ok: false, usage };

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return { ok: false, usage };

    let parsed: {
      programSummary?: string;
      days?: Array<{
        name?: string;
        reasoning?: string;
        warmUp?: string;
        coolDown?: string;
        exercises?: Array<{
          exerciseId?: string;
          sets?: number;
          reps?: number;
          notes?: string;
        }>;
      }>;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, usage };
    }

    if (
      !parsed.days ||
      !Array.isArray(parsed.days) ||
      parsed.days.length < sessions.length
    )
      return { ok: false, usage };

    const idToCandidate = new Map(candidates.map((c) => [c.id, c]));
    const results: FullProgramDaySession[] = [];

    for (let i = 0; i < sessions.length; i++) {
      const spec = sessions[i];
      const day = parsed.days[i];
      const duration = Math.round((spec.durationMin + spec.durationMax) / 2);
      const fk = normalizeFocusToKey(
        (spec.title ?? spec.type).trim() || 'full body',
      );
      const isCardioOrRec = fk === 'cardio' || fk === 'recovery';
      const minExercisesPerDay = exerciseTargetsForSession(
        duration,
        detailLevel,
        isCardioOrRec,
      ).minExercises;
      const usedIdsThisDay = new Set<string>();

      const exercises: Array<{
        name: string;
        sets: number;
        reps: number;
        weight?: number;
        notes?: string;
        exerciseId?: string;
      }> = [];

      if (day?.exercises?.length) {
        for (const ex of day.exercises) {
          const id = ex.exerciseId?.trim();
          let candidate = id ? idToCandidate.get(id) : null;
          if (!candidate && id) {
            const fallback = candidates.find((c) => !usedIdsThisDay.has(c.id));
            if (fallback) candidate = fallback;
          }
          const name = candidate ? candidate.name : 'Exercise';
          const sets = Math.max(
            setRep.setsMin,
            Math.min(
              setRep.setsMax,
              Math.round(Number(ex.sets) || setRep.setsMin),
            ),
          );
          const reps = Math.max(
            setRep.repsMin,
            Math.min(
              setRep.repsMax,
              Math.round(Number(ex.reps) || setRep.repsMin),
            ),
          );
          exercises.push({
            name,
            sets,
            reps,
            notes: normalizeExerciseNoteForOutput(ex.notes, wantsExerciseNotes),
            exerciseId: candidate ? candidate.id : undefined,
          });
          if (candidate) usedIdsThisDay.add(candidate.id);
        }
      }

      while (exercises.length < minExercisesPerDay) {
        const next = candidates.find((c) => !usedIdsThisDay.has(c.id));
        if (!next) break;
        exercises.push({
          name: next.name,
          sets: setRep.setsMin,
          reps: Math.round((setRep.repsMin + setRep.repsMax) / 2),
          exerciseId: next.id,
        });
        usedIdsThisDay.add(next.id);
      }

      this.moveCardioExercisesLast(exercises, idToCandidate);

      results.push({
        weekIndex: spec.weekIndex,
        weekday: spec.weekday,
        name: plainWorkoutTitle(
          (day?.name && String(day.name).trim()) ||
            `${spec.title ?? spec.type ?? 'Workout'} - ${spec.weekday}`,
          (spec.title ?? spec.type ?? 'Workout').trim(),
          spec.weekday,
        ),
        reasoning:
          day?.reasoning != null
            ? String(day.reasoning).trim().slice(0, 500)
            : undefined,
        warmUp:
          day?.warmUp != null
            ? String(day.warmUp).trim().slice(0, 300)
            : undefined,
        coolDown:
          day?.coolDown != null
            ? String(day.coolDown).trim().slice(0, 300)
            : undefined,
        exercises,
      });
    }

    return { ok: true, sessions: results, usage };
  }

  /**
   * Try to generate a full program in one LLM call. Returns null if no API key,
   * parse failure, or wrong session count; caller should fall back to per-session generation.
   */
  async tryGenerateFullProgram(dto: {
    sessions: Array<{
      weekIndex: number;
      weekday: string;
      title?: string;
      type: string;
      durationMin: number;
      durationMax: number;
      isHardDay: boolean;
    }>;
    goal?: string;
    location?: 'gym' | 'home';
    detailLevel?: 'simple' | 'detailed';
    makeItEasier?: boolean;
    avoidConstraints?: string[];
    /** Home: HOME list. Gym + checklist: mapped library labels. Gym + empty: omit (wide open). */
    equipmentFilter?: string[];
    experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
    /** Ids used in earlier preview chunks (other weeks); optional variety hint for batch prompt. */
    priorWeekExerciseIds?: string[];
    cardioModalities?: string[];
    mesoHint?: string;
  }): Promise<{
    program: FullProgramDaySession[] | null;
    groqUsages: GroqCompletionUsage[];
  }> {
    const empty = (): { program: null; groqUsages: GroqCompletionUsage[] } => ({
      program: null,
      groqUsages: [],
    });

    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey?.trim() || dto.sessions.length < 2 || dto.sessions.length > 7)
      return empty();

    const equipment: string[] =
      dto.equipmentFilter !== undefined && dto.equipmentFilter.length > 0
        ? dto.equipmentFilter
        : dto.location === 'home'
          ? ['Dumbbell', 'Resistance Band', 'Bodyweight']
          : [];

    const baseOpts = {
      goal: dto.goal ?? 'hypertrophy',
      equipment,
      limitations: dto.avoidConstraints ?? [],
      detailLevel: dto.detailLevel ?? ('detailed' as const),
      makeItEasier: dto.makeItEasier === true,
      experienceLevel: dto.experienceLevel,
      priorWeekExerciseIds: dto.priorWeekExerciseIds,
      cardioModalities: dto.cardioModalities,
      mesoHint: dto.mesoHint,
    };

    const pushUsage = (
      list: GroqCompletionUsage[],
      outcome: GenerateFullProgramOutcome | null,
    ) => {
      if (!outcome) return;
      if (outcome.ok) list.push(outcome.usage);
      else if (outcome.usage) list.push(outcome.usage);
    };

    const groqUsages: GroqCompletionUsage[] = [];

    const first = await this.generateFullProgram(
      { ...baseOpts, sessions: dto.sessions },
      apiKey,
    );
    pushUsage(groqUsages, first);
    if (first?.ok && first.sessions.length === dto.sessions.length) {
      return { program: first.sessions, groqUsages };
    }

    const n = dto.sessions.length;
    /** 4–7 sessions: split into two valid batch halves (e.g. 4→2+2, 5→3+2) if the single call fails. */
    if (n >= 4) {
      const mid = Math.ceil(n / 2);
      if (mid >= 2 && n - mid >= 2) {
        const headOutcome = await this.generateFullProgram(
          { ...baseOpts, sessions: dto.sessions.slice(0, mid) },
          apiKey,
        );
        pushUsage(groqUsages, headOutcome);
        if (!headOutcome?.ok || headOutcome.sessions.length !== mid) {
          return { program: null, groqUsages };
        }
        const head = headOutcome.sessions;
        const headIds = head.flatMap((s) =>
          (s.exercises ?? [])
            .map((e) => e.exerciseId)
            .filter((id): id is string => !!id?.trim()),
        );
        const mergedPrior = [
          ...new Set(
            [...(dto.priorWeekExerciseIds ?? []), ...headIds].map((x) =>
              String(x).trim(),
            ),
          ),
        ].filter(Boolean);
        const tailOutcome = await this.generateFullProgram(
          {
            ...baseOpts,
            sessions: dto.sessions.slice(mid),
            priorWeekExerciseIds: mergedPrior.length ? mergedPrior : undefined,
          },
          apiKey,
        );
        pushUsage(groqUsages, tailOutcome);
        if (!tailOutcome?.ok || tailOutcome.sessions.length !== n - mid) {
          return { program: null, groqUsages };
        }
        const tail = tailOutcome.sessions;
        this.logger.log(
          `[Groq:tryGenerateFullProgram] split_batch sessions=${mid}+${n - mid}`,
        );
        return { program: [...head, ...tail], groqUsages };
      }
    }

    return { program: null, groqUsages };
  }

  /** Token / finish_reason only (no prompt or user content). */
  private logGroqCompletionMeta(label: string, response: GroqUsageLogShape): void {
    const u = response.usage;
    const fr = response.choices?.[0]?.finish_reason;
    if (!u && fr == null) return;
    const pt = u?.prompt_tokens;
    const ct = u?.completion_tokens;
    const tt = u?.total_tokens;
    this.logger.log(
      `[Groq:${label}] finish_reason=${fr ?? 'n/a'} prompt_tokens=${pt ?? 'n/a'} completion_tokens=${ct ?? 'n/a'} total_tokens=${tt ?? 'n/a'}`,
    );
    this.logger.log(
      JSON.stringify({
        event: 'groq_completion',
        label,
        finish_reason: fr ?? null,
        prompt_tokens: pt ?? null,
        completion_tokens: ct ?? null,
        total_tokens: tt ?? null,
      }),
    );
  }

  /**
   * Phase D (simple): one compact Groq JSON pass for titles and warm-up / cool-down / reasoning copy.
   * Exercise lists are fixed in prose only — the model does not choose new movements.
   */
  async polishSimpleBatchSessionCopy(
    options: {
      goal: string;
      equipmentNote?: string;
      days: Array<{
        weekday: string;
        focusLabel: string;
        exerciseNames: string[];
      }>;
    },
    apiKey: string,
  ): Promise<
    Array<{
      name: string;
      reasoning?: string;
      warmUp?: string;
      coolDown?: string;
    }> | null
  > {
    const { goal, equipmentNote = 'general gym equipment', days } = options;
    if (!days.length || !apiKey?.trim()) return null;

    const lines = days.map(
      (d, i) =>
        `Day ${i + 1} (${d.weekday}, ${d.focusLabel}): ${d.exerciseNames
          .slice(0, 10)
          .join('; ')
          .slice(0, 220)}`,
    );

    const systemPrompt = `You are a concise coach. Return exactly one JSON object, no markdown.
Field "days": array of ${days.length} objects, same order as the numbered day list below. Each object:
- "name": short, plain title using the day's focus label only (optionally add "A"/"B" or "1"/"2" if the same focus repeats). No hype: never use Blast, Power, Beast, Savage, Shred, Inferno, Nitro, Destroy, or similar marketing words.
- "reasoning": one motivating sentence (do not list individual exercises)
- "warmUp": one practical sentence (about 5–8 minutes of prep)
- "coolDown": one practical sentence
The exercise list for each day is fixed — only improve the copy fields.`;

    const userPrompt = `Goal: ${goal}. Equipment: ${equipmentNote}.

${lines.join('\n')}

Return JSON: {"days":[...${days.length} objects with name, reasoning, warmUp, coolDown]}`;

    const groq = new Groq({ apiKey });
    let response: GroqUsageLogShape & {
      choices?: Array<{ message?: { content?: string } }>;
    };
    try {
      response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.45,
        max_tokens: 900,
      });
    } catch {
      return null;
    }

    this.logGroqCompletionMeta('polishSimpleBatchSessionCopy', response);
    if (response.choices?.[0]?.finish_reason === 'length') return null;

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    let parsed: { days?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (
      !parsed.days ||
      !Array.isArray(parsed.days) ||
      parsed.days.length !== days.length
    ) {
      return null;
    }
    const out: Array<{
      name: string;
      reasoning?: string;
      warmUp?: string;
      coolDown?: string;
    }> = [];
    for (let i = 0; i < parsed.days.length; i++) {
      const o = parsed.days[i] as {
        name?: unknown;
        reasoning?: unknown;
        warmUp?: unknown;
        coolDown?: unknown;
      };
      const fallbackName = days[i]!.focusLabel;
      const rawPolishName =
        typeof o.name === 'string' && o.name.trim()
          ? o.name.trim().slice(0, 120)
          : fallbackName.slice(0, 120);
      const name = plainWorkoutTitle(
        rawPolishName,
        days[i]!.focusLabel,
        days[i]!.weekday,
      );
      out.push({
        name,
        reasoning:
          typeof o.reasoning === 'string'
            ? String(o.reasoning).trim().slice(0, 400)
            : undefined,
        warmUp:
          typeof o.warmUp === 'string'
            ? String(o.warmUp).trim().slice(0, 300)
            : undefined,
        coolDown:
          typeof o.coolDown === 'string'
            ? String(o.coolDown).trim().slice(0, 300)
            : undefined,
      });
    }
    return out;
  }

  private async generateWithGroq(
    dto: GenerateWorkoutDto,
    apiKey: string,
    candidates: CandidateExercise[],
    setRep: {
      setsMin: number;
      setsMax: number;
      repsMin: number;
      repsMax: number;
      description: string;
    },
    lastPerformance: Map<string, LastPerformance>,
  ): Promise<GenerateWithGroqOutcome> {
    const { day, preferences } = dto;
    const focus = preferences?.focus ?? 'full body';
    const focusKey: FocusKey | string = normalizeFocusToKey(focus);
    const difficulty = preferences?.difficulty ?? 'intermediate';
    const duration = preferences?.duration ?? 45;
    const equipmentStr = preferences?.equipment?.length
      ? preferences.equipment.join(', ')
      : 'general gym equipment';
    const goal = preferences?.goal ?? 'hypertrophy';
    const experience = preferences?.experience ?? difficulty;
    const wantsExerciseNotes = experience === 'beginner';
    const limitations = preferences?.limitations ?? [];
    const programTemplate = preferences?.programTemplateId ?? '';
    const programDayFocus = preferences?.programDayFocus ?? focus;
    const detailLevel = preferences?.detailLevel ?? 'detailed';
    const isSimple = detailLevel === 'simple';

    const slots = getSlotsForFocus(focus);
    const isCardioOrRecovery = focusKey === 'cardio' || focusKey === 'recovery';
    const targets = exerciseTargetsForSession(
      duration,
      detailLevel,
      isCardioOrRecovery,
    );
    const exerciseRange = targets.promptRange;
    const strengthPlusConditioning =
      this.programGoalWantsCardioFinisher(goal) && !isCardioOrRecovery;
    const mixedCardio =
      !strengthPlusConditioning &&
      focusKey === 'full body' &&
      (focus.toLowerCase().includes('run') ||
        focus.toLowerCase().includes('cardio'));

    const avoidIds = [...new Set(preferences?.excludeExerciseIds ?? [])];
    const avoidBlock =
      avoidIds.length > 0
        ? `\nAvoid list (do not use these exercise ids unless the list would otherwise be too small; prefer exercises not in this list): ${avoidIds.join(', ')}.`
        : '';

    const candidatesForPrompt = this.balanceCandidateOrderForPrompt(
      candidates,
      focusKey,
    );
    const candidateJson = JSON.stringify(
      candidatesForPrompt.map((c) => ({
        id: c.id,
        name: c.name,
        muscleGroup: c.primaryMuscleGroup,
        movementPattern:
          c.movementPatterns && c.movementPatterns[0]
            ? c.movementPatterns[0]
            : 'Push',
        variationGroup: c.variationGroup,
        equipmentType: c.equipmentType,
      })),
      null,
      0,
    );

    const slotInstructions =
      slots.length > 0 && !isCardioOrRecovery
        ? `\nWorkout structure (fill in order): ${slots.map((s, i) => `Slot ${i + 1}: ${s.description}`).join('. ')}. Prefer one main compound from the start of the list for the first slots, then accessories.`
        : '';

    const setRepLine = `Set/rep scheme: ${setRep.description} (aim for ${setRep.setsMin}-${setRep.setsMax} sets, ${setRep.repsMin}-${setRep.repsMax} reps per exercise).`;

    const userContextParts: string[] = [];
    userContextParts.push(`User goal: ${goal}. Experience: ${experience}.`);
    if (limitations.length > 0) {
      userContextParts.push(
        `Limitations (respect these): ${limitations.join('; ')}. Avoid exercises that conflict.`,
      );
    }

    const programContext =
      programTemplate || programDayFocus
        ? `This workout is "${programDayFocus}"${programTemplate ? ` in a ${programTemplate} style program` : ''}. In your reasoning, briefly reference how this day fits the program (e.g. "Push day: heavy horizontal push first, then vertical push; fits your weekly split.").`
        : '';

    const lastPerfLines: string[] = [];
    lastPerformance.forEach((perf, exerciseId) => {
      const c = candidates.find((x) => x.id === exerciseId);
      const name = c?.name ?? exerciseId;
      const w = perf.weight != null ? `${perf.weight} lb` : '';
      const r = perf.reps;
      lastPerfLines.push(
        `${name} (id: ${exerciseId}): last time ${w} ${w ? '×' : ''} ${r} reps`,
      );
    });
    const lastPerfBlock =
      lastPerfLines.length > 0
        ? wantsExerciseNotes
          ? `\nLast performance (suggest slight progression where appropriate, e.g. +5 lb or +1 rep in notes):\n${lastPerfLines.slice(0, 15).join('\n')}`
          : `\nLast performance (bias sets/reps slightly when appropriate; do not add per-exercise notes):\n${lastPerfLines.slice(0, 15).join('\n')}`
        : '';

    const warmUpCoolDown =
      'Provide "warmUp" and "coolDown" as separate strings (1-2 sentences each). Do not put them inside "reasoning".';

    const mixedCardioHint = mixedCardio
      ? ` Choose ${exerciseRange} strength exercises from the list only (all must have an id from the list). Do NOT put cardio in the exercises array. Optionally include a separate "cardioFinisher" object: { "suggestion": "e.g. Run 10 min or Row 500 m" } for a short cardio finisher after the workout.`
      : '';

    const conditioningFromLibraryHint = strengthPlusConditioning
      ? ` User goal mixes strength with conditioning: end the "exercises" array with exactly ONE item from the list whose muscleGroup is "Cardio" (rower, bike, ski erg, treadmill, etc.)—a short machine finisher; put it last. Stay within the exercise count cap (trim a small accessory first if needed). Do not add a separate "cardioFinisher" JSON field.`
      : '';

    const volumeHint = isCardioOrRecovery
      ? ''
      : `\nVolume: For ~${duration} minutes, include at least ${targets.minExercises} distinct exercises with enough total work that the session feels like a real workout, not a minimal list. Prefer the lower end of the suggested range when it still covers the main patterns; never exceed the hard cap. Hard cap: at most ${maxExercisesFromPromptRange(targets.promptRange)} objects in the "exercises" array.`;

    const reasoningHint = isSimple
      ? 'Keep "reasoning" to 1-2 short sentences.'
      : '"reasoning": string (2-4 sentences). Reference the program and day. Be specific; no filler praise.';
    const warmCoolHint = isSimple
      ? 'Keep warmUp and coolDown to one short sentence each.'
      : '1-2 sentences each for warmUp and coolDown.';

    const exercisesSystemBullet = wantsExerciseNotes
      ? `- "exercises": array of objects. Each must have "exerciseId" (string, must be one of the ids from the list—no made-up ids), "sets" (number), "reps" (number), and optionally "weight" (number), "notes" (string, ≤${BEGINNER_EXERCISE_NOTE_MAX_CHARS} chars, one line: form or intent). Use the exact "id" from the list. Order: main compounds first, then accessories.`
      : `- "exercises": array of objects. Each must have "exerciseId" (string, must be one of the ids from the list—no made-up ids), "sets" (number), "reps" (number), and optionally "weight" (number). Do NOT include "notes". Use the exact "id" from the list. Order: main compounds first, then accessories.`;

    const systemPrompt = `You are a certified fitness trainer. You must choose exercises ONLY from the provided list by their "id". Respond with exactly one JSON object, no markdown.
- "name": string (plain 2–8 words: prefer "${programDayFocus}" or the day role; no hype words like Blast, Power, Beast, Savage, Shred, Inferno, Nitro)
- "day": string or omit
- "reasoning": string. ${reasoningHint} Do NOT put warm-up or cool-down here; use warmUp and coolDown fields instead.
- "warmUp": string (${warmCoolHint} e.g. "5 min light cardio, band pull-aparts, dynamic stretch.")
- "coolDown": string (${warmCoolHint} e.g. "Stretch chest and shoulders, 2 min walk.")
${exercisesSystemBullet}
${mixedCardio ? '- "cardioFinisher": optional object with "suggestion" (string, e.g. "Run 10 min"). Only if this is a workout that includes a cardio finisher. Do not put cardio in exercises.' : ''}

${coachCopyToneBlock()}`;

    const userPrompt = `Choose ${exerciseRange} exercises from this list only. Use each exercise's "id" as "exerciseId" in your response.
List: ${candidateJson}

Focus: ${focus} (day type: ${String(focusKey)}). Difficulty: ${difficulty}. Duration: ~${duration} min. Equipment: ${equipmentStr}.${day ? ` Day: ${day}.` : ''}
${setRepLine}
${slotInstructions}
${userContextParts.join(' ')}
${programContext}
${warmUpCoolDown}
${lastPerfBlock}
${avoidBlock}
${mixedCardioHint}
${conditioningFromLibraryHint}${this.compactCardioModalityHint(dto.preferences?.cardioModalities)}
${volumeHint}

Session rail (follow this when ordering patterns): ${sessionCoachingRailLine({
      focusLabel: focus,
      sessionType:
        focusKey === 'cardio'
          ? 'cardio'
          : focusKey === 'recovery'
            ? 'recovery'
            : 'strength',
      goal,
      experienceLevel:
        experience === 'beginner' ||
        experience === 'intermediate' ||
        experience === 'advanced'
          ? experience
          : difficulty,
      wantsStrengthCardioFinisher: strengthPlusConditioning,
    })}

Vary exercise selection when possible so the user gets fresh workouts.

Important: Do NOT pick multiple variations of the same movement in one workout. Use distinct movement patterns:
- For Push days: pick ONE horizontal push (e.g. flat or incline bench), ONE vertical push (e.g. overhead/shoulder press), and 1–2 isolation exercises (e.g. flyes, pushdowns, extensions). Do not pick multiple bench press variants (e.g. flat bench + close-grip bench + decline bench) in the same session.
- For Pull days: one row, one vertical pull (pulldown/pull-up), then isolation (curls, etc.). Not multiple row variations.
- For legs: one squat, one hinge (deadlift/hip thrust), one lunge or single-leg, then isolation. Not multiple squat variants.
Sub-muscle variety: avoid stacking 3+ exercises whose primary mover is the same sub-muscle (e.g. three Hamstring lifts, three Upper-Chest pushes). At most 2 per sub-muscle in one strength session — Calves, Forearms, Core and Cardio are exempt.

Return valid JSON with exerciseId, sets, reps${wantsExerciseNotes ? ', optional notes (one short coaching line per exercise)' : ' (no notes field)'}. Include warmUp and coolDown as separate fields. Sets and reps should follow the set/rep scheme above. Write "reasoning" that references the program (do not duplicate warm-up/cool-down in reasoning).`;

    const sessionMaxTokens = isSimple ? 2400 : 3072;

    const groq = new Groq({ apiKey });
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.62,
      max_tokens: sessionMaxTokens,
    });

    this.logGroqCompletionMeta('generateWithGroq', response);
    const usage = groqUsageFromResponse(response);
    if (response.choices?.[0]?.finish_reason === 'length')
      return { ok: false, usage };

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return { ok: false, usage };

    let parsed: {
      name?: string;
      day?: string;
      reasoning?: string;
      warmUp?: string;
      coolDown?: string;
      cardioFinisher?: { suggestion?: string };
      exercises?: Array<{
        exerciseId?: string;
        sets?: number;
        reps?: number;
        weight?: number;
        notes?: string;
      }>;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, usage };
    }

    if (!parsed?.exercises?.length || !parsed.name) return { ok: false, usage };

    const idToCandidate = new Map(candidates.map((c) => [c.id, c]));
    const usedIds = new Set<string>();
    const exercises: CreateWorkoutDto['exercises'] = [];
    const setsMin = setRep.setsMin;
    const setsMax = setRep.setsMax;
    const repsMin = setRep.repsMin;
    const repsMax = setRep.repsMax;

    for (let i = 0; i < parsed.exercises.length; i++) {
      const ex = parsed.exercises[i];
      let id = ex.exerciseId?.trim();
      let candidate = id ? idToCandidate.get(id) : null;
      if (!candidate && id) {
        const replacement = candidates.find((c) => !usedIds.has(c.id));
        if (replacement) {
          candidate = replacement;
          id = replacement.id;
        }
      }
      const name = candidate ? candidate.name : 'Exercise';
      const sets = Math.max(
        setsMin,
        Math.min(setsMax, Math.round(Number(ex.sets) || setsMin)),
      );
      const reps = Math.max(
        repsMin,
        Math.min(repsMax, Math.round(Number(ex.reps) || repsMin)),
      );
      exercises.push({
        name,
        exerciseId: candidate ? candidate.id : undefined,
        sets,
        reps,
        weight: ex.weight != null ? Number(ex.weight) : undefined,
        notes: normalizeExerciseNoteForOutput(ex.notes, wantsExerciseNotes),
        orderIndex: i,
      });
      if (candidate) usedIds.add(candidate.id);
    }

    this.deduplicateSimilarExercises(exercises, candidates, setsMin, repsMin);
    this.enforceMuscleGroupBalance(
      exercises,
      candidates,
      focusKey,
      setsMin,
      repsMin,
    );
    this.sortExercisesBySlotOrder(exercises, candidates, focusKey);
    this.validateAndBackfillExercises(
      exercises,
      candidates,
      setsMin,
      repsMin,
      targets.minExercises,
    );
    this.moveCardioExercisesLast(exercises, idToCandidate);
    exercises.forEach((ex, idx) => {
      ex.orderIndex = idx;
    });

    const reasoning = parsed.reasoning
      ? String(parsed.reasoning).trim().slice(0, 500)
      : undefined;
    const warmUp = parsed.warmUp
      ? String(parsed.warmUp).trim().slice(0, 300)
      : undefined;
    const coolDown = parsed.coolDown
      ? String(parsed.coolDown).trim().slice(0, 300)
      : undefined;
    const cardioFinisher =
      strengthPlusConditioning
        ? undefined
        : parsed.cardioFinisher?.suggestion
          ? {
              suggestion: String(parsed.cardioFinisher.suggestion)
                .trim()
                .slice(0, 200),
            }
          : undefined;

    return {
      ok: true,
      usage,
      workout: {
        name: plainWorkoutTitle(
          String(parsed.name),
          programDayFocus,
          day ?? '',
        ),
        day: parsed.day ? String(parsed.day) : dto.day,
        reasoning: reasoning || undefined,
        warmUp: warmUp || undefined,
        coolDown: coolDown || undefined,
        exercises,
        cardioFinisher,
      },
    };
  }

  /** Ensure minimum exercise count after dedupe; backfill from candidates if needed. */
  private validateAndBackfillExercises(
    exercises: CreateWorkoutDto['exercises'],
    candidates: CandidateExercise[],
    defaultSets: number,
    defaultReps: number,
    minCount: number,
  ): void {
    const usedIds = new Set(exercises.map((e) => e.exerciseId).filter(Boolean));
    while (exercises.length < minCount) {
      const replacement = candidates.find((c) => !usedIds.has(c.id));
      if (!replacement) break;
      exercises.push({
        name: replacement.name,
        exerciseId: replacement.id,
        sets: defaultSets,
        reps: defaultReps,
        orderIndex: exercises.length,
      });
      usedIds.add(replacement.id);
    }
  }

  /**
   * Replace duplicate "movement bases" (e.g. multiple squats) with a different exercise from candidates
   * so the workout has distinct movement patterns.
   */
  private deduplicateSimilarExercises(
    exercises: CreateWorkoutDto['exercises'],
    candidates: CandidateExercise[],
    defaultSets: number,
    defaultReps: number,
  ): void {
    const getBase = (name: string): string => {
      const n = (name ?? '').toLowerCase();
      // Check more specific patterns first so "bench press" and "overhead press" are different bases
      const patterns = [
        'squat',
        'deadlift',
        'lunge',
        'hip thrust',
        'thrust',
        'row',
        'pulldown',
        'push-down',
        'pull-up',
        'pullup',
        'bench', // bench press, close-grip bench, incline bench (before generic "press")
        'overhead', // overhead press, shoulder press
        'dip',
        'fly',
        'flye',
        'crossover',
        'extension',
        'raise',
        'curl',
        'pullover',
        'press', // catch-all for other presses
        'crunch',
        'plank',
      ];
      for (const p of patterns) {
        if (n.includes(p)) return p;
      }
      return n.split(/\s+/).pop() ?? n.slice(0, 20);
    };

    const usedIds = new Set<string>();
    const usedBases = new Set<string>();
    const usedNames = new Set<string>();

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const base = getBase(ex.name);
      const nameNorm = (ex.name ?? '').trim().toLowerCase();
      const isDuplicateBase = usedBases.has(base);
      const isExactDuplicate =
        usedNames.has(nameNorm) ||
        (ex.exerciseId && usedIds.has(ex.exerciseId));

      if (isExactDuplicate || isDuplicateBase) {
        const replacement = candidates.find(
          (c) =>
            !usedIds.has(c.id) &&
            !usedNames.has((c.name ?? '').trim().toLowerCase()) &&
            !usedBases.has(getBase(c.name)),
        );
        if (replacement) {
          const replName = (replacement.name ?? '').trim().toLowerCase();
          exercises[i] = {
            name: replacement.name,
            exerciseId: replacement.id,
            sets: ex.sets ?? defaultSets,
            reps: ex.reps ?? defaultReps,
            weight: ex.weight,
            notes: ex.notes,
            orderIndex: ex.orderIndex ?? i,
          };
          usedIds.add(replacement.id);
          usedBases.add(getBase(replacement.name));
          usedNames.add(replName);
          continue;
        }
      }
      usedBases.add(base);
      usedNames.add(nameNorm);
      if (ex.exerciseId) usedIds.add(ex.exerciseId);
    }
  }

  /**
   * Enforce muscle-group balance so the workout matches the training split
   * (e.g. Push day: max 2 Chest, at least 1 Shoulders, 1 Arms). Replaces excess
   * or fills missing groups from candidates.
   */
  private enforceMuscleGroupBalance(
    exercises: CreateWorkoutDto['exercises'],
    candidates: CandidateExercise[],
    focusKey: FocusKey | string,
    defaultSets: number,
    defaultReps: number,
  ): void {
    const key = String(focusKey).toLowerCase();
    const idToCandidate = new Map(candidates.map((c) => [c.id, c]));
    const usedIds = new Set(
      exercises.map((e) => e.exerciseId).filter(Boolean) as string[],
    );

    const getGroup = (ex: (typeof exercises)[0]): string => {
      const c = ex.exerciseId ? idToCandidate.get(ex.exerciseId) : null;
      return c?.primaryMuscleGroup ?? '';
    };

    type Rule = {
      maxPerGroup?: Record<string, number>;
      minPerGroup?: Record<string, number>;
      groups?: string[];
    };
    const rules: Record<string, Rule> = {
      push: {
        maxPerGroup: { Chest: 2 },
        minPerGroup: { Shoulders: 1, Arms: 1 },
        groups: ['Chest', 'Shoulders', 'Arms'],
      },
      pull: {
        maxPerGroup: { Back: 2 },
        minPerGroup: { Arms: 1 },
        groups: ['Back', 'Arms'],
      },
      legs: {
        maxPerGroup: { Legs: 3 },
        minPerGroup: {},
        groups: ['Legs', 'Core'],
      },
      lower: {
        maxPerGroup: { Legs: 3 },
        minPerGroup: { Core: 0 },
        groups: ['Legs', 'Core'],
      },
      upper: {
        maxPerGroup: { Chest: 2, Back: 2 },
        minPerGroup: { Shoulders: 1, Arms: 1 },
        groups: ['Chest', 'Back', 'Shoulders', 'Arms'],
      },
      'upper body': {
        maxPerGroup: { Chest: 2, Back: 2 },
        minPerGroup: { Shoulders: 1, Arms: 1 },
        groups: ['Chest', 'Back', 'Shoulders', 'Arms'],
      },
      'lower body': {
        maxPerGroup: { Legs: 3 },
        minPerGroup: {},
        groups: ['Legs', 'Core'],
      },
      'full body': {
        maxPerGroup: {
          Chest: 2,
          Back: 2,
          Legs: 2,
          Shoulders: 1,
          Arms: 1,
          Core: 1,
        },
        minPerGroup: {},
        groups: ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'],
      },
      chest: {
        maxPerGroup: { Chest: 4 },
        minPerGroup: {},
        groups: ['Chest'],
      },
      back: {
        maxPerGroup: { Back: 3 },
        minPerGroup: { Arms: 1 },
        groups: ['Back', 'Arms'],
      },
      shoulders: {
        maxPerGroup: { Shoulders: 4 },
        minPerGroup: {},
        groups: ['Shoulders'],
      },
      arms: {
        maxPerGroup: { Arms: 5 },
        minPerGroup: {},
        groups: ['Arms'],
      },
    };
    const rule = rules[key];
    if (!rule) return;

    const countByGroup: Record<string, number> = {};
    const indicesByGroup: Record<string, number[]> = {};
    exercises.forEach((ex, i) => {
      const g = getGroup(ex);
      if (g) {
        countByGroup[g] = (countByGroup[g] ?? 0) + 1;
        if (!indicesByGroup[g]) indicesByGroup[g] = [];
        indicesByGroup[g].push(i);
      }
    });

    const pickReplacement = (
      preferGroups: string[],
      excludeIds: Set<string>,
    ): CandidateExercise | null => {
      for (const g of preferGroups) {
        const c = candidates.find(
          (c) => !excludeIds.has(c.id) && (c.primaryMuscleGroup ?? '') === g,
        );
        if (c) return c;
      }
      return candidates.find((c) => !excludeIds.has(c.id)) ?? null;
    };

    if (rule.maxPerGroup) {
      for (const [group, max] of Object.entries(rule.maxPerGroup)) {
        const count = countByGroup[group] ?? 0;
        const indices = indicesByGroup[group] ?? [];
        if (count <= max) continue;
        const toReplace = count - max;
        const preferGroups = (rule.groups ?? []).filter((g) => g !== group);
        for (let r = 0; r < toReplace && r < indices.length; r++) {
          const i = indices[r];
          const ex = exercises[i];
          const replacement = pickReplacement(preferGroups, usedIds);
          if (replacement) {
            exercises[i] = {
              name: replacement.name,
              exerciseId: replacement.id,
              sets: ex.sets ?? defaultSets,
              reps: ex.reps ?? defaultReps,
              weight: ex.weight,
              notes: ex.notes,
              orderIndex: ex.orderIndex ?? i,
            };
            usedIds.add(replacement.id);
            countByGroup[group] = (countByGroup[group] ?? 1) - 1;
            const g = replacement.primaryMuscleGroup ?? '';
            countByGroup[g] = (countByGroup[g] ?? 0) + 1;
            if (!indicesByGroup[g]) indicesByGroup[g] = [];
            indicesByGroup[g].push(i);
          }
        }
      }
    }

    if (rule.minPerGroup) {
      for (const [group, min] of Object.entries(rule.minPerGroup)) {
        if (min <= 0) continue;
        const count = countByGroup[group] ?? 0;
        if (count >= min) continue;
        const need = min - count;
        const preferGroups = [group];
        const indicesToReplace: number[] = [];
        for (
          let i = 0;
          i < exercises.length && indicesToReplace.length < need;
          i++
        ) {
          if (getGroup(exercises[i]) !== group) indicesToReplace.push(i);
        }
        for (const i of indicesToReplace) {
          const ex = exercises[i];
          const replacement = pickReplacement(preferGroups, usedIds);
          if (replacement) {
            const oldId = ex.exerciseId;
            if (oldId) usedIds.delete(oldId);
            exercises[i] = {
              name: replacement.name,
              exerciseId: replacement.id,
              sets: ex.sets ?? defaultSets,
              reps: ex.reps ?? defaultReps,
              weight: ex.weight,
              notes: ex.notes,
              orderIndex: ex.orderIndex ?? i,
            };
            usedIds.add(replacement.id);
            const oldG = oldId
              ? idToCandidate.get(oldId)?.primaryMuscleGroup
              : '';
            if (oldG)
              countByGroup[oldG] = Math.max(0, (countByGroup[oldG] ?? 1) - 1);
            countByGroup[group] = (countByGroup[group] ?? 0) + 1;
          }
        }
      }
    }
  }

  /**
   * Re-sort exercises so they follow slot order (compound first, then accessories)
   * after balance may have changed the mix. Uses variation group from name.
   */
  private sortExercisesBySlotOrder(
    exercises: CreateWorkoutDto['exercises'],
    _candidates: CandidateExercise[],
    focusKey: FocusKey | string,
  ): void {
    if (exercises.length <= 1) return;
    const key = String(focusKey).toLowerCase();

    const getBase = (name: string): string => {
      const n = (name ?? '').toLowerCase();
      const patterns = [
        'squat',
        'deadlift',
        'lunge',
        'hip thrust',
        'thrust',
        'row',
        'pulldown',
        'push-down',
        'pull-up',
        'pullup',
        'bench',
        'overhead',
        'dip',
        'fly',
        'flye',
        'crossover',
        'extension',
        'raise',
        'curl',
        'pullover',
        'press',
        'crunch',
        'plank',
      ];
      for (const p of patterns) {
        if (n.includes(p)) return p;
      }
      return n.split(/\s+/).pop() ?? n.slice(0, 20);
    };

    const slotOrder = (base: string): number => {
      switch (key) {
        case 'push':
          if (['bench', 'dip', 'press'].includes(base)) return 0;
          if (base === 'overhead') return 1;
          if (['fly', 'flye', 'crossover', 'raise'].includes(base)) return 2;
          if (
            ['extension', 'push-down', 'pushdown'].includes(base) ||
            base.includes('push-down')
          )
            return 3;
          return 4;
        case 'pull':
          if (['pulldown', 'pull-up', 'pullup'].includes(base)) return 0;
          if (base === 'row') return 1;
          if (['curl', 'pullover'].includes(base)) return 2;
          return 3;
        case 'legs':
        case 'lower':
        case 'lower body':
          if (base === 'squat') return 0;
          if (['deadlift', 'thrust'].includes(base)) return 1;
          if (base === 'lunge') return 2;
          if (['extension', 'curl', 'raise'].includes(base)) return 3;
          return 4;
        case 'upper':
        case 'upper body':
          if (
            [
              'bench',
              'row',
              'overhead',
              'dip',
              'pulldown',
              'pull-up',
              'pullup',
            ].includes(base)
          )
            return 0;
          if (['fly', 'curl', 'extension', 'raise', 'pullover'].includes(base))
            return 1;
          return 2;
        case 'chest':
          if (['bench', 'dip', 'press'].includes(base)) return 0;
          if (['fly', 'flye', 'crossover'].includes(base)) return 1;
          return 2;
        case 'back':
          if (['pulldown', 'pull-up', 'pullup'].includes(base)) return 0;
          if (base === 'row') return 1;
          if (['curl', 'pullover'].includes(base)) return 2;
          return 3;
        case 'shoulders':
          if (base === 'overhead' || base === 'press') return 0;
          if (base === 'raise') return 1;
          return 2;
        case 'arms':
          if (
            ['extension', 'dip', 'push-down'].includes(base) ||
            base.includes('push-down')
          )
            return 0;
          if (base === 'curl') return 1;
          return 2;
        case 'full body':
          if (
            [
              'deadlift',
              'squat',
              'bench',
              'row',
              'pulldown',
              'pull-up',
              'pullup',
              'overhead',
            ].includes(base)
          )
            return 0;
          if (
            ['curl', 'extension', 'fly', 'raise', 'lunge', 'thrust'].includes(
              base,
            )
          )
            return 1;
          return 2;
        default:
          return 0;
      }
    };

    const withOrder = exercises.map((ex, i) => {
      const base = getBase(ex.name);
      const order = slotOrder(base);
      return { ex, i, order };
    });
    withOrder.sort((a, b) => a.order - b.order || a.i - b.i);
    const reordered = withOrder.map(({ ex }) => ex);
    exercises.length = 0;
    exercises.push(...reordered);
    exercises.forEach((ex, i) => {
      ex.orderIndex = i;
    });
  }

  private generateWorkoutByRules(
    candidates: CandidateExercise[],
    day?: string,
    preferences?: any,
    setRep?: {
      setsMin: number;
      setsMax: number;
      repsMin: number;
      repsMax: number;
    },
  ): CreateWorkoutDto {
    const focus = (preferences?.focus || 'full body')
      .toLowerCase()
      .split(/\+/)[0]
      .trim();
    const focusKey = normalizeFocusToKey(focus);
    const difficulty = preferences?.difficulty || 'intermediate';
    const guidelines =
      setRep ?? getSetRepGuidelines(preferences?.goal, difficulty);
    const setsMin = guidelines.setsMin;
    const repsMin = guidelines.repsMin;

    const detailLevel = (preferences?.detailLevel ?? 'detailed') as
      | 'simple'
      | 'detailed';
    const isSimple = detailLevel === 'simple';
    const sessionDuration =
      typeof preferences?.duration === 'number' ? preferences.duration : 45;
    const targets = exerciseTargetsForSession(
      sessionDuration,
      detailLevel,
      focusKey === 'cardio' || focusKey === 'recovery',
    );
    let chosen: CandidateExercise[] = [];
    if (candidates.length >= 4) {
      const balanced = this.balanceCandidateOrderForPrompt(
        candidates,
        focusKey,
      );
      let count = targets.minExercises;
      if (isSimple) count = Math.min(count, 5);
      if (difficulty === 'beginner') count = Math.max(4, count - 1);
      if (difficulty === 'advanced') count = count + 1;
      count = Math.min(Math.max(count, 4), balanced.length);
      chosen = balanced.slice(0, Math.min(count, balanced.length));
    }

    const exercises = chosen.map((c, i) => ({
      name: c.name,
      exerciseId: c.id,
      sets: Math.min(10, guidelines.setsMin + (i === 0 ? 1 : 0)),
      reps: Math.min(
        99,
        Math.round((guidelines.repsMin + guidelines.repsMax) / 2),
      ),
      weight: undefined as number | undefined,
      notes: undefined as string | undefined,
      orderIndex: i,
    }));

    if (exercises.length === 0) {
      const fallback = this.getHardcodedFallback(
        focus,
        difficulty,
        day,
        guidelines,
      );
      return fallback;
    }

    this.enforceMuscleGroupBalance(
      exercises,
      candidates,
      focusKey,
      setsMin,
      repsMin,
    );
    this.sortExercisesBySlotOrder(exercises, candidates, focusKey);

    if (
      this.programGoalWantsCardioFinisher(preferences?.goal) &&
      focusKey !== 'cardio' &&
      focusKey !== 'recovery'
    ) {
      const hasCardio = exercises.some((ex) => {
        const c = candidates.find((x) => x.id === ex.exerciseId);
        return c?.primaryMuscleGroup === 'Cardio';
      });
      if (!hasCardio) {
        const usedIds = new Set(
          exercises.map((e) => e.exerciseId).filter((id): id is string => !!id),
        );
        const pick = this.pickCardioFinisherCandidate(
          candidates,
          usedIds,
          preferences?.cardioModalities as string[] | undefined,
        );
        if (pick) {
          exercises.push({
            name: pick.name,
            exerciseId: pick.id,
            sets: Math.min(4, guidelines.setsMax),
            reps: Math.min(
              30,
              Math.round((guidelines.repsMin + guidelines.repsMax) / 2),
            ),
            weight: undefined as number | undefined,
            notes: undefined as string | undefined,
            orderIndex: exercises.length,
          });
        }
      }
      const idMap = new Map(candidates.map((c) => [c.id, c]));
      this.moveCardioExercisesLast(exercises, idMap);
      exercises.forEach((ex, idx) => {
        ex.orderIndex = idx;
      });
    }

    const label = (preferences?.programDayFocus || focus || 'Session').trim();
    const workoutName = plainWorkoutTitle(undefined, label, day ?? '');
    const reasoning = `Compound movements first, then isolation.${day ? ` Fits ${day} in your weekly split.` : ''} Warm-up: 5 min light movement and dynamic stretch.`;

    return {
      name: workoutName,
      day,
      reasoning,
      exercises,
    };
  }

  private getHardcodedFallback(
    focus: string,
    difficulty: string,
    day?: string,
    setRep?: {
      setsMin: number;
      setsMax: number;
      repsMin: number;
      repsMax: number;
    },
  ): CreateWorkoutDto {
    const guidelines = setRep ?? getSetRepGuidelines(undefined, difficulty);
    const sets = Math.min(10, guidelines.setsMin + 1);
    const reps = Math.round((guidelines.repsMin + guidelines.repsMax) / 2);

    const templates: Record<
      string,
      Array<{ name: string; sets: number; reps: number; weight?: number }>
    > = {
      'upper body': [
        { name: 'Bench Press', sets, reps, weight: 135 },
        { name: 'Pull-ups', sets, reps },
        { name: 'Shoulder Press', sets, reps, weight: 95 },
        { name: 'Bicep Curls', sets, reps, weight: 30 },
      ],
      'lower body': [
        { name: 'Squats', sets, reps, weight: 185 },
        { name: 'Deadlifts', sets, reps, weight: 225 },
        { name: 'Leg Press', sets, reps, weight: 270 },
        { name: 'Lunges', sets, reps, weight: 45 },
      ],
      'full body': [
        { name: 'Deadlifts', sets, reps, weight: 225 },
        { name: 'Bench Press', sets, reps, weight: 135 },
        { name: 'Squats', sets, reps, weight: 185 },
        { name: 'Pull-ups', sets, reps },
      ],
    };
    let list = templates[focus] || templates['full body'];
    if (difficulty === 'beginner') {
      list = list.map((e) => ({
        ...e,
        sets: Math.max(2, e.sets - 1),
        reps: Math.max(8, e.reps - 2),
        weight: e.weight ? Math.round(e.weight * 0.6) : undefined,
      }));
    } else if (difficulty === 'advanced') {
      list = list.map((e) => ({
        ...e,
        sets: e.sets + 1,
        reps: e.reps + 2,
        weight: e.weight ? Math.round(e.weight * 1.2) : undefined,
      }));
    }
    const workoutName = `${focus.charAt(0).toUpperCase() + focus.slice(1)} Workout${day ? ` - ${day}` : ''}`;
    return {
      name: workoutName,
      day: day,
      reasoning: `Compound movements first.${day ? ` Balanced for ${day}.` : ''} Warm-up: 5 min light cardio and dynamic stretch.`,
      exercises: list.map((e, i) => ({
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        weight: e.weight,
        orderIndex: i,
      })),
    };
  }
}
