import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { transformExercise, RawExercise, TransformedExercise } from '../data/exercise-mappings';
import { SearchExercisesDto } from './dto/search-exercises.dto';

@Injectable()
export class ExercisesService implements OnModuleInit {
  private exercises: TransformedExercise[] = [];

  async onModuleInit() {
    await this.loadExercises();
  }

  private async loadExercises() {
    const exercisesFile = path.join(process.cwd(), 'data', 'exercises_5000plus.json');
    
    try {
      const rawData = JSON.parse(
        fs.readFileSync(exercisesFile, 'utf-8')
      ) as RawExercise[];

      // Transform all exercises from ID format to display names
      this.exercises = rawData.map(raw => transformExercise(raw));
      
      console.log(`✅ Loaded and transformed ${this.exercises.length} exercises`);
    } catch (error) {
      console.error('❌ Error loading exercises:', error);
      this.exercises = [];
    }
  }

  findAll(): TransformedExercise[] {
    return this.exercises;
  }

  search(searchDto: SearchExercisesDto): TransformedExercise[] {
    let results = [...this.exercises];

    // Text search
    if (searchDto.searchQuery?.trim()) {
      const query = searchDto.searchQuery.toLowerCase().trim();
      results = results.filter(exercise => {
        const searchableText = [
          exercise.name,
          ...(exercise.aliases || []),
          exercise.description || '',
          exercise.primaryMuscleGroup,
          ...exercise.subMuscles,
          ...exercise.secondaryMuscleGroups,
        ].join(' ').toLowerCase();
        
        return searchableText.includes(query);
      });
    }

    // Filter by primary muscle groups
    if (searchDto.muscleGroups && searchDto.muscleGroups.length > 0) {
      results = results.filter(exercise =>
        searchDto.muscleGroups!.includes(exercise.primaryMuscleGroup)
      );
    }

    // Filter by sub-muscles
    if (searchDto.subMuscles && searchDto.subMuscles.length > 0) {
      results = results.filter(exercise =>
        searchDto.subMuscles!.some(subMuscle =>
          exercise.subMuscles.includes(subMuscle)
        )
      );
    }

    // Filter by equipment
    if (searchDto.equipment && searchDto.equipment.length > 0) {
      results = results.filter(exercise =>
        searchDto.equipment!.some(eq =>
          exercise.equipment.includes(eq)
        )
      );
    }

    // Filter by movement patterns
    if (searchDto.movementPatterns && searchDto.movementPatterns.length > 0) {
      results = results.filter(exercise =>
        searchDto.movementPatterns!.some(pattern =>
          exercise.movementPatterns.includes(pattern)
        )
      );
    }

    return results;
  }

  findOne(id: string): TransformedExercise | undefined {
    return this.exercises.find(ex => ex.id === id);
  }

  getStats() {
    const stats = {
      total: this.exercises.length,
      byMuscleGroup: {} as Record<string, number>,
      byEquipment: {} as Record<string, number>,
      byMovementPattern: {} as Record<string, number>,
    };

    this.exercises.forEach(exercise => {
      // Count by muscle group
      stats.byMuscleGroup[exercise.primaryMuscleGroup] =
        (stats.byMuscleGroup[exercise.primaryMuscleGroup] || 0) + 1;

      // Count by equipment
      exercise.equipment.forEach(eq => {
        stats.byEquipment[eq] = (stats.byEquipment[eq] || 0) + 1;
      });

      // Count by movement pattern
      exercise.movementPatterns.forEach(pattern => {
        stats.byMovementPattern[pattern] =
          (stats.byMovementPattern[pattern] || 0) + 1;
      });
    });

    return stats;
  }
}
