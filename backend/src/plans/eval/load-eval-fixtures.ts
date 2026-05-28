import * as fs from 'fs';
import * as path from 'path';
import type { GenerationEvalScenario } from './eval-types';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function assertScenarioShape(
  raw: unknown,
  filename: string,
): asserts raw is GenerationEvalScenario {
  const r = asRecord(raw);
  if (!r) {
    throw new Error(`Eval fixture ${filename}: expected JSON object`);
  }
  const id = r.id;
  const specs = r.specs;
  const sessions = r.sessionsBeforeRepair;
  const catalog = r.catalog;
  const expect = r.expect;
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error(`Eval fixture ${filename}: missing non-empty "id"`);
  }
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error(
      `Eval fixture ${filename}: "specs" must be a non-empty array`,
    );
  }
  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new Error(
      `Eval fixture ${filename}: "sessionsBeforeRepair" must be a non-empty array`,
    );
  }
  if (sessions.length !== specs.length) {
    throw new Error(
      `Eval fixture ${filename}: sessions/specs length mismatch (${sessions.length} vs ${specs.length})`,
    );
  }
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new Error(
      `Eval fixture ${filename}: "catalog" must be a non-empty array`,
    );
  }
  const expectRec = asRecord(expect);
  const afterRec = asRecord(expectRec?.after);
  if (!expectRec || typeof expectRec.runRepair !== 'boolean' || !afterRec) {
    throw new Error(
      `Eval fixture ${filename}: "expect.runRepair" and "expect.after" are required`,
    );
  }
  if (typeof afterRec.validatorOk !== 'boolean') {
    throw new Error(
      `Eval fixture ${filename}: "expect.after.validatorOk" must be boolean`,
    );
  }
  if (r.enrichPrefs !== undefined) {
    const afterEnrich = asRecord(expectRec.afterEnrich);
    if (!afterEnrich || typeof afterEnrich.validatorOk !== 'boolean') {
      throw new Error(
        `Eval fixture ${filename}: enrichPrefs requires "expect.afterEnrich.validatorOk"`,
      );
    }
  }
  if (r.evalScoring !== undefined) {
    const es = asRecord(r.evalScoring);
    if (!es) {
      throw new Error(
        `Eval fixture ${filename}: "evalScoring" must be an object`,
      );
    }
    const allowed = new Set([
      'skipBalance',
      'skipVolume',
      'skipDiversity',
      'skipMetadata',
      'skipConditioning',
      'skipCoaching',
      'skipWorkoutOrder',
      'skipPrescription',
      'skipFatigueStacking',
    ]);
    for (const [k, v] of Object.entries(es)) {
      if (!allowed.has(k)) {
        throw new Error(
          `Eval fixture ${filename}: unknown evalScoring key "${k}"`,
        );
      }
      if (typeof v !== 'boolean') {
        throw new Error(
          `Eval fixture ${filename}: evalScoring.${k} must be boolean`,
        );
      }
    }
  }
}

/**
 * Load `*.json` from `eval/fixtures/` (next to this file).
 * Each file should parse to a {@link GenerationEvalScenario}.
 */
export function loadEvalFixtures(): GenerationEvalScenario[] {
  const dir = path.join(__dirname, 'fixtures');
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const out: GenerationEvalScenario[] = [];
  for (const name of names.sort()) {
    const full = path.join(dir, name);
    const raw = JSON.parse(fs.readFileSync(full, 'utf8')) as unknown;
    assertScenarioShape(raw, name);
    out.push(raw);
  }
  return out;
}
