"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
const API_BASE = 'http://localhost:3000/api';
async function testAPI() {
    console.log('🧪 Testing Exercises API\n');
    console.log('='.repeat(70));
    try {
        console.log('\n1️⃣  Testing GET /exercises/stats');
        const statsResponse = await axios_1.default.get(`${API_BASE}/exercises/stats`);
        console.log('✅ Stats Response:');
        console.log(JSON.stringify(statsResponse.data, null, 2));
        console.log('\n2️⃣  Testing POST /exercises/search (Chest exercises)');
        const chestSearch = await axios_1.default.post(`${API_BASE}/exercises/search`, {
            muscleGroups: ['Chest'],
        });
        console.log(`✅ Found ${chestSearch.data.count} chest exercises`);
        if (chestSearch.data.exercises.length > 0) {
            console.log('Sample exercise:');
            const sample = chestSearch.data.exercises[0];
            console.log(JSON.stringify({
                name: sample.name,
                primaryMuscleGroup: sample.primaryMuscleGroup,
                subMuscles: sample.subMuscles,
                equipment: sample.equipment,
                movementPatterns: sample.movementPatterns,
            }, null, 2));
        }
        console.log('\n3️⃣  Testing POST /exercises/search (Bodyweight exercises)');
        const bodyweightSearch = await axios_1.default.post(`${API_BASE}/exercises/search`, {
            equipment: ['Bodyweight'],
        });
        console.log(`✅ Found ${bodyweightSearch.data.count} bodyweight exercises`);
        console.log('\n4️⃣  Testing POST /exercises/search (Lats exercises)');
        const latsSearch = await axios_1.default.post(`${API_BASE}/exercises/search`, {
            subMuscles: ['Lats'],
        });
        console.log(`✅ Found ${latsSearch.data.count} lats exercises`);
        console.log('\n5️⃣  Testing POST /exercises/search (Push exercises)');
        const pushSearch = await axios_1.default.post(`${API_BASE}/exercises/search`, {
            movementPatterns: ['Push'],
        });
        console.log(`✅ Found ${pushSearch.data.count} push exercises`);
        console.log('\n6️⃣  Testing POST /exercises/search (Chest + Barbell + Push)');
        const combinedSearch = await axios_1.default.post(`${API_BASE}/exercises/search`, {
            muscleGroups: ['Chest'],
            equipment: ['Barbell'],
            movementPatterns: ['Push'],
        });
        console.log(`✅ Found ${combinedSearch.data.count} matching exercises`);
        if (combinedSearch.data.exercises.length > 0) {
            console.log('Sample exercises:');
            combinedSearch.data.exercises.slice(0, 3).forEach((ex, i) => {
                console.log(`  ${i + 1}. ${ex.name} - ${ex.primaryMuscleGroup}, ${ex.equipment.join(', ')}`);
            });
        }
        console.log('\n7️⃣  Testing POST /exercises/search (Text: "bench")');
        const textSearch = await axios_1.default.post(`${API_BASE}/exercises/search`, {
            searchQuery: 'bench',
        });
        console.log(`✅ Found ${textSearch.data.count} exercises matching "bench"`);
        if (textSearch.data.exercises.length > 0) {
            console.log('Sample exercises:');
            textSearch.data.exercises.slice(0, 5).forEach((ex, i) => {
                console.log(`  ${i + 1}. ${ex.name}`);
            });
        }
        if (chestSearch.data.exercises.length > 0) {
            const exerciseId = chestSearch.data.exercises[0].id;
            console.log(`\n8️⃣  Testing GET /exercises/${exerciseId}`);
            const singleExercise = await axios_1.default.get(`${API_BASE}/exercises/${exerciseId}`);
            console.log('✅ Exercise details:');
            console.log(JSON.stringify({
                name: singleExercise.data.name,
                primaryMuscleGroup: singleExercise.data.primaryMuscleGroup,
                subMuscles: singleExercise.data.subMuscles,
                equipment: singleExercise.data.equipment,
                movementPatterns: singleExercise.data.movementPatterns,
            }, null, 2));
        }
        console.log('\n' + '='.repeat(70));
        console.log('✅ All tests completed successfully!');
        console.log('='.repeat(70));
    }
    catch (error) {
        console.error('\n❌ Error testing API:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
        else if (error.request) {
            console.error('No response received. Is the server running?');
            console.error('Make sure to run: npm run start:dev');
        }
        else {
            console.error('Error:', error.message);
        }
        process.exit(1);
    }
}
setTimeout(() => {
    testAPI();
}, 3000);
//# sourceMappingURL=test-api.js.map