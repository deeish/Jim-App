import {
  buildShareMessage,
  buildShareUrl,
  parseShareCodeFromUrl,
} from './shareLinks';

describe('buildShareUrl', () => {
  it('uses a path segment, never a code query param', () => {
    expect(buildShareUrl('7XKFQ2ND')).toBe('jimapp://share/7XKFQ2ND');
    expect(buildShareUrl('7XKFQ2ND')).not.toContain('?');
  });
});

describe('buildShareMessage', () => {
  it('contains both the deep link and the typed-code fallback', () => {
    const message = buildShareMessage({
      kind: 'plan',
      name: 'Push Pull Legs',
      code: '7XKFQ2ND',
    });
    expect(message).toContain('jimapp://share/7XKFQ2ND');
    expect(message).toContain('7XKF-Q2ND');
    expect(message).toContain('"Push Pull Legs"');
    expect(message).toContain('workout plan');
  });

  it('describes single workouts as such', () => {
    const message = buildShareMessage({
      kind: 'workout',
      name: 'Heavy Upper',
      code: '7XKFQ2ND',
    });
    expect(message).toContain('a workout');
    expect(message).not.toContain('workout plan');
  });
});

describe('parseShareCodeFromUrl', () => {
  it('parses the canonical share link', () => {
    expect(parseShareCodeFromUrl('jimapp://share/7XKFQ2ND')).toBe('7XKFQ2ND');
  });

  it('parses variants: extra slash, trailing slash, dashes, lowercase, query/hash', () => {
    expect(parseShareCodeFromUrl('jimapp:///share/7XKFQ2ND')).toBe('7XKFQ2ND');
    expect(parseShareCodeFromUrl('jimapp://share/7XKFQ2ND/')).toBe('7XKFQ2ND');
    expect(parseShareCodeFromUrl('jimapp://share/7xkf-q2nd')).toBe('7XKFQ2ND');
    expect(parseShareCodeFromUrl('JIMAPP://Share/7XKFQ2ND')).toBe('7XKFQ2ND');
    expect(parseShareCodeFromUrl('jimapp://share/7XKFQ2ND?utm=x#y')).toBe(
      '7XKFQ2ND',
    );
  });

  it('parses Expo Go dev-client links', () => {
    expect(
      parseShareCodeFromUrl('exp://192.168.1.5:8081/--/share/7XKFQ2ND'),
    ).toBe('7XKFQ2ND');
    expect(parseShareCodeFromUrl('exp://192.168.1.5:8081/share/7XKFQ2ND')).toBe(
      null,
    );
  });

  it('never touches Supabase auth links', () => {
    expect(
      parseShareCodeFromUrl('jimapp://auth/reset?code=abc123'),
    ).toBeNull();
    expect(
      parseShareCodeFromUrl(
        'https://jmfshcpgtuqdjmtpexqg.supabase.co/auth/v1/verify?code=x',
      ),
    ).toBeNull();
  });

  it('rejects non-share and malformed URLs', () => {
    expect(parseShareCodeFromUrl('')).toBeNull();
    expect(parseShareCodeFromUrl('jimapp://')).toBeNull();
    expect(parseShareCodeFromUrl('jimapp://share')).toBeNull();
    expect(parseShareCodeFromUrl('jimapp://share/short')).toBeNull();
    expect(parseShareCodeFromUrl('jimapp://share/7XKFQ2ND/extra')).toBeNull();
    expect(parseShareCodeFromUrl('jimapp://plans/7XKFQ2ND')).toBeNull();
    expect(parseShareCodeFromUrl('https://example.com/share/7XKFQ2ND')).toBe(
      null,
    );
  });
});
