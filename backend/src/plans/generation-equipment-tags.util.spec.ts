import { mapPlanGenerationUiEquipmentToLibrary } from './generation-equipment-tags.util';

describe('mapPlanGenerationUiEquipmentToLibrary', () => {
  it('maps UI checklist ids to library equipment labels', () => {
    const out = mapPlanGenerationUiEquipmentToLibrary([
      'barbell',
      'dumbbells',
      'pull-up bar',
    ]);
    expect(out).toEqual(expect.arrayContaining(['Barbell', 'Dumbbell', 'Pull-up Bar']));
    expect(new Set(out).size).toBe(out.length);
  });

  it('returns empty for none or unknown', () => {
    expect(mapPlanGenerationUiEquipmentToLibrary([])).toEqual([]);
    expect(mapPlanGenerationUiEquipmentToLibrary(['none', 'unknown'])).toEqual([]);
  });
});
