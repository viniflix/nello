// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { applicationRewrites } from './routes.mjs';

it('keeps every Auth, invitation, clinical and public deep link deployable without a catch-all', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  expect(config.rewrites).toEqual(applicationRewrites());
  const sources = config.rewrites.map(row => row.source);
  expect(sources).toEqual(expect.arrayContaining(['/auth/v1/verify', '/convite', '/update-password', '/f/:token', '/verificar-documento/:code?', '/status']));
  expect(sources.some(source => source.includes('*') || source.startsWith('/api') || source.startsWith('/assets'))).toBe(false);
});
