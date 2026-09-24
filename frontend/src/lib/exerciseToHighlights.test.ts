import { PRIMARY_THRESHOLD } from './exerciseToHighlights';
import {
  exerciseToHighlights,
  exerciseToTileHighlights,
  pickBodyMapView,
} from './exerciseToHighlights';

const intensityOf = (
  result: ReturnType<typeof exerciseToHighlights>,
  region: string,
): number | undefined => result?.highlights.find((h) => h.region === region)?.intensity;

describe('exerciseToHighlights', () => {
  it('uses region-level involvement when the payload carries it', () => {
    const result = exerciseToHighlights({
      primaryMuscleGroup: 'Legs',
      subMuscles: ['Hamstrings'],
      secondaryMuscleGroups: ['Core'],
      muscles: [
        { region: 'Semitendinosus', role: 'primary', weight: 1 },
        { region: 'Biceps Femoris', role: 'primary', weight: 0.6 },
        { region: 'Lower Abs', role: 'secondary', weight: 0.2 },
        { region: 'Not A Region', role: 'secondary', weight: 0.5 },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.view).toBe('back');
    expect(intensityOf(result, 'Semitendinosus')).toBe(1);
    expect(intensityOf(result, 'Biceps Femoris')).toBe(0.6);
    expect(intensityOf(result, 'Biceps Femoris')!).toBeGreaterThanOrEqual(PRIMARY_THRESHOLD);
    expect(intensityOf(result, 'Lower Abs')!).toBeLessThan(PRIMARY_THRESHOLD);
    expect(intensityOf(result, 'Not A Region')).toBeUndefined();
    // the whole-group fallback must not fire when regions are present
    expect(intensityOf(result, 'Hamstrings')).toBeUndefined();
    // tiles keep only the targets
    const tile = exerciseToTileHighlights({ muscles: result!.highlights.map((h) => ({ region: h.region, role: h.intensity >= PRIMARY_THRESHOLD ? 'primary' : 'secondary', weight: h.intensity })) });
    expect(tile!.highlights.map((h) => h.region).sort()).toEqual(['Biceps Femoris', 'Semitendinosus']);
  });

  it('falls back to the group mapping when involvement is empty', () => {
    const result = exerciseToHighlights({ primaryMuscleGroup: 'Chest', subMuscles: ['Upper Chest'], secondaryMuscleGroups: [], muscles: [] });
    expect(intensityOf(result, 'Upper Chest')).toBe(1);
  });

  it('maps an incline press to upper chest with softer delts/triceps', () => {
    const result = exerciseToHighlights({
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Upper Chest'],
      secondaryMuscleGroups: ['Shoulders', 'Arms'],
    });
    expect(result).not.toBeNull();
    expect(result!.view).toBe('front');
    expect(intensityOf(result, 'Upper Chest')).toBe(1);
    expect(intensityOf(result, 'Front Delts')).toBe(0.4);
    expect(intensityOf(result, 'Triceps')).toBe(0.4);
    expect(intensityOf(result, 'Mid Chest')).toBeUndefined();
  });

  it('maps a bent-over row to the back view with lats/mid back primary', () => {
    const result = exerciseToHighlights({
      primaryMuscleGroup: 'Back',
      subMuscles: ['Lats', 'Mid Back'],
      secondaryMuscleGroups: ['Arms'],
    });
    expect(result!.view).toBe('back');
    expect(intensityOf(result, 'Lats')).toBe(1);
    expect(intensityOf(result, 'Mid Back')).toBe(1);
    expect(intensityOf(result, 'Biceps')).toBe(0.4);
  });

  it('glows the whole primary group when subMuscles are missing', () => {
    const result = exerciseToHighlights({
      primaryMuscleGroup: 'Core',
      subMuscles: [],
      secondaryMuscleGroups: [],
    });
    expect(result!.view).toBe('front');
    expect(intensityOf(result, 'Upper Abs')).toBe(1);
    expect(intensityOf(result, 'Lower Abs')).toBe(1);
    expect(intensityOf(result, 'Obliques')).toBe(1);
  });

  it('returns null for cardio (caller keeps the disc)', () => {
    expect(
      exerciseToHighlights({
        primaryMuscleGroup: 'Cardio',
        subMuscles: [],
        secondaryMuscleGroups: ['Legs'],
      }),
    ).toBeNull();
  });

  it('returns null for unknown/missing metadata', () => {
    expect(exerciseToHighlights({})).toBeNull();
    expect(exerciseToHighlights({ primaryMuscleGroup: 'Mystery' })).toBeNull();
  });

  it('skips unknown sub-muscle names silently', () => {
    const result = exerciseToHighlights({
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Upper Chest', 'Pectoralis Bogus'],
    });
    expect(result!.highlights.filter((h) => h.intensity === 1)).toEqual([
      { region: 'Upper Chest', intensity: 1 },
    ]);
  });

  it('falls back to the whole group when every sub-muscle is unknown', () => {
    const result = exerciseToHighlights({
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Pectoralis Bogus'],
    });
    expect(intensityOf(result, 'Upper Chest')).toBe(1);
    expect(intensityOf(result, 'Mid Chest')).toBe(1);
    expect(intensityOf(result, 'Lower Chest')).toBe(1);
  });

  it('never downgrades a primary region via secondaries', () => {
    const result = exerciseToHighlights({
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Upper Chest'],
      secondaryMuscleGroups: ['Chest'],
    });
    expect(intensityOf(result, 'Upper Chest')).toBe(1);
  });

  it('sends calf work to the back view (gastrocnemius home)', () => {
    const result = exerciseToHighlights({
      primaryMuscleGroup: 'Legs',
      subMuscles: ['Calves'],
    });
    expect(result!.view).toBe('back');
  });
});

describe('exerciseToTileHighlights', () => {
  it('keeps primaries and drops the secondary washes', () => {
    const result = exerciseToTileHighlights({
      primaryMuscleGroup: 'Chest',
      subMuscles: ['Upper Chest'],
      secondaryMuscleGroups: ['Shoulders', 'Arms'],
    });
    expect(result!.highlights).toEqual([{ region: 'Upper Chest', intensity: 1 }]);
  });

  it('picks the view from primaries alone', () => {
    // The hero view for this would be front (six 0.4 core/chest regions outweigh
    // one calf); the tile must stay on the muscle the exercise is named for.
    const result = exerciseToTileHighlights({
      primaryMuscleGroup: 'Legs',
      subMuscles: ['Calves'],
      secondaryMuscleGroups: ['Core', 'Chest'],
    });
    expect(result!.view).toBe('back');
    expect(result!.highlights).toEqual([{ region: 'Calves', intensity: 1 }]);
  });

  it('still glows the whole group when sub-muscle data is missing', () => {
    const result = exerciseToTileHighlights({ primaryMuscleGroup: 'Chest' });
    expect(result!.highlights).toEqual([
      { region: 'Upper Chest', intensity: 1 },
      { region: 'Mid Chest', intensity: 1 },
      { region: 'Lower Chest', intensity: 1 },
    ]);
  });

  it('returns null for cardio/unknown (caller keeps the disc)', () => {
    expect(exerciseToTileHighlights({ primaryMuscleGroup: 'Cardio' })).toBeNull();
    expect(exerciseToTileHighlights({})).toBeNull();
  });
});

describe('pickBodyMapView', () => {
  it('ties go to the front view', () => {
    expect(pickBodyMapView([])).toBe('front');
    expect(
      pickBodyMapView([
        { region: 'Biceps', intensity: 1 },
        { region: 'Triceps', intensity: 1 },
      ]),
    ).toBe('front');
  });

  it('weighs intensity, not just region count', () => {
    expect(
      pickBodyMapView([
        { region: 'Lats', intensity: 1 },
        { region: 'Biceps', intensity: 0.4 },
        { region: 'Forearms', intensity: 0.4 },
      ]),
    ).toBe('back');
  });
});
