import { resolveLegalUrl } from './legalUrls';

describe('resolveLegalUrl', () => {
  it('accepts a real https policy page', () => {
    expect(resolveLegalUrl('https://jim.app/privacy')).toBe('https://jim.app/privacy');
    expect(resolveLegalUrl('  https://jim.app/terms  ')).toBe('https://jim.app/terms');
  });

  it('treats an unset or blank var as no page', () => {
    expect(resolveLegalUrl(undefined)).toBeNull();
    expect(resolveLegalUrl(null)).toBeNull();
    expect(resolveLegalUrl('')).toBeNull();
    expect(resolveLegalUrl('   ')).toBeNull();
  });

  it('rejects the placeholder hosts that used to ship as the fallback', () => {
    expect(resolveLegalUrl('https://example.com/privacy')).toBeNull();
    expect(resolveLegalUrl('https://www.example.com/terms')).toBeNull();
    expect(resolveLegalUrl('https://EXAMPLE.COM/privacy')).toBeNull();
    expect(resolveLegalUrl('https://localhost:8080/privacy')).toBeNull();
  });

  it('rejects anything that is not https', () => {
    expect(resolveLegalUrl('http://jim.app/privacy')).toBeNull();
    expect(resolveLegalUrl('jim.app/privacy')).toBeNull();
    expect(resolveLegalUrl('javascript:alert(1)')).toBeNull();
  });

  it('reads the host past userinfo and port so a placeholder cannot hide there', () => {
    expect(resolveLegalUrl('https://user@example.com/privacy')).toBeNull();
    expect(resolveLegalUrl('https://jim.app:443/privacy')).toBe('https://jim.app:443/privacy');
  });

  it('does not mistake a placeholder-looking path for a placeholder host', () => {
    expect(resolveLegalUrl('https://jim.app/example.com/privacy')).toBe(
      'https://jim.app/example.com/privacy',
    );
  });
});
