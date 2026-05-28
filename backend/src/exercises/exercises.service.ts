import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  transformExercise,
  RawExercise,
  TransformedExercise,
} from '../data/exercise-mappings';
import { getCommonExerciseRank } from '../data/common-exercise-ids';
import { cardioLibrarySortKey } from '../data/cardio-display-order';
import { isExcludedFromExerciseCatalog } from '../data/cardio-catalog-exclusions';
import { SearchExercisesDto } from './dto/search-exercises.dto';

/** Lower = show first. Used to prefer Barbell/Dumbbell/Bodyweight/Cable/Machine. */
const EQUIPMENT_ORDER: Record<string, number> = {
  Barbell: 0,
  Dumbbell: 1,
  Bodyweight: 2,
  Cable: 3,
  Machine: 4,
  'Smith Machine': 5,
  Kettlebell: 6,
  'Pull-up Bar': 7,
  'Resistance Band': 8,
  TRX: 9,
  'Medicine Ball': 10,
  'Battle Rope': 11,
};
const DEFAULT_EQUIPMENT_ORDER = 12;

@Injectable()
export class ExercisesService implements OnModuleInit {
  private readonly logger = new Logger(ExercisesService.name);
  private exercises: TransformedExercise[] = [];
  private catalogLoadFailed = false;
  /** exerciseId -> YouTube video ID (from data/exercise-videos.json) */
  private videoMap = new Map<string, string>();
  /** Built once at startup; avoids remapping thousands of rows on every list request. */
  private memoFindAll: TransformedExercise[] = [];
  private memoStats: ReturnType<ExercisesService['computeStats']> | null = null;

  async onModuleInit() {
    await this.loadExercises();
    this.loadVideoMap();
    this.memoFindAll = this.exercises
      .filter((e) => !isExcludedFromExerciseCatalog(e.id))
      .map((e) => this.withVideo(e));
    this.memoStats = this.computeStats();
  }

  private loadVideoMap() {
    const videosFile = path.join(process.cwd(), 'data', 'exercise-videos.json');
    try {
      const raw = fs.readFileSync(videosFile, 'utf-8');
      const data = JSON.parse(raw) as Record<string, string>;
      this.videoMap = new Map(
        Object.entries(data).filter(
          ([, id]) => typeof id === 'string' && id.trim().length > 0,
        ),
      );
      if (this.videoMap.size > 0) {
        this.logger.log(`Loaded ${this.videoMap.size} exercise video mappings`);
      }
    } catch (e) {
      this.logger.warn(
        `exercise-videos.json missing or invalid — no video links: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private withVideo(exercise: TransformedExercise): TransformedExercise {
    const youtubeId = this.videoMap.get(exercise.id);
    return youtubeId ? { ...exercise, youtubeId } : exercise;
  }

  private async loadExercises() {
    const exercisesFile = path.join(
      process.cwd(),
      'data',
      'exercises_5000plus.json',
    );

    try {
      const rawData = JSON.parse(
        fs.readFileSync(exercisesFile, 'utf-8'),
      ) as RawExercise[];

      // Transform all exercises from ID format to display names
      this.exercises = rawData.map((raw) => transformExercise(raw));

      this.logger.log(
        `Loaded and transformed ${this.exercises.length} exercises`,
      );
    } catch (error) {
      this.logger.error(
        'FATAL: Error loading exercise catalog — all catalog operations will fail',
        error instanceof Error ? error.stack : String(error),
      );
      this.exercises = [];
      this.catalogLoadFailed = true;
    }
  }

  findAll(): TransformedExercise[] {
    return this.memoFindAll;
  }

  search(searchDto: SearchExercisesDto): TransformedExercise[] {
    let results = this.exercises.filter(
      (e) => !isExcludedFromExerciseCatalog(e.id),
    );

    // Text search
    if (searchDto.searchQuery?.trim()) {
      const query = searchDto.searchQuery.toLowerCase().trim();
      results = results.filter((exercise) => {
        const searchableText = [
          exercise.name,
          ...(exercise.aliases || []),
          exercise.description || '',
          exercise.primaryMuscleGroup,
          ...exercise.subMuscles,
          ...exercise.secondaryMuscleGroups,
        ]
          .join(' ')
          .toLowerCase();

        return searchableText.includes(query);
      });
    }

    // Filter by primary muscle groups
    if (searchDto.muscleGroups && searchDto.muscleGroups.length > 0) {
      results = results.filter((exercise) =>
        searchDto.muscleGroups!.includes(exercise.primaryMuscleGroup),
      );
    }

    // Filter by sub-muscles
    if (searchDto.subMuscles && searchDto.subMuscles.length > 0) {
      results = results.filter((exercise) =>
        searchDto.subMuscles!.some((subMuscle) =>
          exercise.subMuscles.includes(subMuscle),
        ),
      );
    }

    // Filter by equipment
    if (searchDto.equipment && searchDto.equipment.length > 0) {
      results = results.filter((exercise) =>
        searchDto.equipment!.some((eq) => exercise.equipment.includes(eq)),
      );
    }

    // Filter by movement patterns
    if (searchDto.movementPatterns && searchDto.movementPatterns.length > 0) {
      results = results.filter((exercise) =>
        searchDto.movementPatterns!.some((pattern) =>
          exercise.movementPatterns.includes(pattern),
        ),
      );
    }

    const allCardioResults =
      results.length > 0 &&
      results.every((e) => e.primaryMuscleGroup === 'Cardio');

    // Sort: optional “familiar gym” order for pure Cardio filter; else common-first, etc.
    results.sort((a, b) => {
      if (allCardioResults) {
        const cA = cardioLibrarySortKey(a.id);
        const cB = cardioLibrarySortKey(b.id);
        if (cA !== cB) return cA - cB;
      }

      const rankA = getCommonExerciseRank(a.id);
      const rankB = getCommonExerciseRank(b.id);
      if (rankA !== rankB) return rankA - rankB;

      const compoundA = (a.type ?? '').toLowerCase() === 'compound' ? 0 : 1;
      const compoundB = (b.type ?? '').toLowerCase() === 'compound' ? 0 : 1;
      if (compoundA !== compoundB) return compoundA - compoundB;

      const equipA = Math.min(
        ...(a.equipment?.length
          ? a.equipment.map(
              (eq) => EQUIPMENT_ORDER[eq] ?? DEFAULT_EQUIPMENT_ORDER,
            )
          : [DEFAULT_EQUIPMENT_ORDER]),
      );
      const equipB = Math.min(
        ...(b.equipment?.length
          ? b.equipment.map(
              (eq) => EQUIPMENT_ORDER[eq] ?? DEFAULT_EQUIPMENT_ORDER,
            )
          : [DEFAULT_EQUIPMENT_ORDER]),
      );
      if (equipA !== equipB) return equipA - equipB;

      return (a.name ?? '').localeCompare(b.name ?? '', undefined, {
        sensitivity: 'base',
      });
    });

    return results.map((e) => this.withVideo(e));
  }

  findOne(id: string): TransformedExercise | undefined {
    if (this.catalogLoadFailed) {
      throw new InternalServerErrorException(
        'Exercise catalog failed to load at startup',
      );
    }
    const ex = this.exercises.find((e) => e.id === id);
    return ex ? this.withVideo(ex) : undefined;
  }

  /** Return exercises for the given library ids (for saved-exercises list). */
  findByIds(ids: string[]): TransformedExercise[] {
    const set = new Set(ids);
    return this.exercises
      .filter((e) => set.has(e.id))
      .map((e) => this.withVideo(e))
      .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  }

  /**
   * Returns a list of exercises suitable for workout generation: filtered by focus and equipment,
   * optionally excluding recently used IDs for variety. Sorted by common-first, then compound.
   */
  /**
   * Full catalog search order (catalog exclusions only), minus `excludeIds`, capped.
   * Used by plan chunk repair when focus+equipment candidate pools are empty.
   */
  candidatesForChunkRepairScavenge(
    excludeIds: string[],
    limit = 220,
  ): TransformedExercise[] {
    const ex = new Set(
      excludeIds.map((id) => String(id ?? '').trim()).filter(Boolean),
    );
    const all = this.search({});
    const out: TransformedExercise[] = [];
    for (const e of all) {
      if (ex.has(e.id)) continue;
      out.push(e);
      if (out.length >= limit) break;
    }
    return out;
  }

  getCandidatesForGenerator(options: {
    focus: string;
    equipment?: string[];
    excludeIds?: string[];
    limit?: number;
  }): TransformedExercise[] {
    const { focus, equipment = [], excludeIds = [], limit = 70 } = options;
    const focusNorm = focus
      .toLowerCase()
      .split(/\+|&|,/)[0]
      .trim();
    const muscleGroups = this.focusToMuscleGroups(focusNorm);
    let results = this.search({
      muscleGroups: muscleGroups.length ? muscleGroups : undefined,
      equipment: equipment.length ? equipment : undefined,
    });
    if (excludeIds.length) {
      const excludeSet = new Set(excludeIds);
      results = results.filter((e) => !excludeSet.has(e.id));
    }
    return this.dedupeCandidateNames(results).slice(0, limit);
  }

  /**
   * Generator pool should not include duplicate exercise names with conflicting IDs/muscle labels.
   * Keep one canonical row per exact name (case-insensitive), preferring richer/common records.
   */
  private dedupeCandidateNames(
    results: TransformedExercise[],
  ): TransformedExercise[] {
    const byName = new Map<string, TransformedExercise>();
    const rank = (e: TransformedExercise): number => {
      let score = 0;
      // Common ids are preferred (lower rank means more common).
      const commonRank = getCommonExerciseRank(e.id);
      if (Number.isFinite(commonRank)) {
        score += Math.max(0, 10_000 - commonRank);
      }
      // Prefer richer metadata and compounds when names collide.
      score += (e.subMuscles?.length ?? 0) * 50;
      score += (e.movementPatterns?.length ?? 0) * 35;
      score += (e.secondaryMuscleGroups?.length ?? 0) * 20;
      score += (e.type ?? '').toLowerCase() === 'compound' ? 120 : 0;
      return score;
    };

    for (const ex of results) {
      const key = (ex.name ?? '').trim().toLowerCase();
      if (!key) continue;
      const curr = byName.get(key);
      if (!curr) {
        byName.set(key, ex);
        continue;
      }
      if (rank(ex) > rank(curr)) {
        byName.set(key, ex);
      }
    }
    return Array.from(byName.values());
  }

  private focusToMuscleGroups(focus: string): string[] {
    const map: Record<string, string[]> = {
      chest: ['Chest'],
      back: ['Back'],
      shoulders: ['Shoulders'],
      arms: ['Arms'],
      push: ['Chest', 'Shoulders', 'Arms'],
      pull: ['Back', 'Arms'],
      legs: ['Legs', 'Core'],
      upper: ['Chest', 'Back', 'Shoulders', 'Arms'],
      lower: ['Legs', 'Core'],
      'upper body': ['Chest', 'Back', 'Shoulders', 'Arms'],
      'lower body': ['Legs', 'Core'],
      'full body': ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'],
      cardio: ['Cardio'],
    };
    const f = focus.toLowerCase();
    const keyMatches = (k: string) =>
      k.includes(' ')
        ? f.includes(k)
        : new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(
            f,
          );

    // Titles like "Chest and Back" (no upper/lower) → both muscle groups
    if (
      /\bchest\b/.test(f) &&
      /\bback\b/.test(f) &&
      !/\bupper\b/.test(f) &&
      !/\blower\b/.test(f)
    ) {
      return ['Chest', 'Back'];
    }
    /** Broader split keywords before isolated muscles so "Upper Day - Chest and Back" matches upper, not chest. */
    const orderedKeys = [
      'upper body',
      'lower body',
      'full body',
      'push',
      'pull',
      'legs',
      'upper',
      'lower',
      'shoulders',
      'arms',
      'chest',
      'back',
      'cardio',
    ];
    const key = orderedKeys.find((k) => keyMatches(k));
    return key
      ? map[key]
      : ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'];
  }

  getStats() {
    return this.memoStats ?? this.computeStats();
  }

  private computeStats() {
    const stats = {
      total: this.exercises.length,
      byMuscleGroup: {} as Record<string, number>,
      byEquipment: {} as Record<string, number>,
      byMovementPattern: {} as Record<string, number>,
    };

    this.exercises.forEach((exercise) => {
      stats.byMuscleGroup[exercise.primaryMuscleGroup] =
        (stats.byMuscleGroup[exercise.primaryMuscleGroup] || 0) + 1;

      exercise.equipment.forEach((eq) => {
        stats.byEquipment[eq] = (stats.byEquipment[eq] || 0) + 1;
      });

      exercise.movementPatterns.forEach((pattern) => {
        stats.byMovementPattern[pattern] =
          (stats.byMovementPattern[pattern] || 0) + 1;
      });
    });

    return stats;
  }
}
