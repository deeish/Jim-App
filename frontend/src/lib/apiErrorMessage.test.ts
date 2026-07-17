import { apiErrorMessage } from './apiErrorMessage';

describe('apiErrorMessage', () => {
  it('prefers the backend message', () => {
    expect(
      apiErrorMessage(
        { response: { data: { message: 'Share code not found.' } } },
        'fallback',
      ),
    ).toBe('Share code not found.');
  });

  it('joins ValidationPipe string arrays', () => {
    expect(
      apiErrorMessage(
        { response: { data: { message: ['kind must be plan', 'bad id'] } } },
        'fallback',
      ),
    ).toBe('kind must be plan\nbad id');
  });

  it('falls back to the error message, then the fallback', () => {
    expect(apiErrorMessage(new Error('Network Error'), 'fallback')).toBe(
      'Network Error',
    );
    expect(apiErrorMessage({}, 'fallback')).toBe('fallback');
    expect(apiErrorMessage(null, 'fallback')).toBe('fallback');
    expect(
      apiErrorMessage({ response: { data: { message: [] } } }, 'fallback'),
    ).toBe('fallback');
  });
});
