import {
  frequencyOptionFor,
  scheduleWriteBack,
  sessionMinutesOptionFor,
} from './scheduleWriteBack';

describe('frequencyOptionFor', () => {
  it('maps counts the picker can show and refuses the rest', () => {
    expect(frequencyOptionFor(2)).toBe(2);
    expect(frequencyOptionFor(4)).toBe(4);
    expect(frequencyOptionFor(6)).toBe(6);
    expect(frequencyOptionFor(1)).toBeNull();
    expect(frequencyOptionFor(7)).toBeNull();
    expect(frequencyOptionFor(0)).toBeNull();
  });
});

describe('sessionMinutesOptionFor', () => {
  it('inverts the seed: the top of the window is the preference', () => {
    expect(sessionMinutesOptionFor({ min: 30, max: 45 })).toBe(45);
    expect(sessionMinutesOptionFor({ min: 45, max: 60 })).toBe(60);
    expect(sessionMinutesOptionFor({ min: 60, max: 90 })).toBe(75);
    expect(sessionMinutesOptionFor({ min: 15, max: 30 })).toBe(30);
  });

  it('snaps an in-between window to the nearest step', () => {
    expect(sessionMinutesOptionFor({ min: 40, max: 70 })).toBe(75);
    expect(sessionMinutesOptionFor({ min: 20, max: 35 })).toBe(30);
  });
});

describe('scheduleWriteBack', () => {
  const DEFAULT_3 = ['Monday', 'Wednesday', 'Friday'];

  it('stays flexible when the days are the page default for that count', () => {
    expect(scheduleWriteBack(['Friday', 'Monday', 'Wednesday'], DEFAULT_3)).toEqual({
      trainingFrequency: 3,
      trainingDaysFlexible: true,
      preferredTrainingDays: [],
    });
  });

  it('stores any other choice as picked days, in week order', () => {
    expect(scheduleWriteBack(['Saturday', 'Tuesday', 'Thursday'], DEFAULT_3)).toEqual({
      trainingFrequency: 3,
      trainingDaysFlexible: false,
      preferredTrainingDays: ['Tuesday', 'Thursday', 'Saturday'],
    });
  });

  it('drops unknown day names and duplicates, and leaves the count alone when unshowable', () => {
    const r = scheduleWriteBack(['Monday', 'Monday', 'Funday'], ['Monday']);
    expect(r.preferredTrainingDays).toEqual([]);
    expect(r.trainingDaysFlexible).toBe(true);
    expect(r.trainingFrequency).toBeNull();
  });
});
