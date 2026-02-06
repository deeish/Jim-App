/**
 * Test Groq workout generation (no server needed).
 * Run from backend: npx ts-node scripts/test-groq-generate.ts
 * Requires GROQ_API_KEY in .env.
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env from backend root (simple parse, no extra deps)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*GROQ_API_KEY\s*=\s*(.*?)\s*$/);
    if (m) {
      const val = m[1].replace(/^["']|["']$/g, '').trim();
      if (val) process.env.GROQ_API_KEY = val;
      break;
    }
  }
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function main() {
  if (!GROQ_API_KEY?.trim()) {
    console.error('❌ GROQ_API_KEY is missing in backend/.env. Add your key from https://console.groq.com/');
    process.exit(1);
  }

  const Groq = (await import('groq-sdk')).default;
  const groq = new Groq({ apiKey: GROQ_API_KEY });

  console.log('🔄 Calling Groq to generate a sample workout...\n');

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content:
          'You are a certified fitness trainer. Respond with exactly one JSON object: { "name": "string", "day": "string", "exercises": [ { "name": "string", "sets": number, "reps": number, "weight?" : number, "notes?": "string" } ] }. No markdown.',
      },
      {
        role: 'user',
        content:
          'Generate a short upper body workout for Monday, 4 exercises, intermediate level, about 45 minutes.',
      },
    ],
    response_format: { type: 'json_object' as const },
    temperature: 0.6,
    max_tokens: 1024,
  });

  const raw = response.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    console.error('❌ No content in response');
    process.exit(1);
  }

  const workout = JSON.parse(raw);
  console.log('✅ Groq response (workout):');
  console.log(JSON.stringify(workout, null, 2));
  console.log('\n✅ GROQ_API_KEY is valid and workout generation works.');
}

main().catch((err) => {
  console.error('❌ Error:', err.message ?? err);
  process.exit(1);
});
