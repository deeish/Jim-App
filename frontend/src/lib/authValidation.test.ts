import {
  MIN_PASSWORD_LENGTH,
  isValidEmail,
  validateEmail,
  validatePassword,
  mapAuthError,
} from './authValidation';

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('  trimmed@example.com  ')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
    expect(isValidEmail('spaces in@email.com')).toBe(false);
  });
});

describe('validateEmail', () => {
  it('returns a message for empty and invalid input', () => {
    expect(validateEmail('')).toBe('Email is required');
    expect(validateEmail('nope')).toBe('Please enter a valid email address');
  });

  it('returns null for valid input', () => {
    expect(validateEmail('you@example.com')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('requires a non-empty password', () => {
    expect(validatePassword('')).toBe('Password is required');
  });

  it('enforces the minimum length', () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  });

  it('accepts a password at the minimum length', () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });
});

describe('mapAuthError', () => {
  it('maps known Supabase errors to friendly copy', () => {
    expect(mapAuthError('Invalid login credentials')).toBe(
      'Email or password is incorrect.',
    );
    expect(mapAuthError('Email not confirmed')).toMatch(/confirm your email/i);
    expect(mapAuthError('Email rate limit exceeded')).toMatch(/too many/i);
  });

  it('falls back to a generic message when empty', () => {
    expect(mapAuthError(undefined)).toBe('Something went wrong. Please try again.');
    expect(mapAuthError(null)).toBe('Something went wrong. Please try again.');
  });

  it('passes through unknown messages unchanged', () => {
    expect(mapAuthError('Some other error')).toBe('Some other error');
  });
});
