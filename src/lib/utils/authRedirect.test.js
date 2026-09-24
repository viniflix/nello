import { describe, expect, it } from 'vitest';
import { safeAuthRedirect } from './authRedirect';

describe('safe authentication redirects', () => {
  const origin = 'https://nellonutri.com.br';
  const recovery = '/update-password?mode=recovery';
  it.each([origin, 'https://www.nellonutri.com.br'])(
    'keeps current-domain destinations local: %s', (host) => {
      expect(safeAuthRedirect(`${host}/update-password?mode=invite#finish`, origin))
        .toBe('/update-password?mode=invite#finish');
    },
  );
  it.each([
    'https://evil.example/login', '//evil.example', '/%2Fevil.example', '/\\evil.example',
    `${'java'}script:alert(1)`, 'https://user:pass@old.example/update-password?mode=recovery',
    'http://old.example/update-password?mode=recovery',
    'https://old.example.evil.example/update-password?mode=recovery',
    'https://old.example:444/update-password?mode=recovery',
    'https://old.example/update-password?mode=invite&next=recovery',
    'https://old.example/%2F%2Fevil.example',
  ])(
    'rejects unsafe destinations: %s', (value) => {
      expect(safeAuthRedirect(value, origin, recovery)).toBe(recovery);
    },
  );
  it('supports local development and relative links', () => {
    expect(safeAuthRedirect('http://localhost:5173/login', 'http://localhost:5173')).toBe('/login');
    expect(safeAuthRedirect('/update-password', origin)).toBe('/update-password');
    expect(safeAuthRedirect('https://old.example/patient', 'https://old.example')).toBe('/login');
  });
});
