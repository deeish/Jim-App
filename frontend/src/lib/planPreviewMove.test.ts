import { moveWorkoutBetweenDays, type MovableWorkout } from './planPreviewMove';

const w = (id: string): MovableWorkout => ({ id });
const mark = (x: MovableWorkout): MovableWorkout => ({ ...x, changeType: 'moved' });
const ids = (list: MovableWorkout[] | undefined) => (list ?? []).map((x) => x.id);

describe('moveWorkoutBetweenDays', () => {
  it('moves onto an EMPTY day, leaving the origin empty', () => {
    const out = moveWorkoutBetweenDays(
      { Monday: [w('a')], Tuesday: [] },
      'a',
      'Monday',
      'Tuesday',
      mark,
    );
    expect(ids(out.Monday)).toEqual([]);
    expect(ids(out.Tuesday)).toEqual(['a']);
  });

  it('SWAPS with an occupied day rather than stacking two on it', () => {
    // The bug: the display appended, so Tuesday ended up with both and Monday
    // with none, while the draft had them exchanged. Apply then wrote Tuesday
    // twice and lost Monday entirely.
    const out = moveWorkoutBetweenDays(
      { Monday: [w('a')], Tuesday: [w('b')] },
      'a',
      'Monday',
      'Tuesday',
      mark,
    );
    expect(ids(out.Tuesday)).toEqual(['a']);
    expect(ids(out.Monday)).toEqual(['b']);
  });

  it('marks BOTH sides as moved, since both days changed', () => {
    const out = moveWorkoutBetweenDays(
      { Monday: [w('a')], Tuesday: [w('b')] },
      'a',
      'Monday',
      'Tuesday',
      mark,
    );
    expect(out.Tuesday[0].changeType).toBe('moved');
    expect(out.Monday[0].changeType).toBe('moved');
  });

  it('keeps anything else already on the origin day', () => {
    // The draft models one session per day, so a second is already an anomaly.
    // Dropping it here would add a second bug on top of the first.
    const out = moveWorkoutBetweenDays(
      { Monday: [w('a'), w('extra')], Tuesday: [w('b')] },
      'a',
      'Monday',
      'Tuesday',
      mark,
    );
    expect(ids(out.Monday)).toEqual(['b', 'extra']);
    expect(ids(out.Tuesday)).toEqual(['a']);
  });

  it('is a no-op when the workout is not on the origin day', () => {
    const before = { Monday: [w('a')], Tuesday: [w('b')] };
    expect(moveWorkoutBetweenDays(before, 'ghost', 'Monday', 'Tuesday', mark)).toBe(before);
  });

  it('is a no-op when moving a day onto itself', () => {
    const before = { Monday: [w('a')] };
    expect(moveWorkoutBetweenDays(before, 'a', 'Monday', 'Monday', mark)).toBe(before);
  });

  it('does not mutate the input', () => {
    const before = { Monday: [w('a')], Tuesday: [w('b')] };
    const snapshot = JSON.stringify(before);
    moveWorkoutBetweenDays(before, 'a', 'Monday', 'Tuesday', mark);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('handles a destination day that has no entry at all', () => {
    const out = moveWorkoutBetweenDays({ Monday: [w('a')] }, 'a', 'Monday', 'Friday', mark);
    expect(ids(out.Monday)).toEqual([]);
    expect(ids(out.Friday)).toEqual(['a']);
  });
});
