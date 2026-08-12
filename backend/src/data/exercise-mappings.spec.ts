import {
  equipmentSatisfies,
  EQUIPMENT_MAP,
  transformExercise,
  UNMODELED_EQUIPMENT,
  type RawExercise,
} from './exercise-mappings';

const HOME = ['Dumbbell', 'Resistance Band', 'Bodyweight'];

function raw(partial: Partial<RawExercise>): RawExercise {
  return {
    id: 'x',
    name: 'X',
    primaryMuscleGroupId: 'chest',
    ...partial,
  } as RawExercise;
}

describe('transformExercise primaryEquipment', () => {
  it('excludes alternatives: a cable move with a band alternative requires Cable', () => {
    const t = transformExercise(
      raw({
        equipmentIds: ['cable_machine', 'straight_bar_attachment'],
        equipmentAlternativeIds: ['resistance_band'],
      }),
    );
    expect(t.equipment).toContain('Resistance Band'); // merged list keeps it
    expect(t.primaryEquipment).toEqual(['Cable']);
  });

  it('drops setup gear (bench, rack) so it never gates', () => {
    const t = transformExercise(
      raw({ equipmentIds: ['dumbbell', 'flat_bench'] }),
    );
    expect(t.primaryEquipment).toEqual(['Dumbbell']);
  });

  it('keeps empty for true bodyweight rows (no ids)', () => {
    const t = transformExercise(raw({ equipmentIds: [] }));
    expect(t.primaryEquipment).toEqual([]);
  });

  it('marks unmodeled venues (pool) as unavailable rather than equipment-free', () => {
    const t = transformExercise(raw({ equipmentIds: ['pool'] }));
    expect(t.primaryEquipment).toEqual([UNMODELED_EQUIPMENT]);
  });
});

describe('equipmentSatisfies', () => {
  it('empty required is doable anywhere', () => {
    expect(equipmentSatisfies([], HOME)).toBe(true);
    expect(equipmentSatisfies(undefined, HOME)).toBe(true);
  });

  it('requires every non-bodyweight label to be owned', () => {
    expect(equipmentSatisfies(['Dumbbell'], HOME)).toBe(true);
    expect(equipmentSatisfies(['Barbell'], HOME)).toBe(false);
    expect(equipmentSatisfies(['Barbell', 'Bodyweight'], HOME)).toBe(false);
    expect(equipmentSatisfies(['Cable'], HOME)).toBe(false);
  });

  it('treats Bodyweight as always available (gym tag lists omit it)', () => {
    const gym = ['Barbell', 'Cable', 'Machine'];
    expect(equipmentSatisfies(['Barbell', 'Bodyweight'], gym)).toBe(true);
    expect(equipmentSatisfies(['Bodyweight'], gym)).toBe(true);
  });

  it('never matches the unmodeled sentinel', () => {
    expect(equipmentSatisfies([UNMODELED_EQUIPMENT], HOME)).toBe(false);
    expect(
      equipmentSatisfies([UNMODELED_EQUIPMENT], ['Barbell', 'Machine']),
    ).toBe(false);
  });
});

// Catalog audit Task 12: the catalog spells some implements more than one
// way. Ids are immutable so the variants are never migrated — instead every
// spelling in a twin group must resolve to the same display label, or the
// two spellings gate differently and rows silently drift apart.
describe('equipment id-twin groups stay label-identical', () => {
  const TWIN_GROUPS: string[][] = [
    ['dumbbell', 'dumbbells'],
    ['cable', 'cable_machine'],
    ['battle_rope', 'battle_ropes'],
    ['landmine', 'landmine_attachment'],
    ['slider', 'sliders'],
    ['rope', 'rope_attachment'],
    ['single_handle', 'single_handle_attachment'],
    ['plate', 'weight_plate', 'weight_plates'],
    ['weight_vest', 'weighted_vest'],
    ['bench', 'flat_bench'],
    ['safety_bar', 'safety_squat_bar'],
    ['rubber_band', 'resistance_band'],
  ];

  it.each(TWIN_GROUPS.map((g) => [g.join(' / '), g] as const))(
    '%s',
    (_label, group) => {
      const labels = group.map((id) => EQUIPMENT_MAP[id]);
      for (const label of labels) expect(label).toBeDefined();
      expect(new Set(labels).size).toBe(1);
    },
  );

  it('ez_bar vs ez_bar_attachment stay DIFFERENT (free bar vs cable attachment)', () => {
    expect(EQUIPMENT_MAP.ez_bar).toBe('Barbell');
    expect(EQUIPMENT_MAP.ez_bar_attachment).toBe('Cable');
  });
});
