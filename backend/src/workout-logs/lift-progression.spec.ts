import {
  deloadRow,
  loadStepLb,
  stepLiftFromLog,
  type LedgerRow,
} from './lift-progression';

const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  id: 'r1',
  exerciseId: 'flat_barbell_bench_press',
  name: 'Flat Barbell Bench Press',
  sets: 4,
  reps: 8,
  repsMin: 8,
  repsMax: 12,
  targetRir: 2,
  weight: 135,
  prescriptionType: 'reps',
  notes: null,
  ...over,
});
const ok = { effort: 2 };
const hard = { effort: 3 };

describe('stepLiftFromLog (the ledger)', () => {
  it('every set at the top of the range: one step up, target back to the bottom', () => {
    const s = stepLiftFromLog(
      row(),
      [12, 12, 12, 12].map((reps) => ({ reps, weight: 135 })),
      ok,
    )!;
    expect(s.kind).toBe('up');
    expect(s.weight).toBe(140);
    expect(s.reps).toBe(8);
    expect(s.notes).toContain('Ledger:');
  });

  it('a lower-body barbell lift past 200 lb steps by ten', () => {
    const s = stepLiftFromLog(
      row({ name: 'Back Squat', weight: 225 }),
      [12, 12, 12, 12].map((reps) => ({ reps, weight: 225 })),
      ok,
    )!;
    expect(s.weight).toBe(235);
    expect(loadStepLb('Dumbbell Lateral Raise', 20)).toBe(5);
  });

  it('inside the range: same load, best set plus one, capped at the top', () => {
    const s = stepLiftFromLog(
      row(),
      [10, 9, 9, 8].map((reps) => ({ reps, weight: 135 })),
      ok,
    )!;
    expect(s.kind).toBe('more_reps');
    expect(s.weight).toBe(135);
    expect(s.reps).toBe(11);
    const capped = stepLiftFromLog(
      row(),
      [12, 11, 10, 10].map((reps) => ({ reps, weight: 135 })),
      ok,
    )!;
    expect(capped.kind).toBe('more_reps');
    expect(capped.reps).toBe(12);
  });

  it('one rep short of the range holds; further short or a hard session backs off five percent', () => {
    const hold = stepLiftFromLog(
      row(),
      [8, 8, 7, 8].map((reps) => ({ reps, weight: 135 })),
      ok,
    )!;
    expect(hold.kind).toBe('hold');
    expect(hold.weight).toBe(135);
    const back = stepLiftFromLog(
      row(),
      [8, 7, 6, 5].map((reps) => ({ reps, weight: 135 })),
      ok,
    )!;
    expect(back.kind).toBe('back');
    expect(back.weight).toBe(130);
    const grind = stepLiftFromLog(
      row(),
      [12, 12, 12, 12].map((reps) => ({ reps, weight: 135 })),
      hard,
    )!;
    expect(grind.kind).toBe('back');
  });

  it('follows the load the user actually used, not the forecast', () => {
    const s = stepLiftFromLog(
      row({ weight: 135 }),
      [12, 12, 12, 12].map((reps) => ({ reps, weight: 155 })),
      ok,
    )!;
    expect(s.weight).toBe(160);
  });

  it('a row with no number gets one from its first logged sets', () => {
    const s = stepLiftFromLog(
      row({
        name: 'Cable Lateral Raise',
        weight: null,
        repsMin: 12,
        repsMax: 15,
        targetRir: 1,
      }),
      [12, 12, 11].map((reps) => ({ reps, weight: 25 })),
      ok,
    )!;
    expect(s.kind).toBe('set_number');
    expect(s.weight).toBeGreaterThan(0);
    expect(s.reps).toBe(12);
  });

  it('a fifteen-rep accessory with no number takes the logged load as its number', () => {
    const s = stepLiftFromLog(
      row({
        name: 'Rope Cable Pushdown',
        weight: null,
        repsMin: 12,
        repsMax: 15,
        targetRir: 1,
      }),
      [15, 15, 15].map((reps) => ({ reps, weight: 40 })),
      ok,
    )!;
    expect(s.kind).toBe('set_number');
    expect(s.weight).toBe(40);
  });

  it('bodyweight, timed and unlogged rows are left alone', () => {
    expect(
      stepLiftFromLog(
        row({ name: 'Pull-Up', weight: null }),
        [8, 8, 7].map((reps) => ({ reps, weight: null })),
        ok,
      ),
    ).toBeNull();
    expect(
      stepLiftFromLog(
        row({ prescriptionType: 'time' }),
        [{ reps: 40, weight: null }],
        ok,
      ),
    ).toBeNull();
    expect(stepLiftFromLog(row(), [], ok)).toBeNull();
  });

  it('replaces an earlier ledger sentence instead of stacking them', () => {
    const first = stepLiftFromLog(
      row({ notes: 'Brace hard.' }),
      [12, 12, 12, 12].map((reps) => ({ reps, weight: 135 })),
      ok,
    )!;
    const second = stepLiftFromLog(
      row({ notes: first.notes, weight: 140 }),
      [9, 9, 8, 8].map((reps) => ({ reps, weight: 140 })),
      ok,
    )!;
    expect(second.notes.startsWith('Brace hard. Ledger:')).toBe(true);
    expect(second.notes.split('Ledger:').length).toBe(2);
  });

  it('deloadRow eases sets, reps, effort and load; a timed row keeps its shape', () => {
    const d = deloadRow(row({ sets: 5, weight: 150 }));
    expect(d).toMatchObject({
      sets: 4,
      reps: 10,
      repsMin: 10,
      repsMax: 14,
      targetRir: 4,
      weight: 135,
    });
    const t = deloadRow(
      row({
        prescriptionType: 'time',
        sets: 3,
        reps: 40,
        repsMin: null,
        repsMax: null,
        targetRir: null,
        weight: null,
      }),
    );
    expect(t).toMatchObject({ sets: 3, reps: 40, weight: null });
  });
});
