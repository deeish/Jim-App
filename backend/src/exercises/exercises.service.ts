import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  transformExercise,
  RawExercise,
  TransformedExercise,
} from '../data/exercise-mappings';
import { getCommonExerciseRank } from '../data/common-exercise-ids';
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
  private exercises: TransformedExercise[] = [];
  /** exerciseId -> YouTube video ID (from data/exercise-videos.json) */
  private videoMap = new Map<string, string>();

  async onModuleInit() {
    await this.loadExercises();
    this.loadVideoMap();
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
        console.log(`✅ Loaded ${this.videoMap.size} exercise video mappings`);
      }
    } catch {
      // File missing or invalid: no videos
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

      console.log(
        `✅ Loaded and transformed ${this.exercises.length} exercises`,
      );
    } catch (error) {
      console.error('❌ Error loading exercises:', error);
      this.exercises = [];
    }
  }

  findAll(): TransformedExercise[] {
    return this.exercises.map((e) => this.withVideo(e));
  }

  search(searchDto: SearchExercisesDto): TransformedExercise[] {
    let results = [...this.exercises];

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

    // Sort: common list first, then Compound, then equipment preference, then name
    results.sort((a, b) => {
      const rankA = getCommonExerciseRank(a.id);
      const rankB = getCommonExerciseRank(b.id);
      if (rankA !== rankB) return rankA - rankB;

      const compoundA = (a.type ?? '').toLowerCase() === 'compound' ? 0 : 1;
      const compoundB = (b.type ?? '').toLowerCase() === 'compound' ? 0 : 1;
      if (compoundA !== compoundB) return compoundA - compoundB;

      const equipA = Math.min(
        ...(a.equipment?.length
          ? a.equipment.map((eq) => EQUIPMENT_ORDER[eq] ?? DEFAULT_EQUIPMENT_ORDER)
          : [DEFAULT_EQUIPMENT_ORDER]),
      );
      const equipB = Math.min(
        ...(b.equipment?.length
          ? b.equipment.map((eq) => EQUIPMENT_ORDER[eq] ?? DEFAULT_EQUIPMENT_ORDER)
          : [DEFAULT_EQUIPMENT_ORDER]),
      );
      if (equipA !== equipB) return equipA - equipB;

      return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
    });

    return results.map((e) => this.withVideo(e));
  }

  findOne(id: string): TransformedExercise | undefined {
    const ex = this.exercises.find((e) => e.id === id);
    return ex ? this.withVideo(ex) : undefined;
  }

  getStats() {
    const stats = {
      total: this.exercises.length,
      byMuscleGroup: {} as Record<string, number>,
      byEquipment: {} as Record<string, number>,
      byMovementPattern: {} as Record<string, number>,
    };

    this.exercises.forEach((exercise) => {
      // Count by muscle group
      stats.byMuscleGroup[exercise.primaryMuscleGroup] =
        (stats.byMuscleGroup[exercise.primaryMuscleGroup] || 0) + 1;

      // Count by equipment
      exercise.equipment.forEach((eq) => {
        stats.byEquipment[eq] = (stats.byEquipment[eq] || 0) + 1;
      });

      // Count by movement pattern
      exercise.movementPatterns.forEach((pattern) => {
        stats.byMovementPattern[pattern] =
          (stats.byMovementPattern[pattern] || 0) + 1;
      });
    });

    return stats;
  }
}
