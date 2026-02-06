import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ExercisesService } from '../exercises/exercises.service';
import Groq from 'groq-sdk';
import { GenerateWorkoutDto } from './dto/generate-workout.dto';
import { CreateWorkoutDto } from './dto/create-workout.dto';
import { getSlotsForFocus, normalizeFocusToKey } from '../data/program-templates';
import { getAnchorIdsForFocus } from '../data/anchor-exercises';
import { getSetRepGuidelines } from '../data/set-rep-schemes';

/** Minimal shape for generator candidates (from exercise library). */
interface CandidateExercise {
  id: string;
  name: string;
  primaryMuscleGroup: string;
  equipment: string[];
}

/** Last performance for one exercise (from logs). */
export interface LastPerformance {
  weight?: number;
  reps: number;
  setNumber?: number;
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
    const rawCandidates = this.exercisesService.getCandidatesForGenerator({
      focus,
      equipment: equipment.length ? equipment : undefined,
      excludeIds: recentIds,
      limit: 80,
    });

    const anchorIds = getAnchorIdsForFocus(focus);
    const candidateList = this.buildCandidateListWithAnchorsFirst(
      rawCandidates,
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

  /** Build candidate list: 1–2 anchors randomly at top, then rest of anchors, then shuffled non-anchors for variety. */
  private buildCandidateListWithAnchorsFirst(
    candidates: Array<{ id: string; name: string; primaryMuscleGroup: string; equipment?: string[] }>,
    anchorIds: string[],
  ): CandidateExercise[] {
    const byId = new Map(candidates.map((e) => [e.id, { id: e.id, name: e.name, primaryMuscleGroup: e.primaryMuscleGroup, equipment: e.equipment ?? [] }]));
    const anchorsInCandidates: CandidateExercise[] = [];
    const seen = new Set<string>();
    for (const id of anchorIds) {
      const c = byId.get(id);
      if (c && !seen.has(id)) {
        anchorsInCandidates.push(c);
        seen.add(id);
      }
    }
    const nonAnchors: CandidateExercise[] = candidates
      .filter((c) => !seen.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, primaryMuscleGroup: c.primaryMuscleGroup, equipment: c.equipment ?? [] }));

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

  private async generateWithGroq(
    dto: GenerateWorkoutDto,
    apiKey: string,
    candidates: CandidateExercise[],
    setRep: { setsMin: number; setsMax: number; repsMin: number; repsMax: number; description: string },
    lastPerformance: Map<string, LastPerformance>,
  ): Promise<CreateWorkoutDto | null> {
    const { day, preferences, userId } = dto;
    const focus = preferences?.focus ?? 'full body';
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

    const slots = getSlotsForFocus(focus);
    const focusKey = normalizeFocusToKey(focus);
    const isCardioOrRecovery = focusKey === 'cardio' || focusKey === 'recovery';
    const mixedCardio = /\+ *run|\+ *cardio/i.test(focus);

    const candidateJson = JSON.stringify(
      candidates.map((c) => ({
        id: c.id,
        name: c.name,
        muscleGroup: c.primaryMuscleGroup,
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
      ? ' Include 4-5 strength exercises from the list, then add one cardio finisher (e.g. run, row, bike) as the last exercise—you may use a name like "Run" or "Rowing" for that last one without an id from the list.'
      : '';

    const systemPrompt = `You are a certified fitness trainer. You must choose exercises ONLY from the provided list by their "id". Respond with exactly one JSON object, no markdown.
- "name": string (workout title)
- "day": string or omit
- "reasoning": string (2-4 sentences). Reference the program and day (e.g. "Push day in your 4-day Upper/Lower split: horizontal push first, then vertical push."). Be specific; no filler praise. Do NOT put warm-up or cool-down here; use warmUp and coolDown fields instead.
- "warmUp": string (1-2 sentences: what to do before the workout, e.g. "5 min light cardio, band pull-aparts, dynamic stretch.")
- "coolDown": string (1-2 sentences: what to do after, e.g. "Stretch chest and shoulders, 2 min walk.")
- "exercises": array of objects. Each must have "exerciseId" (string, one of the ids from the list), "sets" (number), "reps" (number), and optionally "weight" (number), "notes" (string). In "notes" put a one-line why/focus for this exercise (e.g. "Main compound – go heavy" or "Chest isolation – squeeze at top"). Use the exact "id" value from the list for exerciseId. Order: main compounds first, then accessories, then optional finisher.`;

    const userPrompt = `Choose 4-7 exercises from this list only. Use each exercise's "id" as "exerciseId" in your response.
List: ${candidateJson}

Focus: ${focus}. Difficulty: ${difficulty}. Duration: ~${duration} min. Equipment: ${equipmentStr}.${day ? ` Day: ${day}.` : ''}
${setRepLine}
${slotInstructions}
${userContextParts.join(' ')}
${programContext}
${warmUpCoolDown}
${lastPerfBlock}
${mixedCardioHint}

Vary exercise selection when possible so the user gets fresh workouts.

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
      max_tokens: 2048,
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    let parsed: {
      name?: string;
      day?: string;
      reasoning?: string;
      warmUp?: string;
      coolDown?: string;
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
    const exercises: CreateWorkoutDto['exercises'] = [];
    for (let i = 0; i < parsed.exercises.length; i++) {
      const ex = parsed.exercises[i];
      const id = ex.exerciseId?.trim();
      const candidate = id ? idToCandidate.get(id) : null;
      const name = candidate ? candidate.name : String(ex.exerciseId ?? 'Exercise');
      const sets = Math.max(1, Math.min(10, Number(ex.sets) || setRep.setsMin));
      const reps = Math.max(1, Math.min(99, Number(ex.reps) || setRep.repsMin));
      exercises.push({
        name,
        exerciseId: candidate ? candidate.id : undefined,
        sets,
        reps,
        weight: ex.weight != null ? Number(ex.weight) : undefined,
        notes: ex.notes != null ? String(ex.notes) : undefined,
        orderIndex: i,
      });
    }

    const reasoning = parsed.reasoning
      ? String(parsed.reasoning).trim().slice(0, 500)
      : undefined;
    const warmUp = parsed.warmUp ? String(parsed.warmUp).trim().slice(0, 300) : undefined;
    const coolDown = parsed.coolDown ? String(parsed.coolDown).trim().slice(0, 300) : undefined;

    return {
      name: String(parsed.name),
      day: parsed.day ? String(parsed.day) : dto.day,
      reasoning: reasoning || undefined,
      warmUp: warmUp || undefined,
      coolDown: coolDown || undefined,
      exercises,
    };
  }

  private generateWorkoutByRules(
    candidates: CandidateExercise[],
    day?: string,
    preferences?: any,
    setRep?: { setsMin: number; setsMax: number; repsMin: number; repsMax: number },
  ): CreateWorkoutDto {
    const focus = (preferences?.focus || 'full body').toLowerCase().split(/\+/)[0].trim();
    const difficulty = preferences?.difficulty || 'intermediate';
    const guidelines = setRep ?? getSetRepGuidelines(preferences?.goal, difficulty);

    let chosen: CandidateExercise[] = [];
    if (candidates.length >= 4) {
      const count = difficulty === 'beginner' ? 4 : difficulty === 'advanced' ? 7 : 5;
      const shuffled = this.shuffleArray([...candidates]);
      chosen = shuffled.slice(0, Math.min(count, shuffled.length));
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
