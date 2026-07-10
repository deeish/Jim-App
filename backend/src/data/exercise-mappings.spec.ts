import {
  equipmentSatisfies,
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
