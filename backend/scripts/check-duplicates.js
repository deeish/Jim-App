"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const EXERCISES_FILE = path.join(__dirname, '../data/exercises_5000plus.json');
const rawData = JSON.parse(fs.readFileSync(EXERCISES_FILE, 'utf-8'));
console.log('🔍 Checking for duplicate exercise names...\n');
const nameMap = new Map();
rawData.forEach(exercise => {
    const normalizedName = exercise.name.trim().toLowerCase();
    if (!nameMap.has(normalizedName)) {
        nameMap.set(normalizedName, []);
    }
    nameMap.get(normalizedName).push(exercise);
});
const duplicates = Array.from(nameMap.entries())
    .filter(([name, exercises]) => exercises.length > 1)
    .sort((a, b) => b[1].length - a[1].length);
console.log(`Total exercises: ${rawData.length}`);
console.log(`Unique exercise names: ${nameMap.size}`);
console.log(`Exercises with duplicate names: ${duplicates.length}\n`);
if (duplicates.length > 0) {
    console.log('📋 Top 20 exercises with duplicate names:\n');
    duplicates.slice(0, 20).forEach(([name, exercises]) => {
        console.log(`"${exercises[0].name}"`);
        console.log(`  - Appears ${exercises.length} times`);
        console.log(`  - IDs: ${exercises.map(e => e.id).join(', ')}`);
        console.log('');
    });
    const totalDuplicates = duplicates.reduce((sum, [, exercises]) => sum + exercises.length - 1, 0);
    console.log(`\n📊 Summary:`);
    console.log(`  - Total duplicate entries: ${totalDuplicates}`);
    console.log(`  - If deduplicated, would have: ${rawData.length - totalDuplicates} unique exercises`);
}
else {
    console.log('✅ No duplicate exercise names found!');
}
//# sourceMappingURL=check-duplicates.js.map