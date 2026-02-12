"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const exercise_mappings_1 = require("../src/data/exercise-mappings");
const EXERCISES_FILE = path.join(__dirname, '../data/exercises_5000plus.json');
const rawData = JSON.parse(fs.readFileSync(EXERCISES_FILE, 'utf-8'));
const examples = [
    rawData[0],
    rawData.find(e => e.primaryMuscleGroupId === 'back') || rawData[100],
    rawData.find(e => e.primaryMuscleGroupId === 'legs') || rawData[200],
];
console.log('='.repeat(70));
console.log('EXERCISE DATA TRANSFORMATION EXAMPLES');
console.log('='.repeat(70));
examples.forEach((raw, index) => {
    const transformed = (0, exercise_mappings_1.transformExercise)(raw);
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Example ${index + 1}: ${raw.name}`);
    console.log('─'.repeat(70));
    console.log('\n📥 BEFORE (Raw Data with IDs):');
    console.log(JSON.stringify({
        primaryMuscleGroupId: raw.primaryMuscleGroupId,
        subMuscleIds: raw.subMuscleIds,
        secondaryMuscleGroupIds: raw.secondaryMuscleGroupIds,
        equipmentIds: raw.equipmentIds,
        equipmentAlternativeIds: raw.equipmentAlternativeIds,
        movementPatternIds: raw.movementPatternIds,
    }, null, 2));
    console.log('\n📤 AFTER (Transformed to Display Names):');
    console.log(JSON.stringify({
        primaryMuscleGroup: transformed.primaryMuscleGroup,
        subMuscles: transformed.subMuscles,
        secondaryMuscleGroups: transformed.secondaryMuscleGroups,
        equipment: transformed.equipment,
        movementPatterns: transformed.movementPatterns,
    }, null, 2));
    console.log('\n✅ Ready for SearchScreen filters!');
});
console.log(`\n${'='.repeat(70)}`);
console.log(`Total exercises ready: ${rawData.length}`);
console.log('='.repeat(70));
//# sourceMappingURL=show-transformation-example.js.map