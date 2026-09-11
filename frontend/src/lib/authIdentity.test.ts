import {
  describeAccountEmail,
  digitsOnly,
  formatAppleFullName,
  formatCountdown,
  isCompleteOtp,
  isPrivateRelayEmail,
  mapCodeError,
  nameFromEmail,
  normalizeEmail,
} from './authIdentity';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Dylan@Example.COM ')).toBe('dylan@example.com');
  });
});

describe('isPrivateRelayEmail', () => {
  it('detects Hide My Email addresses case-insensitively', () => {
    expect(isPrivateRelayEmail('k7x2m9q4p@privaterelay.appleid.com')).toBe(true);
    expect(isPrivateRelayEmail('K7X@PrivateRelay.AppleID.com')).toBe(true);
  });
  it('is false for ordinary, empty and malformed values', () => {
    expect(isPrivateRelayEmail('dylan@example.com')).toBe(false);
    expect(isPrivateRelayEmail('')).toBe(false);
    expect(isPrivateRelayEmail(null)).toBe(false);
    expect(isPrivateRelayEmail('no-at-sign')).toBe(false);
  });
});

describe('nameFromEmail', () => {
  it('returns the local part for a normal address', () => {
    expect(nameFromEmail('dylan@example.com')).toBe('dylan');
  });
  it('returns undefined for a relay address (the local part is a hash)', () => {
    expect(nameFromEmail('k7x2m9q4p@privaterelay.appleid.com')).toBeUndefined();
  });
  it('returns undefined for missing or malformed values', () => {
    expect(nameFromEmail(undefined)).toBeUndefined();
    expect(nameFromEmail('@example.com')).toBeUndefined();
    expect(nameFromEmail('nope')).toBeUndefined();
  });
});

describe('describeAccountEmail', () => {
  it('names a hidden Apple email instead of showing the hash', () => {
    expect(describeAccountEmail('k7x2m9q4p@privaterelay.appleid.com')).toBe('Apple ID · email hidden');
  });
  it('passes a normal email through and explains a missing one', () => {
    expect(describeAccountEmail('dylan@example.com')).toBe('dylan@example.com');
    expect(describeAccountEmail(null)).toBe('No email on this account');
  });
});

describe('formatAppleFullName', () => {
  it('joins given and family names', () => {
    expect(formatAppleFullName({ givenName: 'Dylan', familyName: 'Smith' })).toBe('Dylan Smith');
  });
  it('copes with a single part and trims', () => {
    expect(formatAppleFullName({ givenName: ' Dylan ', familyName: null })).toBe('Dylan');
  });
  it('returns null when Apple sent nothing (every sign-in after the first)', () => {
    expect(formatAppleFullName(null)).toBeNull();
    expect(formatAppleFullName({ givenName: null, familyName: null })).toBeNull();
    expect(formatAppleFullName({ givenName: '  ', familyName: '' })).toBeNull();
  });
});

describe('digitsOnly / isCompleteOtp', () => {
  it('strips everything but digits and caps at six', () => {
    expect(digitsOnly('482 913')).toBe('482913');
    expect(digitsOnly('4829137')).toBe('482913');
    expect(digitsOnly('abc')).toBe('');
  });
  it('is complete only at exactly six digits', () => {
    expect(isCompleteOtp('482913')).toBe(true);
    expect(isCompleteOtp('48291')).toBe(false);
    expect(isCompleteOtp('48291a')).toBe(false);
  });
});

describe('formatCountdown', () => {
  it('formats m:ss and clamps below zero', () => {
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('mapCodeError', () => {
  it('maps Supabase OTP errors to plain copy', () => {
    expect(mapCodeError('Token has expired or is invalid')).toMatch(/wrong or has expired/);
    expect(mapCodeError('email rate limit exceeded')).toMatch(/Too many attempts/);
    expect(mapCodeError('Signups not allowed for otp')).toMatch(/could not find an account/);
  });
  it('returns null for anything it does not recognise, so the caller can fall back', () => {
    expect(mapCodeError('Something else')).toBeNull();
    expect(mapCodeError(null)).toBeNull();
  });
});
