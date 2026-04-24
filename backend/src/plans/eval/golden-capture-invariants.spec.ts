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

  it('passes golden checks on the real-shape hybrid week sample (library Cardio on each strength day)', () => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(capturesDir, 'generation-capture-hybrid-week-sample.json'), 'utf8'),
    ) as unknown;
    const { ok, issues } = collectGoldenCaptureInvariantIssues(raw, {
      exerciseLibraryPath: libraryPath,
    });
    expect({ ok, issues }).toEqual({ ok: true, issues: [] });
  });
});
