// The lib imports react-native (Platform) and expo-haptics at module scope;
// this jest setup has no RN transform, so both are stubbed out — the colour
// math under test is pure.
jest.mock('react-native', () => ({
  Platform: { OS: 'test', select: (o: { default?: unknown }) => o.default ?? {} },
}));
jest.mock('expo-haptics', () => ({}));

import { MUSCLE_COLORS, mixWithWhite, muscleGradient } from './planCalendarPrototype';

describe('mixWithWhite', () => {
  it('keeps the colour at fraction 1 and reaches white at 0', () => {
    expect(mixWithWhite('#38B6FF', 1)).toBe('#38b6ff');
    expect(mixWithWhite('#38B6FF', 0)).toBe('#ffffff');
  });

  it('mixes each channel toward white', () => {
    // R 0x38=56 → 56·0.62 + 255·0.38 = 131.62 → 132 (0x84)
    // G 0xB6=182 → 209.74 → 210 (0xd2); B 255 stays 255.
    expect(mixWithWhite('#38B6FF', 0.62)).toBe('#84d2ff');
  });

  it('pads low channels to two hex digits', () => {
    expect(mixWithWhite('#000000', 1)).toBe('#000000');
  });
});

describe('muscleGradient', () => {
  it('starts at the muscle colour and fades lighter (E2 Bright)', () => {
    const [from, to] = muscleGradient('Chest');
    expect(from).toBe(MUSCLE_COLORS.Chest);
    expect(to).toBe(mixWithWhite(MUSCLE_COLORS.Chest, 0.62));
  });

  it('leaves white (Cardio) white at both ends', () => {
    expect(muscleGradient('Cardio')).toEqual(['#FFFFFF', '#ffffff']);
  });
});
