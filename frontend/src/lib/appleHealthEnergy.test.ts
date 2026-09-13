import { DEFAULT_BODY_WEIGHT_LB, estimateActiveEnergyKcal } from './appleHealthEnergy';

describe('estimateActiveEnergyKcal', () => {
  it('is MET 4.5 × kg × hours', () => {
    // 170 lb = 77.1 kg; 4.5 × 77.1 × 1 h ≈ 347 kcal
    expect(estimateActiveEnergyKcal(3600, 170)).toBe(347);
    // 200 lb = 90.7 kg; half an hour
    expect(estimateActiveEnergyKcal(1800, 200)).toBe(204);
  });

  it('falls back to a default weight when none is known', () => {
    expect(estimateActiveEnergyKcal(3600, null)).toBe(estimateActiveEnergyKcal(3600, DEFAULT_BODY_WEIGHT_LB));
    expect(estimateActiveEnergyKcal(3600, undefined)).toBe(347);
    expect(estimateActiveEnergyKcal(3600, 0)).toBe(347);
    expect(estimateActiveEnergyKcal(3600, NaN)).toBe(347);
  });

  it('never writes a zero-energy workout for a real session, and nothing for no time', () => {
    expect(estimateActiveEnergyKcal(5, 170)).toBe(1);
    expect(estimateActiveEnergyKcal(0, 170)).toBe(0);
    expect(estimateActiveEnergyKcal(-30, 170)).toBe(0);
    expect(estimateActiveEnergyKcal(NaN, 170)).toBe(0);
  });
});
