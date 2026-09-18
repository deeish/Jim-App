import type { WeekProgressionDto } from './dto/generate-sessions.dto';
import {
  DELOAD_LOAD_FACTOR,
  loadFactorByWeek,
  normalizeWeekProgression,
} from './progression-profile';

const row = (
  weekIndex: number,
  phase: string,
  repModifier: number,
  volumeMultiplier = 1,
): WeekProgressionDto => ({
  weekIndex,
  phase,
  intensityPct: 70,
  volumeMultiplier,
  repModifier,
});

describe('normalizeWeekProgression', () => {
  it('holds reps across a build, tightens effort once at the halfway point, steps the load', () => {
    // the old client profile for a four-week "build": reps cut every week
    const out = normalizeWeekProgression([
      row(1, 'foundation', 0, 1),
      row(2, 'progression', -1, 1.08),
      row(3, 'progression', -2, 1.16),
      row(4, 'peak', -3, 1.24),
    ]);
    expect(out.map((p) => p.repModifier)).toEqual([0, 0, 0, 0]);
    expect(out.map((p) => p.rirShift)).toEqual([0, 0, -1, -1]);
    expect(out.map((p) => p.loadFactor)).toEqual([1, 1.025, 1.05, 1.075]);
    // set volume is the client's to shape
    expect(out.map((p) => p.volumeMultiplier)).toEqual([1, 1.08, 1.16, 1.24]);
  });

  it('a deload keeps its lighter reps, eases effort and drops the load', () => {
    const out = normalizeWeekProgression([
      row(1, 'foundation', 0),
      row(2, 'progression', -1),
      row(3, 'peak', -2),
      row(4, 'deload', 2, 0.7),
    ]);
    const deload = out[3]!;
    expect(deload.repModifier).toBe(2);
    expect(deload.rirShift).toBe(2);
    expect(deload.loadFactor).toBe(DELOAD_LOAD_FACTOR);
    // three build weeks: the step lands on the third
    expect(out.map((p) => p.rirShift)).toEqual([0, 0, -1, 2]);
  });

  it('a one-week plan and a maintain block change nothing', () => {
    expect(
      normalizeWeekProgression([row(1, 'foundation', 0)])[0],
    ).toMatchObject({ rirShift: 0, loadFactor: 1, repModifier: 0 });
    const maintain = normalizeWeekProgression([
      row(1, 'maintain', 0),
      row(2, 'maintain', 0),
    ]);
    expect(maintain.every((p) => p.rirShift === 0 && p.loadFactor === 1)).toBe(
      true,
    );
    expect(normalizeWeekProgression(undefined)).toEqual([]);
  });

  it('loadFactorByWeek answers 1 for weeks the profile does not name', () => {
    const f = loadFactorByWeek([row(1, 'foundation', 0), row(2, 'peak', -1)]);
    expect(f(1)).toBe(1);
    expect(f(2)).toBe(1.025);
    expect(f(9)).toBe(1);
  });
});
