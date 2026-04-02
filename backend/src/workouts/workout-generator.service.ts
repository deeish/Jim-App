import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ExercisesService } from '../exercises/exercises.service';
import Groq from 'groq-sdk';
import { GenerateWorkoutDto } from './dto/generate-workout.dto';
import { CreateWorkoutDto } from './dto/create-workout.dto';
import { getSlotsForFocus, normalizeFocusToKey, type FocusKey } from '../data/program-templates';
import { getAnchorIdsForFocus } from '../data/anchor-exercises';
import { getSetRepGuidelines } from '../data/set-rep-schemes';

/** Minimal shape for generator candidates (from exercise library). Metadata used for rules and prompts. */
export interface CandidateExercise {
  id: string;
  name: string;
  primaryMuscleGroup: string;
  equipment: string[];
  /** From library: Push, Pull, Squat, Hinge, Lunge, Carry. Used for slot enforcement. */
  movementPatterns: string[];
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
function exerciseTargetsForSession(
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

@Injectable()
export class WorkoutGeneratorService {
  constructor(
    private readonly config: ConfigService,
    private readonly exercisesService: ExercisesService,
    private readonly prisma: PrismaService,
  ) {}

  async generateWorkout(
    generateWorkoutDto: GenerateWorkoutDto,
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
      limit: 80,
    });

    const excludeNames = preferences?.excludeExerciseNames ?? [];
    let filtered = rawCandidates;
    if (excludeNames.length > 0) {
      const lowerExclude = excludeNames.map((n) => n.toLowerCase().trim()).filter((n) => n.length >= 2);
      if (lowerExclude.length > 0) {
        filtered = rawCandidates.filter(
          (c) => !lowerExclude.some((ex) => (c.name ?? '').toLowerCase().includes(ex)),
        );
        if (filtered.length < 4) filtered = rawCandidates;
      }
    }
    const anchorIds = getAnchorIdsForFocus(focus);
    const toCandidate = (e: { id: string; name: string; primaryMuscleGroup: string; equipment?: string[]; movementPatterns?: string[] }): CandidateExercise => ({
      id: e.id,
      name: e.name,
      primaryMuscleGroup: e.primaryMuscleGroup,
      equipment: e.equipment ?? [],
      movementPatterns: e.movementPatterns ?? [],
      variationGroup: this.getVariationGroupFromName(e.name),
      equipmentType: (e.equipment && e.equipment[0]) ? e.equipment[0] : 'mixed',
    });
    const candidateList = this.buildCandidateListWithAnchorsFirst(
      filtered.map(toCandidate),
      anchorIds,
    );

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
    if (apiKey?.trim() && candidateList.length >= 4) {
      try {
        const workout = await this.generateWithGroq(
          generateWorkoutDto,
          apiKey,
          candidateList,
          setRep,
          lastPerformance,
        );
        if (workout) return workout;
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[WorkoutGenerator] Groq failed, using rule-based:',
            (err as Error)?.message ?? err,
          );
        }
      }
    }

    return this.generateWorkoutByRules(candidateList, day, preferences, setRep);
  }

  /** Derive variation group from exercise name for one-per-pattern rules. */
  private getVariationGroupFromName(name: string): string {
    const n = (name ?? '').toLowerCase();
    const patterns = [
      'squat', 'deadlift', 'lunge', 'hip thrust', 'thrust', 'row', 'pulldown', 'push-down',
      'pull-up', 'pullup', 'bench', 'overhead', 'dip', 'fly', 'flye', 'crossover', 'extension',
      'raise', 'curl', 'pullover', 'press', 'crunch', 'plank',
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

    const leadCount = Math.min(anchorsInCandidates.length, Math.random() > 0.5 ? 2 : 1);
    const leadIndices = new Set<number>();
    while (leadIndices.size < leadCount) {
      leadIndices.add(Math.floor(Math.random() * anchorsInCandidates.length));
    }
    const leadAnchors = anchorsInCandidates.filter((_, i) => leadIndices.has(i));
    const otherAnchors = anchorsInCandidates.filter((_, i) => !leadIndices.has(i));
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

    const shuffledGroups = groupOrder.map((g) => this.shuffleArray(byGroup.get(g) ?? []));
    const result: CandidateExercise[] = [];
    let idx = 0;
    while (true) {
      let added = 0;
      for (const list of shuffledGroups) {
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

  /** Last ~8 workouts' exercise IDs for variety (avoid repeating). */
  private async getRecentExerciseIds(userId: string, limit = 25): Promise<string[]> {
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
        if (entry.exerciseId && idSet.has(entry.exerciseId) && !result.has(entry.exerciseId)) {
          const sets = entry.completedSets?.filter((s) => s.completed) ?? [];
          const best = sets.reduce<{ weight: number; reps: number } | null>((acc, s) => {
            const w = s.weight ?? 0;
            if (!acc) return { weight: w, reps: s.reps };
            if (w > acc.weight) return { weight: w, reps: s.reps };
            return acc;
          }, null);
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
   * Token usage: ~65 exercises (compact id/name/m) + system/user text ≈ 2k input tokens;
   * output max 4096. Well under Groq llama-3.3-70b context (131k).
   */
  async generateFullProgram(
    options: {
      sessions: Array<{ weekIndex: number; weekday: string; title?: string; type: string; durationMin: number; durationMax: number; isHardDay: boolean }>;
      goal?: string;
      equipment?: string[];
      limitations?: string[];
      detailLevel?: 'simple' | 'detailed';
      makeItEasier?: boolean;
    },
    apiKey: string,
  ): Promise<Array<{
    weekIndex: number;
    weekday: string;
    name: string;
    reasoning?: string;
    warmUp?: string;
    coolDown?: string;
    cardioFinisher?: { suggestion: string };
    exercises: Array<{ name: string; sets: number; reps: number; weight?: number; notes?: string; exerciseId?: string }>;
  }> | null> {
    const { sessions, goal = 'hypertrophy', equipment = [], limitations = [], detailLevel = 'detailed', makeItEasier = false } = options;
    if (sessions.length < 2 || sessions.length > 7) return null;

    const difficulty = makeItEasier ? 'beginner' : 'intermediate';
    const setRep = getSetRepGuidelines(goal, difficulty);

    const rawCandidates = this.exercisesService.getCandidatesForGenerator({
      focus: 'full body',
      equipment: equipment.length ? equipment : undefined,
      excludeIds: [],
      limit: 65,
    });
    const toCandidate = (e: { id: string; name: string; primaryMuscleGroup: string; equipment?: string[]; movementPatterns?: string[] }): CandidateExercise => ({
      id: e.id,
      name: e.name,
      primaryMuscleGroup: e.primaryMuscleGroup,
      equipment: e.equipment ?? [],
      movementPatterns: e.movementPatterns ?? [],
      variationGroup: this.getVariationGroupFromName(e.name),
      equipmentType: (e.equipment && e.equipment[0]) ? e.equipment[0] : 'mixed',
    });
    const candidates = rawCandidates.map(toCandidate);
    if (candidates.length < 20) return null;

    const candidateJson = JSON.stringify(
      candidates.map((c) => ({ id: c.id, name: c.name, m: c.primaryMuscleGroup })),
      null,
      0,
    );

    const dayLines = sessions.map((s, i) => {
      const focus = (s.title ?? s.type).trim() || 'full body';
      const duration = Math.round((s.durationMin + s.durationMax) / 2);
      const fk = normalizeFocusToKey(focus);
      const isCardioOrRec = fk === 'cardio' || fk === 'recovery';
      const { promptRange } = exerciseTargetsForSession(duration, detailLevel, isCardioOrRec);
      return `Day ${i + 1} (${focus}, ${s.weekday}, ~${duration} min): Choose ${promptRange} exercises from the list that fit this day's focus (enough volume for ~${duration} minutes). Use ONLY exercise "id" values from the list. Main compounds first, then accessories. Within this day use only one movement variant (e.g. one bench press, not flat + incline in same day).`;
    }).join('\n');

    const focusCounts = new Map<string, number>();
    for (const s of sessions) {
      const focus = (s.title ?? s.type).trim() || 'full body';
      focusCounts.set(focus, (focusCounts.get(focus) ?? 0) + 1);
    }
    const hasRepeatedFocus = [...focusCounts.values()].some((c) => c > 1);
    const varietyInstruction = hasRepeatedFocus
      ? '\nImportant: Multiple days have the same focus (e.g. several Push or Pull days). Vary exercise selection across those days—do not repeat the same exercise lineup on every Push day. Pick different compounds and accessories so each week feels fresh.'
      : '';

    const equipmentStr = equipment.length ? equipment.join(', ') : 'general gym equipment';
    const limitationsBlock = limitations.length > 0
      ? `\nLimitations (respect these): ${limitations.slice(0, 8).join('; ').slice(0, 200)}.`
      : '';

    const systemPrompt = `You are a certified fitness trainer designing a full weekly program in one response. You must choose exercises ONLY from the provided list by their "id". Respond with exactly one JSON object, no markdown.

Structure:
- "programSummary": string (2-4 sentences describing the program and how the days work together).
- "days": array of objects, one per day, in the same order as the day list below. Each day object must have:
  - "name": string (workout title, e.g. "Push Day - Chest & Shoulders")
  - "reasoning": string (1-3 sentences on why this day is structured this way)
  - "warmUp": string (1-2 sentences)
  - "coolDown": string (1-2 sentences)
  - "exercises": array of objects, each with "exerciseId" (must be an id from the list), "sets" (number), "reps" (number), and optionally "notes" (string). Order: main compounds first, then accessories.
For the first two exercises of each day, prefer the strongest, well-known primary compounds for that day's pattern (e.g. main bench or push-up variant for horizontal push; pull-up or row for pull; squat or leg press for legs)—not redundant variations of the same pattern on the same day.
Rep selection: pick rep numbers in the middle of the allowed range; main compounds can be slightly lower reps than accessories (2–4 reps lower is fine).
When the program has multiple days with the same focus (e.g. Push on day 1 and Push on day 4), vary which exercises you pick for each so the user gets variety across weeks—avoid repeating the same workout.`;

    const userPrompt = `Design a ${sessions.length}-day program. Use ONLY exercise "id" values from this list (m = muscle group):
${candidateJson}

${dayLines}
${varietyInstruction}

Set/rep: ${setRep.description} (${setRep.setsMin}-${setRep.setsMax} sets, ${setRep.repsMin}-${setRep.repsMax} reps). Goal: ${goal}. Difficulty: ${difficulty}. Equipment: ${equipmentStr}.${limitationsBlock}

Return valid JSON: "programSummary" (string) and "days" (array of ${sessions.length} objects). Each day: "name", "reasoning", "warmUp", "coolDown", "exercises" (array of {"exerciseId": "<id from list>", "sets", "reps", "notes"?}).`;

    const groq = new Groq({ apiKey });
    let response: { choices?: Array<{ message?: { content?: string } }> };
    try {
      response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.6,
        max_tokens: 4096,
      });
    } catch {
      return null;
    }

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    let parsed: { programSummary?: string; days?: Array<{ name?: string; reasoning?: string; warmUp?: string; coolDown?: string; exercises?: Array<{ exerciseId?: string; sets?: number; reps?: number; notes?: string }> }> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (!parsed.days || !Array.isArray(parsed.days) || parsed.days.length < sessions.length) return null;

    const idToCandidate = new Map(candidates.map((c) => [c.id, c]));
    const results: Array<{ weekIndex: number; weekday: string; name: string; reasoning?: string; warmUp?: string; coolDown?: string; cardioFinisher?: { suggestion: string }; exercises: Array<{ name: string; sets: number; reps: number; weight?: number; notes?: string; exerciseId?: string }> }> = [];

    for (let i = 0; i < sessions.length; i++) {
      const spec = sessions[i];
      const day = parsed.days[i];
      const duration = Math.round((spec.durationMin + spec.durationMax) / 2);
      const fk = normalizeFocusToKey((spec.title ?? spec.type).trim() || 'full body');
      const isCardioOrRec = fk === 'cardio' || fk === 'recovery';
      const minExercisesPerDay = exerciseTargetsForSession(duration, detailLevel, isCardioOrRec).minExercises;
      const usedIdsThisDay = new Set<string>();

      const exercises: Array<{ name: string; sets: number; reps: number; weight?: number; notes?: string; exerciseId?: string }> = [];

      if (day?.exercises?.length) {
        for (const ex of day.exercises) {
          const id = ex.exerciseId?.trim();
          let candidate = id ? idToCandidate.get(id) : null;
          if (!candidate && id) {
            const fallback = candidates.find((c) => !usedIdsThisDay.has(c.id));
            if (fallback) candidate = fallback;
          }
          const name = candidate ? candidate.name : 'Exercise';
          const sets = Math.max(setRep.setsMin, Math.min(setRep.setsMax, Math.round(Number(ex.sets) || setRep.setsMin)));
          const reps = Math.max(setRep.repsMin, Math.min(setRep.repsMax, Math.round(Number(ex.reps) || setRep.repsMin)));
          exercises.push({
            name,
            sets,
            reps,
            notes: ex.notes != null ? String(ex.notes) : undefined,
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

      results.push({
        weekIndex: spec.weekIndex,
        weekday: spec.weekday,
        name: (day?.name && String(day.name).trim()) || `${(spec.title ?? spec.type) ?? 'Workout'} - ${spec.weekday}`,
        reasoning: day?.reasoning != null ? String(day.reasoning).trim().slice(0, 500) : undefined,
        warmUp: day?.warmUp != null ? String(day.warmUp).trim().slice(0, 300) : undefined,
        coolDown: day?.coolDown != null ? String(day.coolDown).trim().slice(0, 300) : undefined,
        exercises,
      });
    }

    return results;
  }

  /**
   * Try to generate a full program in one LLM call. Returns null if no API key,
   * parse failure, or wrong session count; caller should fall back to per-session generation.
   */
  async tryGenerateFullProgram(dto: {
    sessions: Array<{ weekIndex: number; weekday: string; title?: string; type: string; durationMin: number; durationMax: number; isHardDay: boolean }>;
    goal?: string;
    location?: 'gym' | 'home';
    detailLevel?: 'simple' | 'detailed';
    makeItEasier?: boolean;
    avoidConstraints?: string[];
  }): Promise<Array<{
    weekIndex: number;
    weekday: string;
    name: string;
    reasoning?: string;
    warmUp?: string;
    coolDown?: string;
    cardioFinisher?: { suggestion: string };
    exercises: Array<{ name: string; sets: number; reps: number; weight?: number; notes?: string; exerciseId?: string }>;
  }> | null> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey?.trim() || dto.sessions.length < 2 || dto.sessions.length > 7) return null;

    const equipment = dto.location === 'home'
      ? ['Dumbbell', 'Resistance Band', 'Bodyweight']
      : undefined;

    return this.generateFullProgram(
      {
        sessions: dto.sessions,
        goal: dto.goal ?? 'hypertrophy',
        equipment,
        limitations: dto.avoidConstraints ?? [],
        detailLevel: dto.detailLevel ?? 'detailed',
        makeItEasier: dto.makeItEasier === true,
      },
      apiKey,
    );
  }

  private async generateWithGroq(
    dto: GenerateWorkoutDto,
    apiKey: string,
    candidates: CandidateExercise[],
    setRep: { setsMin: number; setsMax: number; repsMin: number; repsMax: number; description: string },
    lastPerformance: Map<string, LastPerformance>,
  ): Promise<CreateWorkoutDto | null> {
    const { day, preferences, userId } = dto;
    const focus = preferences?.focus ?? 'full body';
    const focusKey: FocusKey | string = normalizeFocusToKey(focus);
    const difficulty = preferences?.difficulty ?? 'intermediate';
    const duration = preferences?.duration ?? 45;
    const equipmentStr =
      preferences?.equipment?.length
        ? preferences.equipment.join(', ')
        : 'general gym equipment';
    const goal = preferences?.goal ?? 'hypertrophy';
    const experience = preferences?.experience ?? difficulty;
    const limitations = preferences?.limitations ?? [];
    const programTemplate = preferences?.programTemplateId ?? '';
    const programDayFocus = preferences?.programDayFocus ?? focus;
    const detailLevel = preferences?.detailLevel ?? 'detailed';
    const isSimple = detailLevel === 'simple';

    const slots = getSlotsForFocus(focus);
    const isCardioOrRecovery = focusKey === 'cardio' || focusKey === 'recovery';
    const targets = exerciseTargetsForSession(duration, detailLevel, isCardioOrRecovery);
    const exerciseRange = targets.promptRange;
    const mixedCardio = focusKey === 'full body' && (focus.toLowerCase().includes('run') || focus.toLowerCase().includes('cardio'));

    const avoidIds = [...new Set(preferences?.excludeExerciseIds ?? [])];
    const avoidBlock = avoidIds.length > 0
      ? `\nAvoid list (do not use these exercise ids unless the list would otherwise be too small; prefer exercises not in this list): ${avoidIds.join(', ')}.`
      : '';

    const candidatesForPrompt = this.balanceCandidateOrderForPrompt(candidates, focusKey);
    const candidateJson = JSON.stringify(
      candidatesForPrompt.map((c) => ({
        id: c.id,
        name: c.name,
        muscleGroup: c.primaryMuscleGroup,
        movementPattern: (c.movementPatterns && c.movementPatterns[0]) ? c.movementPatterns[0] : 'Push',
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
      userContextParts.push(`Limitations (respect these): ${limitations.join('; ')}. Avoid exercises that conflict.`);
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
      lastPerfLines.push(`${name} (id: ${exerciseId}): last time ${w} ${w ? '×' : ''} ${r} reps`);
    });
    const lastPerfBlock =
      lastPerfLines.length > 0
        ? `\nLast performance (suggest slight progression where appropriate, e.g. +5 lb or +1 rep in notes):\n${lastPerfLines.slice(0, 15).join('\n')}`
        : '';

    const warmUpCoolDown =
      'Provide "warmUp" and "coolDown" as separate strings (1-2 sentences each). Do not put them inside "reasoning".';

    const mixedCardioHint = mixedCardio
      ? ` Choose ${exerciseRange} strength exercises from the list only (all must have an id from the list). Do NOT put cardio in the exercises array. Optionally include a separate "cardioFinisher" object: { "suggestion": "e.g. Run 10 min or Row 500 m" } for a short cardio finisher after the workout.`
      : '';

    const volumeHint = isCardioOrRecovery
      ? ''
      : `\nVolume: For ~${duration} minutes, include at least ${targets.minExercises} distinct exercises with enough total work that the session feels like a real workout, not a minimal list.`;

    const reasoningHint = isSimple
      ? 'Keep "reasoning" to 1-2 short sentences.'
      : '"reasoning": string (2-4 sentences). Reference the program and day. Be specific; no filler praise.';
    const warmCoolHint = isSimple
      ? 'Keep warmUp and coolDown to one short sentence each.'
      : '1-2 sentences each for warmUp and coolDown.';

    const systemPrompt = `You are a certified fitness trainer. You must choose exercises ONLY from the provided list by their "id". Respond with exactly one JSON object, no markdown.
- "name": string (workout title)
- "day": string or omit
- "reasoning": string. ${reasoningHint} Do NOT put warm-up or cool-down here; use warmUp and coolDown fields instead.
- "warmUp": string (${warmCoolHint} e.g. "5 min light cardio, band pull-aparts, dynamic stretch.")
- "coolDown": string (${warmCoolHint} e.g. "Stretch chest and shoulders, 2 min walk.")
- "exercises": array of objects. Each must have "exerciseId" (string, must be one of the ids from the list—no made-up ids), "sets" (number), "reps" (number), and optionally "weight" (number), "notes" (string). Use the exact "id" from the list. Order: main compounds first, then accessories.
${mixedCardio ? '- "cardioFinisher": optional object with "suggestion" (string, e.g. "Run 10 min"). Only if this is a workout that includes a cardio finisher. Do not put cardio in exercises.' : ''}`;

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
${volumeHint}

Vary exercise selection when possible so the user gets fresh workouts.

Important: Do NOT pick multiple variations of the same movement in one workout. Use distinct movement patterns:
- For Push days: pick ONE horizontal push (e.g. flat or incline bench), ONE vertical push (e.g. overhead/shoulder press), and 1–2 isolation exercises (e.g. flyes, pushdowns, extensions). Do not pick multiple bench press variants (e.g. flat bench + close-grip bench + decline bench) in the same session.
- For Pull days: one row, one vertical pull (pulldown/pull-up), then isolation (curls, etc.). Not multiple row variations.
- For legs: one squat, one hinge (deadlift/hip thrust), one lunge or single-leg, then isolation. Not multiple squat variants.

Return valid JSON with exerciseId, sets, reps, and optional notes (one-line focus/why per exercise). Include warmUp and coolDown as separate fields. Sets and reps should follow the set/rep scheme above. Write "reasoning" that references the program (do not duplicate warm-up/cool-down in reasoning).`;

    const groq = new Groq({ apiKey });
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.62,
      max_tokens: 3072,
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

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
      return null;
    }

    if (!parsed?.exercises?.length || !parsed.name) return null;

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
      const sets = Math.max(setsMin, Math.min(setsMax, Math.round(Number(ex.sets) || setsMin)));
      const reps = Math.max(repsMin, Math.min(repsMax, Math.round(Number(ex.reps) || repsMin)));
      exercises.push({
        name,
        exerciseId: candidate ? candidate.id : undefined,
        sets,
        reps,
        weight: ex.weight != null ? Number(ex.weight) : undefined,
        notes: ex.notes != null ? String(ex.notes) : undefined,
        orderIndex: i,
      });
      if (candidate) usedIds.add(candidate.id);
    }

    this.deduplicateSimilarExercises(exercises, candidates, setsMin, repsMin);
    this.enforceMuscleGroupBalance(exercises, candidates, focusKey, setsMin, repsMin);
    this.sortExercisesBySlotOrder(exercises, candidates, focusKey);
    this.validateAndBackfillExercises(exercises, candidates, setsMin, repsMin, targets.minExercises);

    const reasoning = parsed.reasoning
      ? String(parsed.reasoning).trim().slice(0, 500)
      : undefined;
    const warmUp = parsed.warmUp ? String(parsed.warmUp).trim().slice(0, 300) : undefined;
    const coolDown = parsed.coolDown ? String(parsed.coolDown).trim().slice(0, 300) : undefined;
    const cardioFinisher = parsed.cardioFinisher?.suggestion
      ? { suggestion: String(parsed.cardioFinisher.suggestion).trim().slice(0, 200) }
      : undefined;

    return {
      name: String(parsed.name),
      day: parsed.day ? String(parsed.day) : dto.day,
      reasoning: reasoning || undefined,
      warmUp: warmUp || undefined,
      coolDown: coolDown || undefined,
      exercises,
      cardioFinisher,
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
        'bench',       // bench press, close-grip bench, incline bench (before generic "press")
        'overhead',    // overhead press, shoulder press
        'dip',
        'fly',
        'flye',
        'crossover',
        'extension',
        'raise',
        'curl',
        'pullover',
        'press',       // catch-all for other presses
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
      const isExactDuplicate = usedNames.has(nameNorm) || (ex.exerciseId && usedIds.has(ex.exerciseId));

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
    const usedIds = new Set(exercises.map((e) => e.exerciseId).filter(Boolean) as string[]);

    const getGroup = (ex: (typeof exercises)[0]): string => {
      const c = ex.exerciseId ? idToCandidate.get(ex.exerciseId) : null;
      return c?.primaryMuscleGroup ?? '';
    };

    type Rule = { maxPerGroup?: Record<string, number>; minPerGroup?: Record<string, number>; groups?: string[] };
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
        maxPerGroup: { Chest: 2, Back: 2, Legs: 2, Shoulders: 1, Arms: 1, Core: 1 },
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
        for (let i = 0; i < exercises.length && indicesToReplace.length < need; i++) {
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
            const oldG = oldId ? idToCandidate.get(oldId)?.primaryMuscleGroup : '';
            if (oldG) countByGroup[oldG] = Math.max(0, (countByGroup[oldG] ?? 1) - 1);
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
    candidates: CandidateExercise[],
    focusKey: FocusKey | string,
  ): void {
    if (exercises.length <= 1) return;
    const idToCandidate = new Map(candidates.map((c) => [c.id, c]));
    const key = String(focusKey).toLowerCase();

    const getBase = (name: string): string => {
      const n = (name ?? '').toLowerCase();
      const patterns = [
        'squat', 'deadlift', 'lunge', 'hip thrust', 'thrust', 'row', 'pulldown', 'push-down',
        'pull-up', 'pullup', 'bench', 'overhead', 'dip', 'fly', 'flye', 'crossover', 'extension',
        'raise', 'curl', 'pullover', 'press', 'crunch', 'plank',
      ];
      for (const p of patterns) {
        if (n.includes(p)) return p;
      }
      return n.split(/\s+/).pop() ?? n.slice(0, 20);
    };

    const slotOrder = (base: string, group: string): number => {
      switch (key) {
        case 'push':
          if (['bench', 'dip', 'press'].includes(base)) return 0;
          if (base === 'overhead') return 1;
          if (['fly', 'flye', 'crossover', 'raise'].includes(base)) return 2;
          if (['extension', 'push-down', 'pushdown'].includes(base) || base.includes('push-down')) return 3;
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
          if (['bench', 'row', 'overhead', 'dip', 'pulldown', 'pull-up', 'pullup'].includes(base)) return 0;
          if (['fly', 'curl', 'extension', 'raise', 'pullover'].includes(base)) return 1;
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
          if (['extension', 'dip', 'push-down'].includes(base) || base.includes('push-down')) return 0;
          if (base === 'curl') return 1;
          return 2;
        case 'full body':
          if (['deadlift', 'squat', 'bench', 'row', 'pulldown', 'pull-up', 'pullup', 'overhead'].includes(base)) return 0;
          if (['curl', 'extension', 'fly', 'raise', 'lunge', 'thrust'].includes(base)) return 1;
          return 2;
        default:
          return 0;
      }
    };

    const withOrder = exercises.map((ex, i) => {
      const base = getBase(ex.name);
      const group = ex.exerciseId ? idToCandidate.get(ex.exerciseId)?.primaryMuscleGroup ?? '' : '';
      const order = slotOrder(base, group);
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
    setRep?: { setsMin: number; setsMax: number; repsMin: number; repsMax: number },
  ): CreateWorkoutDto {
    const focus = (preferences?.focus || 'full body').toLowerCase().split(/\+/)[0].trim();
    const focusKey = normalizeFocusToKey(focus);
    const difficulty = preferences?.difficulty || 'intermediate';
    const guidelines = setRep ?? getSetRepGuidelines(preferences?.goal, difficulty);
    const setsMin = guidelines.setsMin;
    const repsMin = guidelines.repsMin;

    const detailLevel = (preferences?.detailLevel ?? 'detailed') as 'simple' | 'detailed';
    const isSimple = detailLevel === 'simple';
    const sessionDuration = typeof preferences?.duration === 'number' ? preferences.duration : 45;
    const targets = exerciseTargetsForSession(
      sessionDuration,
      detailLevel,
      focusKey === 'cardio' || focusKey === 'recovery',
    );
    let chosen: CandidateExercise[] = [];
    if (candidates.length >= 4) {
      const balanced = this.balanceCandidateOrderForPrompt(candidates, focusKey);
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
      reps: Math.min(99, Math.round((guidelines.repsMin + guidelines.repsMax) / 2)),
      weight: undefined as number | undefined,
      notes: undefined as string | undefined,
      orderIndex: i,
    }));

    if (exercises.length === 0) {
      const fallback = this.getHardcodedFallback(focus, difficulty, day, guidelines);
      return fallback;
    }

    this.enforceMuscleGroupBalance(exercises, candidates, focusKey, setsMin, repsMin);
    this.sortExercisesBySlotOrder(exercises, candidates, focusKey);

    const workoutName = `${focus.charAt(0).toUpperCase() + focus.slice(1)} Workout${day ? ` - ${day}` : ''}`;
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
    setRep?: { setsMin: number; setsMax: number; repsMin: number; repsMax: number },
  ): CreateWorkoutDto {
    const guidelines = setRep ?? getSetRepGuidelines(undefined, difficulty);
    const sets = Math.min(10, guidelines.setsMin + 1);
    const reps = Math.round((guidelines.repsMin + guidelines.repsMax) / 2);

    const templates: Record<string, Array<{ name: string; sets: number; reps: number; weight?: number }>> = {
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
