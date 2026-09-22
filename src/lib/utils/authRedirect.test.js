import { describe, expect, it } from 'vitest';
import { safeAuthRedirect } from './authRedirect';

describe('authentication domain migration', () => {
  const origin = 'https://nellonutri.com.br';
  it.each(['https://hipozero.com.br', 'https://www.hipozero.com.br', origin, 'https://www.nellonutri.com.br'])(
    'keeps legacy and current email destinations local: %s', (host) => {
      expect(safeAuthRedirect(`${host}/update-password?mode=invite#finish`, origin))
        .toBe('/update-password?mode=invite#finish');
    },
  );
  it.each(['https://evil.example/login', '//evil.example', '/%2Fevil.example', '/\\evil.example', 'javascript:alert(1)', 'https://user:pass@hipozero.com.br/login'])(
    'rejects unsafe destinations: %s', (value) => {
      expect(safeAuthRedirect(value, origin, '/update-password?mode=recovery'))
        .toBe('/update-password?mode=recovery');
    },
  );
  it('supports local development and relative links', () => {
    expect(safeAuthRedirect('http://localhost:5173/login', 'http://localhost:5173')).toBe('/login');
    expect(safeAuthRedirect('/update-password', origin)).toBe('/update-password');
  });
});
