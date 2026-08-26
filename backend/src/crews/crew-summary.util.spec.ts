import {
  addDaysIso,
  assembleCrewSummary,
  crewStreakDaysOf,
  mondayOfIso,
  scheduledSlotOn,
  weekStreakOf,
  weekdayNameOf,
  type MemberInput,
} from './crew-summary.util';

const slot = (weekNumber: number, dayOfWeek: string, title = 'Push Day') => ({
  weekNumber,
  dayOfWeek,
  title,
  hasExercises: true,
  muscles: [{ group: 'Chest', name: 'Bench Press' }],
});

const member = (
  userId: string,
  over: Partial<MemberInput> = {},
): MemberInput => ({
  userId,
  name: userId,
  email: null,
  avatarId: null,
  anchorMondayIso: '2026-08-24',
  totalWeeks: 8,
  slots: [],
  logs: [],
  prs: [],
  ...over,
});

const log = (dateIso: string, title = 'Push Day') => ({
  dateIso,
  title,
  performedAtIso: `${dateIso}T10:00:00.000Z`,
  muscles: [{ group: 'Chest', name: 'Bench Press' }],
});

describe('date helpers', () => {
  it('adds days across month boundaries', () => {
    expect(addDaysIso('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDaysIso('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('names weekdays (2026-08-25 is a Tuesday)', () => {
    expect(weekdayNameOf('2026-08-25')).toBe('Tuesday');
    expect(weekdayNameOf('2026-08-24')).toBe('Monday');
  });

  it('finds the Monday of a week, Sunday included', () => {
    expect(mondayOfIso('2026-08-25')).toBe('2026-08-24');
    expect(mondayOfIso('2026-08-30')).toBe('2026-08-24'); // Sunday
    expect(mondayOfIso('2026-08-24')).toBe('2026-08-24');
  });
});

describe('scheduledSlotOn', () => {
  it('maps program weeks off the anchor Monday', () => {
    const m = member('a', { slots: [slot(1, 'Tuesday'), slot(2, 'Tuesday')] });
    expect(scheduledSlotOn(m, '2026-08-25')?.weekNumber).toBe(1);
    expect(scheduledSlotOn(m, '2026-09-01')?.weekNumber).toBe(2);
  });

  it('is rest before the anchor, after the program, and with no plan', () => {
    const m = member('a', { slots: [slot(1, 'Tuesday')], totalWeeks: 1 });
    expect(scheduledSlotOn(m, '2026-08-18')).toBeNull(); // week 0
    expect(scheduledSlotOn(m, '2026-09-01')).toBeNull(); // week 2 of 1
    expect(
      scheduledSlotOn(member('b', { anchorMondayIso: null }), '2026-08-25'),
    ).toBeNull();
  });

  it('ignores slots with no exercises (rest-typed rows)', () => {
    const m = member('a', {
      slots: [{ ...slot(1, 'Tuesday'), hasExercises: false }],
    });
    expect(scheduledSlotOn(m, '2026-08-25')).toBeNull();
  });
});

describe('weekStreakOf', () => {
  it('counts consecutive training weeks back from this week', () => {
    const dates = new Set(['2026-08-25', '2026-08-19', '2026-08-12']);
    expect(weekStreakOf(dates, '2026-08-24')).toBe(3);
  });

  it('does not break mid-week when this week is still quiet', () => {
    const dates = new Set(['2026-08-19', '2026-08-12']);
    expect(weekStreakOf(dates, '2026-08-24')).toBe(2);
  });

  it('is zero with no recent weeks', () => {
    expect(weekStreakOf(new Set(['2026-07-01']), '2026-08-24')).toBe(0);
  });
});

describe('crewStreakDaysOf', () => {
  const crewCreated = '2026-08-01';

  it('counts days back until a scheduled day nobody trained', () => {
    // a scheduled Mon+Tue, trained Mon only; today Tue not yet trained.
    const a = member('a', { slots: [slot(1, 'Monday'), slot(1, 'Tuesday')] });
    const trained = new Map([['a', new Set(['2026-08-24'])]]);
    // Today (Tue) incomplete -> streak starts from Monday.
    expect(crewStreakDaysOf([a], trained, '2026-08-25', crewCreated)).toBe(1);
  });

  it('includes today once everyone scheduled has trained', () => {
    const a = member('a', { slots: [slot(1, 'Monday'), slot(1, 'Tuesday')] });
    const trained = new Map([['a', new Set(['2026-08-24', '2026-08-25'])]]);
    expect(crewStreakDaysOf([a], trained, '2026-08-25', crewCreated)).toBe(2);
  });

  it('breaks on a member missing a scheduled day', () => {
    const a = member('a', { slots: [slot(1, 'Monday')] });
    const b = member('b', { slots: [slot(1, 'Monday')] });
    const trained = new Map([
      ['a', new Set(['2026-08-24'])],
      ['b', new Set<string>()],
    ]);
    expect(crewStreakDaysOf([a, b], trained, '2026-08-25', crewCreated)).toBe(
      0,
    );
  });

  it('is zero before anyone has trained at all', () => {
    const a = member('a', { slots: [] });
    const trained = new Map([['a', new Set<string>()]]);
    expect(crewStreakDaysOf([a], trained, '2026-08-25', '2026-08-24')).toBe(0);
  });

  it('floors at crew creation even with older logs', () => {
    const a = member('a', { slots: [] });
    const trained = new Map([
      ['a', new Set(['2026-08-20', '2026-08-24', '2026-08-25'])],
    ]);
    expect(crewStreakDaysOf([a], trained, '2026-08-25', '2026-08-24')).toBe(2);
  });

  it('does not inflate across leading quiet days', () => {
    // Trained Monday; Tue-today quiet with nothing scheduled: streak holds at 1.
    const a = member('a', { slots: [], logs: [] });
    const trained = new Map([['a', new Set(['2026-08-24'])]]);
    expect(crewStreakDaysOf([a], trained, '2026-08-25', '2026-08-01')).toBe(1);
  });
});

describe('assembleCrewSummary', () => {
  const base = {
    meUserId: 'me',
    todayIso: '2026-08-25',
    weekMondayIso: '2026-08-24',
    crewCreatedIso: '2026-08-01',
    kudos: [],
  };

  it('builds week states: trained, missed, scheduled, rest', () => {
    const m = member('me', {
      slots: [slot(1, 'Monday'), slot(1, 'Tuesday'), slot(1, 'Friday')],
      logs: [log('2026-08-25')],
    });
    const out = assembleCrewSummary({ ...base, members: [m] });
    const states = out.members[0].week.map((d) => d.state);
    expect(states).toEqual([
      'missed', // Mon scheduled, no log, past
      'trained', // Tue (today) logged
      'rest',
      'rest',
      'scheduled', // Fri upcoming
      'rest',
      'rest',
    ]);
    expect(out.members[0].race).toEqual({ done: 1, planned: 3 });
    expect(out.members[0].todayState).toBe('trained');
  });

  it('surfaces PR moments with kudos counts and my pound flag', () => {
    const m = member('sam', {
      prs: [
        { dateIso: '2026-08-24', exerciseName: 'Bench Press', weight: 225 },
      ],
    });
    const out = assembleCrewSummary({
      ...base,
      members: [member('me'), m],
      kudos: [
        {
          fromUserId: 'me',
          toUserId: 'sam',
          eventRef: 'pr:2026-08-24:Bench Press',
          createdAtIso: '2026-08-24T12:00:00.000Z',
        },
        {
          fromUserId: 'jake',
          toUserId: 'sam',
          eventRef: 'pr:2026-08-24:Bench Press',
          createdAtIso: '2026-08-24T13:00:00.000Z',
        },
      ],
    });
    expect(out.moments).toHaveLength(1);
    expect(out.moments[0]).toMatchObject({
      kind: 'pr',
      exerciseName: 'Bench Press',
      weight: 225,
      kudos: 2,
      iPounded: true,
    });
    expect(out.members.find((x) => x.userId === 'sam')?.kudosWeek).toBe(2);
  });

  it('points the card-level pound at the latest session', () => {
    const m = member('sam', { logs: [log('2026-08-25'), log('2026-08-24')] });
    const out = assembleCrewSummary({ ...base, members: [m] });
    expect(out.members[0].latestSessionRef).toBe('day:2026-08-25');
    expect(out.members[0].lastSession?.dateIso).toBe('2026-08-25');
  });
});
