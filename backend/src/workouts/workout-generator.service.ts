import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ExercisesService } from '../exercises/exercises.service';
import Groq from 'groq-sdk';
import { GenerateWorkoutDto } from './dto/generate-workout.dto';
import { CreateWorkoutDto } from './dto/create-workout.dto';

/** Minimal shape for generator candidates (from exercise library). */
interface CandidateExercise {
  id: string;
  name: string;
  primaryMuscleGroup: string;
  equipment: string[];
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
    const candidates = this.exercisesService.getCandidatesForGenerator({
      focus,
      equipment: equipment.length ? equipment : undefined,
      excludeIds: recentIds,
      limit: 70,
    });

    const candidateList: CandidateExercise[] = candidates.map((e) => ({
      id: e.id,
      name: e.name,
      primaryMuscleGroup: e.primaryMuscleGroup,
      equipment: e.equipment ?? [],
    }));

    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (apiKey?.trim() && candidateList.length >= 4) {
      try {
        const workout = await this.generateWithGroq(
          generateWorkoutDto,
          apiKey,
          candidateList,
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

    return this.generateWorkoutByRules(candidateList, day, preferences);
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

  private async generateWithGroq(
    dto: GenerateWorkoutDto,
    apiKey: string,
    candidates: CandidateExercise[],
  ): Promise<CreateWorkoutDto | null> {
    const { day, preferences } = dto;
    const focus = preferences?.focus ?? 'full body';
    const difficulty = preferences?.difficulty ?? 'intermediate';
    const duration = preferences?.duration ?? 45;
    const equipmentStr =
      preferences?.equipment?.length ?
        preferences.equipment.join(', ')
      : 'general gym equipment';

    const candidateJson = JSON.stringify(
      candidates.map((c) => ({
        id: c.id,
        name: c.name,
        muscleGroup: c.primaryMuscleGroup,
      })),
      null,
      0,
    );

    const mixedCardioHint = /\+ *run|\+ *cardio/i.test(focus)
      ? ' Include 4-5 strength exercises from the list, then add one cardio finisher (e.g. run, row, bike) as the last exercise—you may use a name like "Run" or "Rowing" for that last one without an id from the list.'
      : '';

    const systemPrompt = `You are a certified fitness trainer. You must choose exercises ONLY from the provided list by their "id". Respond with exactly one JSON object, no markdown.
- "name": string (workout title)
- "day": string or omit
- "reasoning": string (1-2 short sentences only). Be specific: e.g. push/pull balance, compound movements first, why this day fits the week. Use plain fitness language. No filler (do not say "great workout", "you will love it", or generic praise).
- "exercises": array of objects. Each must have "exerciseId" (string, must be one of the ids from the list), "sets" (number), "reps" (number), and optionally "weight" (number), "notes" (string). Use the exact "id" value from the list for exerciseId.`;

    const userPrompt = `Choose 4-7 exercises from this list only. Use each exercise's "id" as "exerciseId" in your response.
List: ${candidateJson}

Focus: ${focus}. Difficulty: ${difficulty}. Duration: ~${duration} min. Equipment: ${equipmentStr}.${day ? ` Day: ${day}.` : ''}
${mixedCardioHint}

Return valid JSON with exerciseId, sets, reps for each exercise. Write a short "reasoning" that gives a real fitness reason (e.g. "Rows after bench to balance the shoulder; compounds first to save energy for heavy lifts.").`;

    const groq = new Groq({ apiKey });
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 2048,
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    let parsed: {
      name?: string;
      day?: string;
      reasoning?: string;
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
      exercises.push({
        name,
        exerciseId: candidate ? candidate.id : undefined,
        sets: Math.max(1, Math.min(10, Number(ex.sets) || 3)),
        reps: Math.max(1, Math.min(99, Number(ex.reps) || 10)),
        weight: ex.weight != null ? Number(ex.weight) : undefined,
        notes: ex.notes != null ? String(ex.notes) : undefined,
        orderIndex: i,
      });
    }

    const reasoning = parsed.reasoning
      ? String(parsed.reasoning).trim().slice(0, 400)
      : undefined;

    return {
      name: String(parsed.name),
      day: parsed.day ? String(parsed.day) : dto.day,
      reasoning: reasoning || undefined,
      exercises,
    };
  }

  private generateWorkoutByRules(
    candidates: CandidateExercise[],
    day?: string,
    preferences?: any,
  ): CreateWorkoutDto {
    const focus = (preferences?.focus || 'full body').toLowerCase().split(/\+/)[0].trim();
    const difficulty = preferences?.difficulty || 'intermediate';

    let chosen: CandidateExercise[] = [];
    if (candidates.length >= 4) {
      const shuffled = [...candidates].sort(() => Math.random() - 0.5);
      const count = difficulty === 'beginner' ? 4 : difficulty === 'advanced' ? 7 : 5;
      chosen = shuffled.slice(0, Math.min(count, shuffled.length));
    }

    const exercises = chosen.map((c, i) => {
      let sets = 3;
      let reps = 10;
      if (difficulty === 'beginner') {
        sets = 2;
        reps = 10;
      } else if (difficulty === 'advanced') {
        sets = 4;
        reps = 8;
      }
      return {
        name: c.name,
        exerciseId: c.id,
        sets,
        reps,
        weight: undefined as number | undefined,
        notes: undefined as string | undefined,
        orderIndex: i,
      };
    });

    if (exercises.length === 0) {
      const fallback = this.getHardcodedFallback(focus, difficulty, day);
      return fallback;
    }

    const workoutName = `${focus.charAt(0).toUpperCase() + focus.slice(1)} Workout${day ? ` - ${day}` : ''}`;
    const reasoning = `Compound movements first, then isolation.${day ? ` Fits ${day} in your weekly split.` : ''}`;

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
  ): CreateWorkoutDto {
    const templates: Record<string, Array<{ name: string; sets: number; reps: number; weight?: number }>> = {
      'upper body': [
        { name: 'Bench Press', sets: 4, reps: 8, weight: 135 },
        { name: 'Pull-ups', sets: 3, reps: 10 },
        { name: 'Shoulder Press', sets: 3, reps: 10, weight: 95 },
        { name: 'Bicep Curls', sets: 3, reps: 12, weight: 30 },
      ],
      'lower body': [
        { name: 'Squats', sets: 4, reps: 10, weight: 185 },
        { name: 'Deadlifts', sets: 3, reps: 8, weight: 225 },
        { name: 'Leg Press', sets: 3, reps: 12, weight: 270 },
        { name: 'Lunges', sets: 3, reps: 12, weight: 45 },
      ],
      'full body': [
        { name: 'Deadlifts', sets: 4, reps: 8, weight: 225 },
        { name: 'Bench Press', sets: 3, reps: 10, weight: 135 },
        { name: 'Squats', sets: 3, reps: 12, weight: 185 },
        { name: 'Pull-ups', sets: 3, reps: 10 },
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
      reasoning: `Compound movements first.${day ? ` Balanced for ${day}.` : ''}`,
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
