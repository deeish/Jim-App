import {
  isBodyweightEquipment,
  plannedRepsNumber,
  plannedWeightNumber,
  suggestedEntry,
  validateSetEntry,
  weightRequired,
  type SetEntryContext,
} from './setEntryRules';

const base: SetEntryContext = {
  plannedWeight: '135 lb',
  plannedReps: '8–12 · aim 10',
  muscle: 'Chest',
  timedUnit: null,
  lastSet: null,
  unit: 'lb',
};

describe('setEntryRules: what a set needs before the check logs it (#56)', () => {
  it('a loaded row needs reps and weight; blanks no longer log the placeholder', () => {
    expect(validateSetEntry(base, '', '')).toMatchObject({
      ok: false,
      missing: 'reps',
    });
    expect(validateSetEntry(base, '8', '')).toMatchObject({
      ok: false,
      missing: 'weight',
    });
    expect(validateSetEntry(base, '8', '135')).toEqual({
      ok: true,
      missing: null,
      reps: 8,
      weight: 135,
    });
    expect(validateSetEntry(base, '0', '135')).toMatchObject({
      ok: false,
      missing: 'reps',
    });
    expect(validateSetEntry(base, '8', 'abc')).toMatchObject({
      ok: false,
      missing: 'weight',
    });
  });

  it('a bar to hang from, a box or rings make a bodyweight row; anything loadable makes a loaded one', () => {
    // Build 37: a dead hang on a pull-up bar read as loaded, so the check
    // refused the set until a number was typed.
    expect(isBodyweightEquipment(['pull_up_bar'])).toBe(true);
    expect(isBodyweightEquipment('Pull up bar')).toBe(true);
    expect(isBodyweightEquipment('Pull-Up Bar')).toBe(true);
    expect(isBodyweightEquipment('Dip station')).toBe(true);
    expect(isBodyweightEquipment('Gymnastic rings')).toBe(true);
    expect(isBodyweightEquipment('Box')).toBe(true);
    expect(isBodyweightEquipment('Bodyweight')).toBe(true);
    expect(isBodyweightEquipment('—')).toBe(true);
    expect(isBodyweightEquipment([])).toBe(true);
    expect(isBodyweightEquipment(undefined)).toBe(true);
    expect(isBodyweightEquipment('Barbell + Bench')).toBe(false);
    expect(isBodyweightEquipment(['dumbbell', 'mat'])).toBe(false);
    expect(isBodyweightEquipment('Cable machine')).toBe(false);
    expect(isBodyweightEquipment('Pull up bar + Dip belt')).toBe(false);
    expect(isBodyweightEquipment('Kettlebell')).toBe(false);
    expect(isBodyweightEquipment('Resistance band')).toBe(false);
  });

  it('a bodyweight row (dead hang, pull-up) takes a blank weight, and a number as added load', () => {
    const bw = { ...base, plannedWeight: 'Bodyweight', muscle: 'Back' };
    expect(weightRequired(bw)).toBe(false);
    expect(validateSetEntry(bw, '8', '')).toEqual({
      ok: true,
      missing: null,
      reps: 8,
      weight: null,
    });
    expect(validateSetEntry(bw, '8', '25')).toMatchObject({
      ok: true,
      weight: 25,
    });
    expect(validateSetEntry(bw, '', '')).toMatchObject({
      ok: false,
      missing: 'reps',
    });
  });

  it('a loaded row with no known weight yet (the dash) still asks for one', () => {
    const dash = { ...base, plannedWeight: '—' };
    expect(weightRequired(dash)).toBe(true);
    expect(validateSetEntry(dash, '8', '')).toMatchObject({
      ok: false,
      missing: 'weight',
    });
  });

  it('timed and cardio rows never ask for a weight', () => {
    const hang = {
      ...base,
      plannedWeight: 'Bodyweight',
      plannedReps: '45 sec',
      timedUnit: 'sec',
    };
    expect(weightRequired(hang)).toBe(false);
    expect(validateSetEntry(hang, '45', '')).toMatchObject({
      ok: true,
      reps: 45,
    });
    const walk = {
      ...base,
      plannedWeight: '—',
      plannedReps: '10 min',
      timedUnit: 'min',
      muscle: 'Cardio',
    };
    expect(weightRequired(walk)).toBe(false);
    expect(validateSetEntry(walk, '', '')).toMatchObject({
      ok: false,
      missing: 'reps',
    });
  });
});

describe('setEntryRules: the one-tap chip fills what the placeholder showed', () => {
  it('reads the target out of every reps display the calendar produces', () => {
    expect(plannedRepsNumber('8–12 · aim 10')).toBe(10);
    expect(plannedRepsNumber('8–12')).toBe(8);
    expect(plannedRepsNumber('10')).toBe(10);
    expect(plannedRepsNumber('45 sec')).toBe(45);
    expect(plannedRepsNumber('—')).toBeNull();
  });

  it("shows the planned weight in the user's unit, nothing for bodyweight or a dash", () => {
    expect(plannedWeightNumber('135 lb', 'lb')).toBe(135);
    expect(plannedWeightNumber('135 lb', 'kg')).toBe(61);
    expect(plannedWeightNumber('Bodyweight', 'lb')).toBeNull();
    expect(plannedWeightNumber('—', 'lb')).toBeNull();
  });

  it('prefers last time over the target, and fills both fields from it', () => {
    expect(suggestedEntry({ ...base, lastSet: { reps: 8, weightLb: 140 } })).toEqual({
      label: 'Same as last time: 8 × 140 lb',
      reps: '8',
      weight: '140',
    });
    expect(
      suggestedEntry({
        ...base,
        plannedWeight: 'Bodyweight',
        lastSet: { reps: 12, weightLb: null },
      }),
    ).toEqual({ label: 'Same as last time: 12 reps', reps: '12', weight: '' });
    expect(
      suggestedEntry({
        ...base,
        unit: 'kg',
        lastSet: { reps: 8, weightLb: 140 },
      }),
    ).toMatchObject({
      reps: '8',
      weight: '64',
    });
  });

  it('falls back to the target, with the weight only when the plan has one', () => {
    expect(suggestedEntry(base)).toEqual({
      label: 'Use target: 10 × 135 lb',
      reps: '10',
      weight: '135',
    });
    expect(suggestedEntry({ ...base, plannedWeight: 'Bodyweight' })).toEqual({
      label: 'Use target: 10 reps',
      reps: '10',
      weight: '',
    });
    expect(suggestedEntry({ ...base, plannedWeight: '—' })).toEqual({
      label: 'Use target: 10 reps',
      reps: '10',
      weight: '',
    });
    expect(suggestedEntry({ ...base, plannedReps: '45 sec', timedUnit: 'sec' })).toEqual({
      label: 'Use target: 45 sec',
      reps: '45',
      weight: '',
    });
    expect(suggestedEntry({ ...base, plannedReps: '—' })).toBeNull();
  });
});
