import * as fs from 'fs';
import * as path from 'path';
import { collectGoldenCaptureInvariantIssues } from './golden-capture-invariants';

const capturesDir = path.join(__dirname, 'captures');
const libraryPath = path.join(process.cwd(), 'data', 'exercises_5000plus.json');

describe('golden capture invariants', () => {
  it('passes all golden checks on the synthetic hybrid two-day good fixture', () => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(capturesDir, 'capture-synthetic-hybrid-two-day-good.json'), 'utf8'),
    ) as unknown;
    const { ok, issues } = collectGoldenCaptureInvariantIssues(raw, {
      exerciseLibraryPath: libraryPath,
    });
    expect({ ok, issues }).toEqual({ ok: true, issues: [] });
  });

  /**
   * The real-shape hybrid week sample is the *pre-fix* capture that motivated Phase 3
   * (3 core moves on the Lower day: Overhead March + Rotational Sit-Up + Landmine Rotation)
   * and Phase 5 (slot 1 of multiple sessions is a non-staple). The hybrid-style cardio
   * invariant still passes; the new `over_concentrated_pattern` and `slot_one_not_anchor`
   * checks fire, exactly as designed.
   *
   * When/if the capture is re-recorded with the budget + anchor checks enforced
   * end-to-end, flip this assertion back to a strict `ok: true`.
   */
  it('still passes the hybrid-cardio invariant on the real-shape week sample (flagged for over-concentration + non-anchor slot 1)', () => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(capturesDir, 'generation-capture-hybrid-week-sample.json'), 'utf8'),
    ) as unknown;
    const { ok, issues } = collectGoldenCaptureInvariantIssues(raw, {
      exerciseLibraryPath: libraryPath,
    });
    expect(ok).toBe(false);
    expect(issues).toEqual([
      'chunk validation failed: over_concentrated_pattern, slot_one_not_anchor',
    ]);
  });
});
