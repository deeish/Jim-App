import { daysAgo, describeHeat, heatAlphaByRegion, hexWithAlpha, MuscleHeat } from './muscleHeat';

const NOW = new Date(2026, 8, 23, 18, 0, 0); // local
const heat: MuscleHeat = {
  days: 7,
  generatedAt: NOW.toISOString(),
  muscles: [
    { muscle: 'Quads', group: 'Legs', score: 12, intensity: 0.7, sets: 12, assistSets: 0, lastTrainedAt: new Date(2026, 8, 23, 10).toISOString() },
    { muscle: 'Lats', group: 'Back', score: 0.5, intensity: 0.05, sets: 0, assistSets: 4, lastTrainedAt: new Date(2026, 8, 20, 10).toISOString() },
  ],
};

describe('muscleHeat', () => {
  it('appends an alpha byte to a hue', () => {
    expect(hexWithAlpha('#12855A', 1)).toBe('#12855Aff');
    expect(hexWithAlpha('#12855A', 0)).toBe('#12855A00');
    expect(hexWithAlpha('#12855A', 0.5)).toBe('#12855A80');
  });

  it('lights every head of a hot muscle and lifts faint heat to a visible floor', () => {
    const a = heatAlphaByRegion('front', heat);
    expect(a['Rectus Femoris']).toBeCloseTo(0.7);
    expect(a['Vastus Lateralis']).toBeCloseTo(0.7);
    expect(a['Mid Chest']).toBe(0);
    const b = heatAlphaByRegion('back', heat);
    expect(b['Lats']).toBeCloseTo(0.18);
    expect(b['Teres Major']).toBeCloseTo(0.18); // same catalog muscle
    expect(b['Glute Max']).toBe(0);
  });

  it('prefers a region-level entry over the sub-muscle fallback', () => {
    const regional: MuscleHeat = {
      ...heat,
      muscles: [
        { region: 'Semitendinosus', muscle: 'Hamstrings', group: 'Legs', score: 8, intensity: 0.55, sets: 8, assistSets: 0, lastTrainedAt: heat.muscles[0].lastTrainedAt },
        { region: 'Biceps Femoris', muscle: 'Hamstrings', group: 'Legs', score: 4, intensity: 0.33, sets: 8, assistSets: 0, lastTrainedAt: heat.muscles[0].lastTrainedAt },
      ],
    };
    const b = heatAlphaByRegion('back', regional);
    expect(b['Semitendinosus']).toBeCloseTo(0.55);
    expect(b['Biceps Femoris']).toBeCloseTo(0.33);
    expect(b['Glute Max']).toBe(0);
  });

  it('gives detail-only regions no heat', () => {
    const a = heatAlphaByRegion('front', heat);
    expect(a['Sartorius']).toBe(0);
  });

  it('counts whole local days', () => {
    expect(daysAgo(new Date(2026, 8, 23, 1).toISOString(), NOW)).toBe(0);
    expect(daysAgo(new Date(2026, 8, 22, 23).toISOString(), NOW)).toBe(1);
    expect(daysAgo(new Date(2026, 8, 20, 10).toISOString(), NOW)).toBe(3);
  });

  it('writes the caption', () => {
    expect(describeHeat(heat.muscles[0], NOW)).toBe('Trained today · 12 sets');
    expect(describeHeat(heat.muscles[1], NOW)).toBe('Trained 3 days ago · assisted in 4');
    expect(describeHeat(undefined, NOW)).toBe('Not trained recently');
    expect(describeHeat({ ...heat.muscles[0], sets: 1, lastTrainedAt: new Date(2026, 8, 22, 9).toISOString() }, NOW)).toBe('Trained yesterday · 1 set');
  });
});
