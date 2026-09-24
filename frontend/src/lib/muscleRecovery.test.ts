import {
  describeNote,
  describeRecovery,
  fatiguedForToday,
  muscleNamesSentence,
  MuscleRecovery,
  RECOVERY_SCALE,
  recoveryFill,
  recoveryFillsByRegion,
  RecoveryRegion,
} from './muscleRecovery';

const NOW = new Date(2026, 8, 24, 18, 0, 0);
const at = (daysAgo: number) => new Date(2026, 8, 24 - daysAgo, 10).toISOString();
const region = (over: Partial<RecoveryRegion>): RecoveryRegion => ({
  region: 'Semitendinosus',
  muscle: 'Hamstrings',
  group: 'Legs',
  level: 0.7,
  step: 4,
  label: 'Fatigued',
  sets: 16,
  assistSets: 0,
  lastTrainedAt: at(1),
  freshInDays: 2,
  note: null,
  touchedToday: false,
  ...over,
});

describe('muscleRecovery', () => {
  it('maps steps onto the five-step scale, step 0 to the quiet tone', () => {
    expect(recoveryFill(0, 'quiet')).toBe('quiet');
    expect(recoveryFill(1, 'quiet')).toBe(RECOVERY_SCALE[0]);
    expect(recoveryFill(5, 'quiet')).toBe(RECOVERY_SCALE[4]);
    expect(recoveryFill(9, 'quiet')).toBe(RECOVERY_SCALE[4]);
  });

  it('fills each region from its own estimate', () => {
    const rec: MuscleRecovery = { generatedAt: NOW.toISOString(), regions: [region({}), region({ region: 'Biceps Femoris', step: 2, label: 'Recovering' })] };
    const fills = recoveryFillsByRegion('back', rec, 'quiet');
    expect(fills['Semitendinosus']).toBe(RECOVERY_SCALE[3]);
    expect(fills['Biceps Femoris']).toBe(RECOVERY_SCALE[1]);
    expect(fills['Glute Max']).toBe('quiet');
  });

  it('writes the sheet line', () => {
    expect(describeRecovery(region({}), NOW)).toBe('Fatigued · trained yesterday, 16 sets · fresh in about 2 days');
    expect(describeRecovery(region({ step: 2, label: 'Recovering', sets: 0, assistSets: 6, freshInDays: 1 }), NOW)).toBe('Recovering · trained yesterday, assisted in 6 · fresh tomorrow');
    expect(describeRecovery(region({ step: 1, label: 'Lightly worked', lastTrainedAt: at(3), sets: 4 }), NOW)).toBe('Lightly worked · trained 3 days ago, 4 sets');
    expect(describeRecovery(region({ step: 0, label: 'Fresh', lastTrainedAt: at(6) }), NOW)).toBe('Fresh · trained 6 days ago');
    expect(describeRecovery(undefined, NOW)).toBe('Fresh · not trained recently');
  });

  it('writes the correction line', () => {
    expect(describeNote({ kind: 'sore', at: at(0) }, NOW)).toBe('You said still sore today');
    expect(describeNote({ kind: 'fine', at: at(1) }, NOW)).toBe('You said feeling fine yesterday');
    expect(describeNote(null, NOW)).toBeNull();
  });

  it('names what today touches that is still tired', () => {
    const rec: MuscleRecovery = {
      generatedAt: NOW.toISOString(),
      regions: [
        region({ touchedToday: true, level: 0.7 }),
        region({ region: 'Vastus Lateralis', muscle: 'Quads', step: 5, level: 0.9, touchedToday: true }),
        region({ region: 'Mid Chest', muscle: 'Mid Chest', step: 5, level: 0.9, touchedToday: false }),
        region({ region: 'Soleus', muscle: 'Calves', step: 1, level: 0.1, touchedToday: true }),
      ],
    };
    const tired = fatiguedForToday(rec);
    expect(tired.map((r) => r.region)).toEqual(['Vastus Lateralis', 'Semitendinosus']);
    expect(muscleNamesSentence(tired)).toBe('Quads and Hamstrings');
    expect(muscleNamesSentence([])).toBe('');
    expect(muscleNamesSentence([...tired, region({ region: 'Glute Max', muscle: 'Glutes' })])).toBe('Quads, Hamstrings and Glutes');
  });
});
