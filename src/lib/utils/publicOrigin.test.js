import { describe, expect, it } from 'vitest';
import { PRODUCTION_ORIGIN, publicOrigin } from './publicOrigin';

describe('public link origin', () => {
  it.each([
    'https://old.example', 'https://www.old.example',
    'https://www.nellonutri.com.br', 'https://preview.vercel.app', 'invalid',
  ])('uses the canonical domain for deployed links from %s', (origin) => {
    expect(publicOrigin(origin)).toBe(PRODUCTION_ORIGIN);
  });

  it.each(['http://localhost:5173', 'http://127.0.0.1:4173'])(
    'preserves local development on %s', (origin) => {
      expect(publicOrigin(origin)).toBe(origin);
    },
  );
});
