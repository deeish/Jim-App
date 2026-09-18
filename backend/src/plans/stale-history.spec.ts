import type { GeneratedSession } from './session-enrichment';
import {
  PLATEAU_MAX_AGE_DAYS,
  staleFactor,
  stampLoadsFromHistory,
} from './load-from-history';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-17T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);

describe('staleFactor (Tier 7 addendum)', () => {
  it('fresh history is used as is; older history is discounted; past six months it is ignored', () => {
    expect(staleFactor(ago(10), now)).toBe(1);
    expect(staleFactor(ago(41), now)).toBe(1);
    expect(staleFactor(ago(42), now)).toBe(0.925);
    expect(staleFactor(ago(89), now)).toBe(0.925);
    expect(staleFactor(ago(90), now)).toBe(0.85);
    expect(staleFactor(ago(179), now)).toBe(0.85);
    expect(staleFactor(ago(365), now)).toBeUndefined();
  });

  it('"currently sedentary" moves each band one step harsher', () => {
    expect(staleFactor(ago(10), now, '0')).toBe(0.925);
    expect(staleFactor(ago(60), now, '0')).toBe(0.85);
    expect(staleFactor(ago(120), now, '0')).toBeUndefined();
    expect(staleFactor(ago(10), now, '3-4')).toBe(1);
  });
});

describe('stampLoadsFromHistory with old logs', () => {
  const session = (): GeneratedSession => ({
    weekIndex: 1,
    weekday: 'Monday',
    name: 'Upper',
    exercises: [
      {
        name: 'Flat Barbell Bench Press',
        exerciseId: 'flat_barbell_bench_press',
        sets: 4,
        reps: 8,
        repsMin: 8,
        repsMax: 12,
        targetRir: 2,
        primaryMuscleGroup: 'Chest',
      },
    ],
  });
  const spec = {
    type: 'strength' as const,
    title: 'Upper',
    weekIndex: 1,
    weekday: 'Monday',
    durationMin: 45,
    durationMax: 60,
    isHardDay: true,
  };
  const findMeta = () => ({
    primaryMuscleGroup: 'Chest',
    type: 'Compound',
    movementPatterns: ['Push'],
    primaryEquipment: ['Barbell'],
  });
  const perf = (days: number) => ({
    workoutLogId: 'l',
    performedAt: ago(days),
    sets: [{ setNumber: 1, reps: 8, weight: 135 }],
  });

  it('a fresh log stamps the load; a four-month-old log stamps 15% less; a year-old log gets the calibration note', () => {
    const fresh = stampLoadsFromHistory({
      sessions: [session()],
      specs: [spec],
      history: new Map([['flat_barbell_bench_press', [perf(5)]]]),
      findMeta,
      now,
    });
    const freshLoad = fresh.sessions[0]!.exercises[0]!.weight!;
    expect(freshLoad).toBe(135);

    const old = stampLoadsFromHistory({
      sessions: [session()],
      specs: [spec],
      history: new Map([['flat_barbell_bench_press', [perf(120)]]]),
      findMeta,
      now,
    });
    expect(old.sessions[0]!.exercises[0]!.weight).toBe(115);

    const ancient = stampLoadsFromHistory({
      sessions: [session()],
      specs: [spec],
      history: new Map([['flat_barbell_bench_press', [perf(400)]]]),
      findMeta,
      now,
    });
    const row = ancient.sessions[0]!.exercises[0]!;
    expect(row.weight).toBeUndefined();
    expect(row.notes).toContain('Calibration:');
    expect(ancient.calibrated).toBe(1);
  });

  it('a plateau needs three logs younger than three months', () => {
    const stalled = [perf(3), perf(10), perf(17)];
    const recent = stampLoadsFromHistory({
      sessions: [session()],
      specs: [spec],
      history: new Map([['flat_barbell_bench_press', stalled]]),
      findMeta,
      now,
    });
    expect(recent.deloaded).toBe(1);
    const spread = [perf(3), perf(10), perf(PLATEAU_MAX_AGE_DAYS + 10)];
    const notStalled = stampLoadsFromHistory({
      sessions: [session()],
      specs: [spec],
      history: new Map([['flat_barbell_bench_press', spread]]),
      findMeta,
      now,
    });
    expect(notStalled.deloaded).toBe(0);
  });
});
