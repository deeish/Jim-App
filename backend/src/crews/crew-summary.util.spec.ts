import {
  addDaysIso,
  assembleCrewSummary,
  crewStreakDaysOf,
  estimateOneRepMax,
  mondayOfIso,
  rollingSessionsOf,
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
  restingSinceIso: null,
  prs: [],
  ...over,
});

const log = (dateIso: string, title = 'Push Day') => ({
  dateIso,
  title,
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

  it('holds a fresh miss while the make-up window is still open', () => {
    // b missed Monday; today is Tuesday, so b still has until Wednesday.
    // The old rule broke the streak the instant anyone missed anything,
    // which made it unsurvivable in any crew bigger than about three.
    const a = member('a', { slots: [slot(1, 'Monday')] });
    const b = member('b', { slots: [slot(1, 'Monday')] });
    const trained = new Map([
      ['a', new Set(['2026-08-24'])],
      ['b', new Set<string>()],
    ]);
    expect(crewStreakDaysOf([a, b], trained, '2026-08-25', crewCreated)).toBe(
      1,
    );
  });

  it('breaks once the make-up window closes unpaid', () => {
    // Same miss, but it is now Thursday: Monday + 2 has passed and b never
    // trained. Forgiveness is a window, not an amnesty.
    const a = member('a', { slots: [slot(1, 'Monday')] });
    const b = member('b', { slots: [slot(1, 'Monday')] });
    const trained = new Map([
      ['a', new Set(['2026-08-24'])],
      ['b', new Set<string>()],
    ]);
    expect(crewStreakDaysOf([a, b], trained, '2026-08-27', crewCreated)).toBe(
      0,
    );
  });

  it('a session inside the window pays the miss back', () => {
    // b missed Monday and trained Tuesday: the streak survives, and Monday
    // still counts. This is the whole point — a miss becomes a reason to
    // train tomorrow instead of a loss nothing can undo.
    const a = member('a', { slots: [slot(1, 'Monday')] });
    const b = member('b', { slots: [slot(1, 'Monday')] });
    const trained = new Map([
      ['a', new Set(['2026-08-24'])],
      ['b', new Set(['2026-08-25'])],
    ]);
    expect(crewStreakDaysOf([a, b], trained, '2026-08-27', crewCreated)).toBe(
      2,
    );
  });

  it('today is still judged strictly — forgiveness is for settled days', () => {
    // Both scheduled today, only a has trained. Today must not count yet, or
    // the streak would be handed out every morning and mean nothing.
    const a = member('a', { slots: [slot(1, 'Monday'), slot(1, 'Tuesday')] });
    const b = member('b', { slots: [slot(1, 'Monday'), slot(1, 'Tuesday')] });
    const trained = new Map([
      ['a', new Set(['2026-08-24', '2026-08-25'])],
      ['b', new Set(['2026-08-24'])],
    ]);
    // Monday complete for both; Tuesday (today) incomplete -> streak is 1.
    expect(crewStreakDaysOf([a, b], trained, '2026-08-25', crewCreated)).toBe(
      1,
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

describe('rollingSessionsOf', () => {
  it('counts trained days inside the 28-day window and nothing older', () => {
    // Window on 2026-08-25 reaches back to 2026-07-29 inclusive.
    const trained = new Set(['2026-08-25', '2026-07-29', '2026-07-28']);
    expect(rollingSessionsOf(trained, '2026-08-25')).toBe(2);
  });

  it('counts days, so two sessions in one day are still one', () => {
    // The set IS the day bucket — this is a guard on the contract, not math.
    expect(rollingSessionsOf(new Set(['2026-08-25']), '2026-08-25')).toBe(1);
  });
});

describe('crewStreakDaysOf with a resting member', () => {
  const crewCreated = '2026-08-01';

  it('a resting member can never break the streak', () => {
    const a = member('a', { slots: [slot(1, 'Monday'), slot(1, 'Tuesday')] });
    const away = member('away', {
      slots: [slot(1, 'Monday'), slot(1, 'Tuesday')],
      restingSinceIso: '2026-08-01',
    });
    const trained = new Map([
      ['a', new Set(['2026-08-24', '2026-08-25'])],
      ['away', new Set<string>()],
    ]);
    expect(
      crewStreakDaysOf([a, away], trained, '2026-08-25', crewCreated),
    ).toBe(2);
    // The same crew with away on duty is a day shorter: today is not done
    // until everyone SCHEDULED has trained, and away is scheduled.
    const onDuty = member('away', {
      slots: [slot(1, 'Monday'), slot(1, 'Tuesday')],
    });
    expect(
      crewStreakDaysOf([a, onDuty], trained, '2026-08-25', crewCreated),
    ).toBe(1);
  });

  it('does not reach back and forgive days before the rest began', () => {
    // away missed Monday the 24th and only went to rest on the 27th. By
    // Friday the make-up window on that Monday has closed, so it still
    // breaks the run — resting is a pause, not an eraser.
    const a = member('a', { slots: [slot(1, 'Monday'), slot(1, 'Tuesday')] });
    const trained = new Map([
      ['a', new Set(['2026-08-24', '2026-08-25'])],
      ['away', new Set<string>()],
    ]);
    const late = member('away', {
      slots: [slot(1, 'Monday'), slot(1, 'Tuesday')],
      restingSinceIso: '2026-08-27',
    });
    expect(
      crewStreakDaysOf([a, late], trained, '2026-08-28', crewCreated),
    ).toBe(0);
    // Had they rested from the Monday, the run would have survived.
    const early = member('away', {
      slots: [slot(1, 'Monday'), slot(1, 'Tuesday')],
      restingSinceIso: '2026-08-24',
    });
    expect(
      crewStreakDaysOf([a, early], trained, '2026-08-28', crewCreated),
    ).toBe(2);
  });
});

describe('estimateOneRepMax', () => {
  // These cases mirror frontend/src/lib/exerciseHistory.ts exactly. Crew used
  // to rank records by raw weight, so 225x1 was a record here that the
  // Profile screen did not recognise — one word, two meanings.
  it('reports a single rep as the weight itself, never Epley', () => {
    // Epley would say 232 and claim more than was lifted.
    expect(estimateOneRepMax(225, 1)).toBe(225);
  });

  it('projects multi-rep sets with Epley', () => {
    expect(estimateOneRepMax(200, 5)).toBe(233); // 200 * (1 + 5/30)
    expect(estimateOneRepMax(100, 12)).toBe(140);
  });

  it('is suppressed past the rep cap and for unloaded or invalid sets', () => {
    expect(estimateOneRepMax(100, 13)).toBeNull();
    expect(estimateOneRepMax(null, 5)).toBeNull();
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(100, 0)).toBeNull();
  });

  it('ranks a lighter high-rep set above a heavier single', () => {
    // 205x5 = 239 beats 225x1 = 225: the point of using an estimate at all.
    expect(estimateOneRepMax(205, 5)).toBeGreaterThan(
      estimateOneRepMax(225, 1)!,
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
          reps: 3,
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
          reps: 3,
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

  it('crowns everyone tied at the most sessions in the window', () => {
    const a = member('a', {
      anchorMondayIso: null,
      logs: [log('2026-08-25'), log('2026-08-24')],
    });
    const b = member('b', {
      anchorMondayIso: null,
      logs: [log('2026-08-25'), log('2026-08-24')],
    });
    const c = member('c', { anchorMondayIso: null, logs: [log('2026-08-25')] });
    const out = assembleCrewSummary({ ...base, members: [a, b, c] });
    expect([...out.legendUserIds].sort()).toEqual(['a', 'b']);
    expect(out.members.map((m) => m.rolling)).toEqual([2, 2, 1]);
  });

  it('crowns on sessions, never on completion ratio', () => {
    // a goes 2/2 against a two-day plan — a perfect week, and the ratio the
    // list used to sort on put it top. b puts in twice the work at 4/5.
    const a = member('a', {
      slots: [slot(1, 'Monday'), slot(1, 'Tuesday')],
      logs: [log('2026-08-25'), log('2026-08-24')],
    });
    const b = member('b', {
      slots: [
        slot(1, 'Monday'),
        slot(1, 'Tuesday'),
        slot(1, 'Wednesday'),
        slot(1, 'Thursday'),
        slot(1, 'Friday'),
      ],
      logs: [
        log('2026-08-25'),
        log('2026-08-24'),
        log('2026-08-20'),
        log('2026-08-19'),
      ],
    });
    const out = assembleCrewSummary({ ...base, members: [a, b] });
    expect(out.legendUserIds).toEqual(['b']);
  });

  it('crowns nobody in a crew that has not trained', () => {
    const out = assembleCrewSummary({
      ...base,
      members: [member('a', { anchorMondayIso: null })],
    });
    expect(out.legendUserIds).toEqual([]);
  });

  it('a member resting all week neither adds to the target nor misses', () => {
    const away = member('away', {
      slots: [slot(1, 'Monday'), slot(1, 'Tuesday'), slot(1, 'Friday')],
      restingSinceIso: '2026-08-20',
    });
    const out = assembleCrewSummary({ ...base, members: [away] });
    expect(out.members[0].week.map((d) => d.state)).toEqual(
      Array(7).fill('rest'),
    );
    expect(out.members[0].race).toEqual({ done: 0, planned: 0 });
    expect(out.members[0].hasPlanThisWeek).toBe(false);
    expect(out.members[0].todayState).toBe('rest');
    expect(out.members[0].restingDays).toBe(5); // Aug 20 -> Aug 25
  });

  it('a resting member who trains anyway still counts for the crew', () => {
    // The whole bargain: resting pauses what you owe, not your stake.
    const away = member('away', {
      slots: [slot(1, 'Monday'), slot(1, 'Tuesday')],
      restingSinceIso: '2026-08-20',
      logs: [log('2026-08-25')],
    });
    const out = assembleCrewSummary({ ...base, members: [away] });
    expect(out.members[0].week[1].state).toBe('trained');
    expect(out.members[0].race).toEqual({ done: 1, planned: 1 });
    expect(out.members[0].hasPlanThisWeek).toBe(false);
    expect(out.members[0].rolling).toBe(1);
  });

  it('resting starts the day it starts — earlier days keep their slots', () => {
    const m = member('me', {
      slots: [slot(1, 'Monday'), slot(1, 'Tuesday'), slot(1, 'Friday')],
      restingSinceIso: '2026-08-25',
      logs: [log('2026-08-24')],
    });
    const out = assembleCrewSummary({ ...base, members: [m] });
    expect(out.members[0].week.map((d) => d.state)).toEqual([
      'trained', // Mon: on duty, and done
      'rest', // Tue: resting from today
      'rest',
      'rest',
      'rest', // Fri: slot no longer counts
      'rest',
      'rest',
    ]);
    // Monday was owed and paid, so it still counts for both sides.
    expect(out.members[0].race).toEqual({ done: 1, planned: 1 });
    expect(out.members[0].hasPlanThisWeek).toBe(true);
    expect(out.members[0].restingDays).toBe(0);
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
