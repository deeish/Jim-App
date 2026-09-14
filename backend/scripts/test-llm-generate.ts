/**
 * Live probe of the configured LLM (no server, no DB): checks the model id
 * exists, then asks for one tiny JSON workout through the same client the
 * generator uses. Run from backend/:
 *   npx ts-node --transpile-only scripts/test-llm-generate.ts [--provider=gemini|groq] [--model=<id>]
 * Reads backend/.env for the keys.
 */
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) {
      const val = m[2]!.replace(/^["']|["']$/g, '');
      if (val && process.env[m[1]!] === undefined) process.env[m[1]!] = val;
    }
  }
}
for (const arg of process.argv.slice(2)) {
  const flag = arg.match(/^--(provider|model)=(.+)$/);
  if (flag) {
    process.env[flag[1] === 'provider' ? 'LLM_PROVIDER' : 'LLM_MODEL'] =
      flag[2];
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LlmClient } = require('../src/llm/llm-client');
  const llm = LlmClient.fromEnv();
  console.log(`llm=${llm.describe} configured=${llm.isConfigured}`);
  if (!llm.isConfigured) {
    console.error('no API key for the selected provider in backend/.env');
    process.exit(1);
  }

  const check = await llm.checkModel();
  console.log('checkModel:', JSON.stringify(check));
  if (!check.ok) process.exit(1);

  const t0 = Date.now();
  const res = await llm.completeJson({
    label: 'probe',
    systemPrompt:
      'You are a strength coach. Respond with exactly one JSON object and no markdown.',
    userPrompt:
      'A short upper body workout for Monday, 4 exercises, intermediate, about 45 minutes.',
    temperature: 0.6,
    maxOutputTokens: 700,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        exercises: {
          type: 'array',
          minItems: 4,
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              sets: { type: 'integer' },
              reps: { type: 'integer' },
            },
            required: ['name', 'sets', 'reps'],
            additionalProperties: false,
          },
        },
      },
      required: ['name', 'exercises'],
      additionalProperties: false,
    },
  });
  console.log(`completed in ${Date.now() - t0} ms`);
  console.log('usage:', JSON.stringify(res.usage));
  console.log('text:', res.text);
  JSON.parse(res.text ?? '');
  console.log('valid JSON: yes');
}

main().catch((err) => {
  console.error('probe failed:', err?.status ?? '', err?.message ?? err);
  process.exit(1);
});
