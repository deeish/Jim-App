/**
 * Test script to validate exercise data transformation
 * Run with: npx ts-node scripts/test-exercise-mapping.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { transformExercise, RawExercise, TransformedExercise } from '../src/data/exercise-mappings';

const EXERCISES_FILE = path.join(__dirname, '../data/exercises_5000plus.json');

interface TestResult {
  total: number;
  transformed: number;
  errors: Array<{
    exerciseId: string;
    exerciseName: string;
    issues: string[];
  }>;
  unmappedItems: {
    primaryMuscleGroups: Set<string>;
    subMuscles: Set<string>;
    equipment: Set<string>;
    movementPatterns: Set<string>;
  };
  sampleTransformed: TransformedExercise[];
}

function testMapping(): TestResult {
  console.log('Loading exercises from:', EXERCISES_FILE);
  const rawData = JSON.parse(fs.readFileSync(EXERCISES_FILE, 'utf-8')) as RawExercise[];
  
  console.log(`\nTotal exercises: ${rawData.length}`);
  console.log('Testing transformation...\n');
  
  const result: TestResult = {
    total: rawData.length,
    transformed: 0,
    errors: [],
    unmappedItems: {
      primaryMuscleGroups: new Set(),
      subMuscles: new Set(),
      equipment: new Set(),
      movementPatterns: new Set(),
    },
    sampleTransformed: [],
  };
  
  // Test first 10 exercises
  const testExercises = rawData.slice(0, 10);
  
  for (const raw of rawData) {
    try {
      const transformed = transformExercise(raw);
      result.transformed++;
      
      // Track unmapped items
      if (!transformed.primaryMuscleGroup || transformed.primaryMuscleGroup === raw.primaryMuscleGroupId) {
        result.unmappedItems.primaryMuscleGroups.add(raw.primaryMuscleGroupId);
      }
      
      raw.subMuscleIds?.forEach(id => {
        const mapped = transformed.subMuscles.find(s => s !== undefined);
        if (!mapped) {
          result.unmappedItems.subMuscles.add(id);
        }
      });
      
      [...(raw.equipmentIds || []), ...(raw.equipmentAlternativeIds || [])].forEach(id => {
        if (!transformed.equipment.includes(id)) {
          result.unmappedItems.equipment.add(id);
        }
      });
      
      raw.movementPatternIds?.forEach(id => {
        if (!transformed.movementPatterns.length && raw.movementPatternIds?.length) {
          result.unmappedItems.movementPatterns.add(id);
        }
      });
      
      // Collect sample transformations
      if (result.sampleTransformed.length < 5) {
        result.sampleTransformed.push(transformed);
      }
      
      // Check for issues
      const issues: string[] = [];
      if (!transformed.primaryMuscleGroup) {
        issues.push(`Missing primary muscle group mapping for: ${raw.primaryMuscleGroupId}`);
      }
      if (transformed.subMuscles.length === 0 && raw.subMuscleIds && raw.subMuscleIds.length > 0) {
        issues.push(`No sub-muscles mapped from: ${raw.subMuscleIds.join(', ')}`);
      }
      if (transformed.equipment.length === 0 && (raw.equipmentIds?.length || raw.equipmentAlternativeIds?.length)) {
        issues.push(`No equipment mapped`);
      }
      
      if (issues.length > 0) {
        result.errors.push({
          exerciseId: raw.id,
          exerciseName: raw.name,
          issues,
        });
      }
    } catch (error) {
      result.errors.push({
        exerciseId: raw.id,
        exerciseName: raw.name,
        issues: [`Transformation error: ${error instanceof Error ? error.message : String(error)}`],
      });
    }
  }
  
  return result;
}

function printResults(result: TestResult) {
  console.log('='.repeat(60));
  console.log('TRANSFORMATION TEST RESULTS');
  console.log('='.repeat(60));
  
  console.log(`\n✅ Successfully transformed: ${result.transformed}/${result.total}`);
  console.log(`❌ Errors: ${result.errors.length}`);
  
  if (result.errors.length > 0) {
    console.log('\n⚠️  Exercises with issues (first 10):');
    result.errors.slice(0, 10).forEach(err => {
      console.log(`\n  Exercise: ${err.exerciseName} (${err.exerciseId})`);
      err.issues.forEach(issue => console.log(`    - ${issue}`));
    });
  }
  
  if (result.unmappedItems.primaryMuscleGroups.size > 0) {
    console.log('\n⚠️  Unmapped Primary Muscle Groups:');
    console.log(Array.from(result.unmappedItems.primaryMuscleGroups).join(', '));
  }
  
  if (result.unmappedItems.subMuscles.size > 0) {
    console.log('\n⚠️  Unmapped Sub-Muscles:');
    console.log(Array.from(result.unmappedItems.subMuscles).join(', '));
  }
  
  if (result.unmappedItems.equipment.size > 0) {
    console.log('\n⚠️  Unmapped Equipment:');
    console.log(Array.from(result.unmappedItems.equipment).join(', '));
  }
  
  if (result.unmappedItems.movementPatterns.size > 0) {
    console.log('\n⚠️  Unmapped Movement Patterns:');
    console.log(Array.from(result.unmappedItems.movementPatterns).join(', '));
  }
  
  console.log('\n📋 Sample Transformed Exercises (first 3):');
  result.sampleTransformed.slice(0, 3).forEach((exercise, index) => {
    console.log(`\n${index + 1}. ${exercise.name}`);
    console.log(`   Primary: ${exercise.primaryMuscleGroup}`);
    console.log(`   Sub-Muscles: ${exercise.subMuscles.join(', ') || 'None'}`);
    console.log(`   Equipment: ${exercise.equipment.join(', ') || 'None'}`);
    console.log(`   Movement Patterns: ${exercise.movementPatterns.join(', ') || 'None'}`);
  });
  
  console.log('\n' + '='.repeat(60));
}

// Run the test
try {
  const result = testMapping();
  printResults(result);
  
  // Exit with error code if there are issues
  if (result.errors.length > 0 || 
      result.unmappedItems.primaryMuscleGroups.size > 0 ||
      result.unmappedItems.subMuscles.size > 0) {
    process.exit(1);
  }
} catch (error) {
  console.error('Error running test:', error);
  process.exit(1);
}
