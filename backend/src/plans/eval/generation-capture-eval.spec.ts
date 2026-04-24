import * as fs from 'fs';
import * as path from 'path';
import {
  scoreGenerationCapture,
  scoreGenerationCaptureFull,
  inferMovementPatternsForCaptureExercise,
  summarizeCapturePipeline,
  EVAL_SCORE_MAX_TOTAL,
} from './generation-capture-eval';

const capturesDir = path.join(__dirname, 'captures');

describe('generation capture eval', () => {
  const hybridWeekPath = path.join(capturesDir, 'generation-capture-hybrid-week-sample.json');
  const goodTwoDayPath = path.join(capturesDir, 'capture-synthetic-hybrid-two-day-good.json');
  const duplicateChunkPath = path.join(capturesDir, 'capture-synthetic-duplicate-across-chunk.json');

  it('scores the committed hybrid-week capture (real Groq output shape)', () => {
    const raw = JSON.parse(fs.readFileSync(hybridWeekPath, 'utf8')) as unknown;
    const { score, validation } = scoreGenerationCapture(raw);
    expect(validation.ok).toBe(true);
    expect(score.breakdown.total).toBeLessThanOrEqual(EVAL_SCORE_MAX_TOTAL);
    expect(score.breakdown.conditioning).toBe(10);
    expect(score.findings.some((f) => /Conditioning coverage/i.test(f))).toBe(false);
  });

  it('scores pre-enrichment vs final and summarizes pipeline on the hybrid-week capture', () => {
    const raw = JSON.parse(fs.readFileSync(hybridWeekPath, 'utf8')) as unknown;
    const full = scoreGenerationCaptureFull(raw);
    expect(full.preEnrichment).toBeDefined();
    expect(full.deltaTotal).toBeDefined();
    expect(typeof full.deltaTotal).toBe('number');
    expect(full.pipeline?.chunkCount).toBeGreaterThanOrEqual(1);
    expect(full.pipeline?.anyPerSessionAfterBatchFallback).toBe(true);
    expect(full.pipeline?.anyValidatorFirstPassHadIssues).toBe(true);
    expect(full.preEnrichment!.validation.ok).toBe(true);
    expect(full.final.validation.ok).toBe(true);
    expect(typeof full.strengthFloor?.ok).toBe('boolean');
    expect(Array.isArray(full.strengthFloor?.findings ?? [])).toBe(true);
  });

  it('library catalog mode resolves real exercise ids on the small synthetic hybrid capture', () => {
    const raw = JSON.parse(fs.readFileSync(goodTwoDayPath, 'utf8')) as unknown;
    const infer = scoreGenerationCaptureFull(raw, { catalogMode: 'infer' });
    const lib = scoreGenerationCaptureFull(raw, { catalogMode: 'library' });
    expect(lib.catalog.mode).toBe('library');
    expect(lib.catalog.resolvedIds).toBe(lib.catalog.totalIds);
    expect(lib.final.score.breakdown.conditioning).toBe(10);
    expect(infer.final.score.breakdown.total).toBeLessThanOrEqual(EVAL_SCORE_MAX_TOTAL);
    expect(lib.final.score.breakdown.total).toBeLessThanOrEqual(EVAL_SCORE_MAX_TOTAL);
  });

  it('flags duplicate_exercise_id_across_chunk on the synthetic bad capture', () => {
    const raw = JSON.parse(fs.readFileSync(duplicateChunkPath, 'utf8')) as unknown;
    const { validation, score } = scoreGenerationCapture(raw, { catalogMode: 'library' });
    expect(validation.ok).toBe(false);
    expect(validation.issues).toContain('duplicate_exercise_id_across_chunk');
    expect(score.breakdown.structural).toBeLessThan(28);
  });

  it('summarizes pipeline finish reasons from synthetic capture', () => {
    const raw = JSON.parse(fs.readFileSync(goodTwoDayPath, 'utf8')) as unknown;
    const p = summarizeCapturePipeline(raw);
    expect(p?.groqFinishReasons).toContain('stop');
    expect(p?.anyFinishReasonLength).toBe(false);
  });

  it('infers hinge vs squat from common capture names', () => {
    expect(
      inferMovementPatternsForCaptureExercise({
        name: 'Conventional Deadlift',
        exerciseId: 'conventional_deadlift',
        primaryMuscleGroup: 'Legs',
      }),
    ).toContain('Hinge');
    expect(
      inferMovementPatternsForCaptureExercise({
        name: '45-Degree Leg Press',
        exerciseId: 'forty_five_degree_leg_press',
        primaryMuscleGroup: 'Legs',
      }),
    ).toContain('Squat');
  });
});
