import { formatLoggedSetDetail } from './loggedSetDisplay';

describe('formatLoggedSetDetail', () => {
  it('renders rep sets with the weight in the user unit', () => {
    expect(formatLoggedSetDetail({ reps: 8, weight: 145 }, 'Bench Press', 'lb')).toBe(
      '8 × 145 lb',
    );
    // 145 lb ≈ 66 kg — a kg user must never see "lb".
    expect(formatLoggedSetDetail({ reps: 8, weight: 145 }, 'Bench Press', 'kg')).toBe(
      '8 × 66 kg',
    );
  });

  it('renders unweighted rep sets with an em dash, matching the old layout', () => {
    expect(formatLoggedSetDetail({ reps: 20 }, 'Push-up', 'lb')).toBe('20 × —');
    expect(formatLoggedSetDetail({ reps: 20, weight: 0 }, 'Push-up', 'kg')).toBe('20 × —');
  });

  it('renders timed sets as a duration, not reps', () => {
    // 600 "reps" on a cardio row is ten minutes, not 600 repetitions.
    expect(formatLoggedSetDetail({ reps: 600 }, 'Treadmill Walk', 'lb')).toBe('10 min');
    expect(formatLoggedSetDetail({ reps: 45 }, 'Forearm Plank', 'lb')).toBe('45s');
  });

  it('renders loaded carries as duration @ weight', () => {
    expect(formatLoggedSetDetail({ reps: 45, weight: 70 }, 'Farmer Carry', 'lb')).toBe(
      '45s @ 70 lb',
    );
    // 70 lb ≈ 31.75 kg; kg loads ≥ 10 round to whole numbers.
    expect(formatLoggedSetDetail({ reps: 45, weight: 70 }, 'Farmer Carry', 'kg')).toBe(
      '45s @ 32 kg',
    );
  });

  it('keeps the rep rendering for legacy timed rows holding a real rep count', () => {
    // Below the plausible-duration floor the number is a rep count that a
    // legacy row logged; "8s" would be a lie.
    expect(formatLoggedSetDetail({ reps: 8 }, 'Forearm Plank', 'lb')).toBe('8 × —');
  });
});
