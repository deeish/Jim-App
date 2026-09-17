import {
  adjustNextWeekFromCheckIn,
  checkInDirection,
  type AdjustableRow,
} from './checkin-adjustment';

const rows = (): AdjustableRow[] => [
  { id: 'bench', name: 'Bench Press', sets: 4, orderIndex: 0, targetRir: 2 },
  { id: 'row', name: 'Barbell Row', sets: 4, orderIndex: 1, targetRir: 2 },
  {
    id: 'curl',
    name: 'Curl',
    sets: 2,
    orderIndex: 2,
    targetRir: 1,
    notes: 'Slow on the way down.',
  },
  {
    id: 'plank',
    name: 'Plank',
    sets: 3,
    orderIndex: 3,
    prescriptionType: 'time',
  },
];

describe('checkInDirection', () => {
  it('eases on too hard, a lot of soreness, or joint pain; pushes only on an easy, clean session', () => {
    expect(checkInDirection({ effort: 3, soreness: 0, jointPain: 0 })).toBe(
      'ease',
    );
    expect(checkInDirection({ effort: 2, soreness: 2, jointPain: 0 })).toBe(
      'ease',
    );
    expect(checkInDirection({ effort: 1, soreness: 0, jointPain: 2 })).toBe(
      'ease',
    );
    expect(checkInDirection({ effort: 1, soreness: 0, jointPain: 0 })).toBe(
      'push',
    );
    expect(
      checkInDirection({ effort: 1, soreness: 1, jointPain: 0 }),
    ).toBeNull();
    expect(
      checkInDirection({ effort: 2, soreness: 0, jointPain: 0 }),
    ).toBeNull();
  });
});

describe('adjustNextWeekFromCheckIn', () => {
  it('too hard: accessories lose a set, never below two, the main lift and holds untouched', () => {
    const out = adjustNextWeekFromCheckIn(
      rows(),
      { effort: 3, soreness: 1, jointPain: 0 },
      'Monday',
    );
    expect(out.direction).toBe('ease');
    expect(out.updates).toEqual([
      {
        id: 'row',
        sets: 3,
        notes: 'Eased after your check-in: one set fewer this week.',
      },
    ]);
    expect(out.summary).toBe('Eased next Monday: 1 accessory set fewer.');
  });

  it('joint pain also holds the main lift back one rep in reserve, and keeps an existing note', () => {
    const out = adjustNextWeekFromCheckIn(
      rows(),
      { effort: 2, soreness: 0, jointPain: 2 },
      'Monday',
    );
    expect(out.updates.find((u) => u.id === 'bench')).toEqual({
      id: 'bench',
      targetRir: 3,
      notes:
        'Eased after your check-in: keep one more rep in reserve on this lift this week.',
    });
    expect(out.summary).toBe(
      'Eased next Monday: 1 accessory set fewer, Bench Press held back a rep.',
    );
  });

  it('easy and clean: accessories gain a set up to five, notes appended after existing cues', () => {
    const out = adjustNextWeekFromCheckIn(
      rows(),
      { effort: 1, soreness: 0, jointPain: 0 },
      'Thursday',
    );
    expect(out.direction).toBe('push');
    expect(out.updates).toEqual([
      {
        id: 'row',
        sets: 5,
        notes: 'Bumped after an easy check-in: one more set this week.',
      },
      {
        id: 'curl',
        sets: 3,
        notes:
          'Slow on the way down. Bumped after an easy check-in: one more set this week.',
      },
    ]);
    expect(out.summary).toBe('Bumped next Thursday: 2 more accessory sets.');
  });

  it('about right moves nothing, and a day already at the floor has nothing to ease', () => {
    expect(
      adjustNextWeekFromCheckIn(
        rows(),
        { effort: 2, soreness: 1, jointPain: 1 },
        'Monday',
      ).summary,
    ).toBeNull();
    const floored = rows().map((r) => ({ ...r, sets: 2 }));
    const out = adjustNextWeekFromCheckIn(
      floored,
      { effort: 3, soreness: 2, jointPain: 0 },
      'Monday',
    );
    expect(out.direction).toBeNull();
    expect(out.updates).toEqual([]);
  });

  it('does not stack a second check-in note on a row that already carries one', () => {
    const noted = rows().map((r) =>
      r.id === 'row'
        ? { ...r, notes: 'Eased after your check-in: one set fewer this week.' }
        : r,
    );
    const out = adjustNextWeekFromCheckIn(
      noted,
      { effort: 3, soreness: 0, jointPain: 0 },
      'Monday',
    );
    expect(out.updates[0]!.notes).toBe(
      'Eased after your check-in: one set fewer this week.',
    );
  });
});
