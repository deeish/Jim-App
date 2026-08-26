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
  joinedIso: '2026-08-01',
  anchorMondayIso: '2026-08-24',
  totalWeeks: 8,
  slots: [],
  logs: [],
  skippedDays: [],
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

  it('a deliberately skipped day never breaks the streak', () => {
    // a skipped their scheduled Monday, trained Tuesday: no violation.
    const a = member('a', {
      slots: [slot(1, 'Monday'), slot(1, 'Tuesday')],
      skippedDays: ['2026-08-24'],
    });
    const trained = new Map([['a', new Set(['2026-08-25'])]]);
    expect(crewStreakDaysOf([a], trained, '2026-08-25', crewCreated)).toBe(1);
  });

  it('a new member cannot retroactively break the streak with pre-join misses', () => {
    // a has held the streak Mon+Tue; b joined TODAY with a scheduled-but-
    // missed Monday from before joining — that miss must not count.
    const a = member('a', { slots: [slot(1, 'Monday'), slot(1, 'Tuesday')] });
    const b = member('b', {
      joinedIso: '2026-08-25',
      slots: [slot(1, 'Monday')],
    });
    const trained = new Map([
      ['a', new Set(['2026-08-24', '2026-08-25'])],
      ['b', new Set<string>()],
    ]);
    expect(crewStreakDaysOf([a, b], trained, '2026-08-25', crewCreated)).toBe(
      2,
    );
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
        {
          dateIso: '2026-08-24',
          exerciseId: 'flat_barbell_bench_press',
          exerciseName: 'Bench Press',
          weight: 225,
        },
      ],
    });
    const out = assembleCrewSummary({
      ...base,
      members: [member('me'), m],
      kudos: [
        {
          fromUserId: 'me',
          toUserId: 'sam',
          eventRef: 'pr:2026-08-24:flat_barbell_bench_press',
          createdAtIso: '2026-08-24T12:00:00.000Z',
        },
        {
          fromUserId: 'jake',
          toUserId: 'sam',
          eventRef: 'pr:2026-08-24:flat_barbell_bench_press',
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
    const sam = out.members.find((x) => x.userId === 'sam');
    expect(sam?.kudosWeek).toBe(2);
    // ...but those two pounds landed on the PR, not on a session, so the
    // row's chip must still read zero. Labelling a single-ref chip with the
    // week-wide total is what made two chips disagree about one workout.
    expect(sam?.kudosLatest).toBe(0);
  });

  it('points the card-level pound at the latest session', () => {
    const m = member('sam', { logs: [log('2026-08-25'), log('2026-08-24')] });
    const out = assembleCrewSummary({ ...base, members: [m] });
    expect(out.members[0].latestSessionRef).toBe('day:2026-08-25');
    expect(out.members[0].lastSession?.dateIso).toBe('2026-08-25');
  });

  it('makes each trained day its own pound target, and never my own', () => {
    const sam = member('sam', { logs: [log('2026-08-25'), log('2026-08-24')] });
    const me = member('me', { logs: [log('2026-08-25')] });
    const out = assembleCrewSummary({
      ...base,
      members: [me, sam],
      kudos: [
        {
          fromUserId: 'me',
          toUserId: 'sam',
          eventRef: 'day:2026-08-24',
          createdAtIso: '2026-08-24T12:00:00.000Z',
        },
      ],
    });
    const samWeek = out.members.find((x) => x.userId === 'sam')!.week;
    const mon = samWeek.find((d) => d.dateIso === '2026-08-24')!;
    const tue = samWeek.find((d) => d.dateIso === '2026-08-25')!;
    const wed = samWeek.find((d) => d.dateIso === '2026-08-26')!;
    expect(mon).toMatchObject({
      poundRef: 'day:2026-08-24',
      kudos: 1,
      iPounded: true,
    });
    expect(tue).toMatchObject({
      poundRef: 'day:2026-08-25',
      kudos: 0,
      iPounded: false,
    });
    // A day nobody trained has nothing to pound.
    expect(wed.poundRef).toBeNull();
    // ...and neither does any day of my own: the server rejects a self-pound,
    // so the tile must never offer one.
    const myWeek = out.members.find((x) => x.userId === 'me')!.week;
    expect(myWeek.every((d) => d.poundRef === null)).toBe(true);
  });

  it('points a record day at the record, not at the day', () => {
    const sam = member('sam', {
      logs: [log('2026-08-24')],
      prs: [
        {
          dateIso: '2026-08-24',
          exerciseId: 'flat_barbell_bench_press',
          exerciseName: 'Bench Press',
          weight: 225,
        },
      ],
    });
    const out = assembleCrewSummary({
      ...base,
      members: [sam],
      kudos: [
        {
          fromUserId: 'me',
          toUserId: 'sam',
          eventRef: 'pr:2026-08-24:flat_barbell_bench_press',
          createdAtIso: '2026-08-24T12:00:00.000Z',
        },
      ],
    });
    const mon = out.members[0].week.find((d) => d.dateIso === '2026-08-24')!;
    // The tile and the moment are the same event, so they move one number.
    expect(mon.poundRef).toBe('pr:2026-08-24:flat_barbell_bench_press');
    expect(mon.kudos).toBe(1);
    expect(mon.iPounded).toBe(true);
    expect(out.moments[0]).toMatchObject({
      kind: 'pr',
      kudos: 1,
      iPounded: true,
    });
  });

  it('counts pounds on the latest session apart from the week total', () => {
    const m = member('sam', { logs: [log('2026-08-25'), log('2026-08-24')] });
    const out = assembleCrewSummary({
      ...base,
      members: [m],
      kudos: [
        {
          fromUserId: 'me',
          toUserId: 'sam',
          eventRef: 'day:2026-08-25',
          createdAtIso: '2026-08-25T12:00:00.000Z',
        },
        {
          fromUserId: 'jake',
          toUserId: 'sam',
          eventRef: 'day:2026-08-25',
          createdAtIso: '2026-08-25T13:00:00.000Z',
        },
        // An older session of sam's: counts for the week, not for the chip.
        {
          fromUserId: 'jake',
          toUserId: 'sam',
          eventRef: 'day:2026-08-24',
          createdAtIso: '2026-08-24T13:00:00.000Z',
        },
      ],
    });
    expect(out.members[0].kudosLatest).toBe(2);
    expect(out.members[0].iPoundedLatest).toBe(true);
    expect(out.members[0].kudosWeek).toBe(3);
  });

  it('a skipped day reads as rest and leaves the race', () => {
    const m = member('me', {
      slots: [slot(1, 'Monday'), slot(1, 'Tuesday')],
      skippedDays: ['2026-08-24'],
      logs: [log('2026-08-25')],
    });
    const out = assembleCrewSummary({ ...base, members: [m] });
    expect(out.members[0].week[0].state).toBe('rest'); // skipped Mon, not missed
    expect(out.members[0].race).toEqual({ done: 1, planned: 1 });
  });

  it('emits a Monday/Tuesday recap crowning last week’s winner', () => {
    // Last week (Aug 17-23): sam 2/2 against a plan; me 1 freestyle session.
    const sam = member('sam', {
      anchorMondayIso: '2026-08-17',
      slots: [slot(1, 'Monday'), slot(1, 'Thursday')],
      logs: [log('2026-08-17'), log('2026-08-20')],
    });
    const me = member('me', {
      anchorMondayIso: null,
      logs: [log('2026-08-19')],
    });
    const out = assembleCrewSummary({ ...base, members: [me, sam] });
    const recap = out.moments.find((mo) => mo.kind === 'recap');
    expect(recap).toMatchObject({
      ref: 'recap:2026-08-17',
      userId: 'sam',
      winnerDone: 2,
      winnerPlanned: 2,
      crewDone: 3,
      crewPlanned: 3,
    });
  });

  it('emits a display-only streak milestone moment at 7 days', () => {
    // Nobody scheduled anything; one member has trained 8 straight days.
    const days = Array.from(
      { length: 8 },
      (_, i) => `2026-08-${String(18 + i).padStart(2, '0')}`,
    );
    const m = member('me', {
      anchorMondayIso: null,
      logs: days.map((d) => log(d)),
    });
    const out = assembleCrewSummary({ ...base, members: [m] });
    const milestone = out.moments.find((mo) => mo.kind === 'streak');
    expect(milestone).toMatchObject({
      ref: 'crewstreak:7',
      userId: null,
      milestone: 7,
    });
  });
});
