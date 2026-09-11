jest.mock('react-native', () => ({
  Platform: { OS: 'test' },
  NativeModules: {},
}));

import { regionFromLocale, weightUnitForLocale } from './deviceUnits';

describe('regionFromLocale', () => {
  it('reads the region from the common spellings', () => {
    expect(regionFromLocale('en-US')).toBe('US');
    expect(regionFromLocale('en_US')).toBe('US');
    expect(regionFromLocale('en-US@calendar=gregorian')).toBe('US');
    expect(regionFromLocale('de-DE')).toBe('DE');
    expect(regionFromLocale('es-419')).toBe('419');
    expect(regionFromLocale('zh-Hans-CN')).toBe('CN');
  });

  it('returns null when there is no region', () => {
    expect(regionFromLocale('en')).toBeNull();
    expect(regionFromLocale('')).toBeNull();
    expect(regionFromLocale(null)).toBeNull();
    expect(regionFromLocale(undefined)).toBeNull();
  });
});

describe('weightUnitForLocale', () => {
  it('pounds for the three regions that weigh people in pounds', () => {
    expect(weightUnitForLocale('en-US')).toBe('lb');
    expect(weightUnitForLocale('en-LR')).toBe('lb');
    expect(weightUnitForLocale('my-MM')).toBe('lb');
  });

  it('kilograms everywhere else, the UK included', () => {
    expect(weightUnitForLocale('en-GB')).toBe('kg');
    expect(weightUnitForLocale('en-AU')).toBe('kg');
    expect(weightUnitForLocale('de-DE')).toBe('kg');
    expect(weightUnitForLocale('fr-CA')).toBe('kg');
  });

  it('keeps the historical default when the region is unknown', () => {
    expect(weightUnitForLocale('en')).toBe('lb');
    expect(weightUnitForLocale(null)).toBe('lb');
  });
});
