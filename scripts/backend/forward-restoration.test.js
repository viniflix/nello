import { describe, expect, it } from 'vitest';
import { assertForwardRestoration } from './forward-restoration.mjs';
const now = Date.parse('2026-09-30T14:30:00Z');
const restoration = { applicationCatalogMatched: true, productionData: false,
  database: 'nello_qa_wave02_template', guard: 'supabase_admin:0', capturedAt: '2026-09-30T14:29:00Z' };
describe('forward release validation database boundary', () => {
  it('accepts only the independently matched fresh empty-account template', () => {
    expect(() => assertForwardRestoration(restoration,now)).not.toThrow();
  });
  it.each([
    { applicationCatalogMatched: false }, { productionData: true }, { database: 'postgres' },
    { guard: 'supabase_admin:1' }, { guard: 'postgres:0' },
    { capturedAt: 'invalid' }, { capturedAt: '2026-09-30T14:31:00Z' },
    { capturedAt: '2026-09-30T14:00:00Z' },
  ])('blocks unsafe or unverifiable restoration: %j', override => {
    expect(() => assertForwardRestoration({ ...restoration,...override },now)).toThrow('Verified fresh synthetic');
  });
});
