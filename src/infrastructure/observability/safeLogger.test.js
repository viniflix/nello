import { afterEach, expect, it, vi } from 'vitest';
import { logDiagnostic } from './safeLogger';
afterEach(() => vi.restoreAllMocks());

it('retains useful technical metadata without serializing clinical records or secrets', () => {
  const output = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = Object.assign(new Error('private-patient secret-token'), { code: '42501', status: 403, details: 'clinical-note', request: { password: 'secret-token' } });
  logDiagnostic('error', 'supabase/query.js:12', 'private-patient', error);
  expect(output).toHaveBeenCalledWith('[Nello] Technical diagnostic', { operation: 'supabase/query.js:12', code: '42501', name: 'Error', status: 403 });
  expect(JSON.stringify(output.mock.calls)).not.toMatch(/private-patient|secret-token|clinical-note/);
});

it('rejects uncontrolled codes, error names, operations and status values', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(logDiagnostic('warn', 'patient@example.invalid', { code: 'PATIENT_NAME', name: 'Clinical diagnosis', status: 'private', message: 'note' })).toEqual({ operation: 'unknown_operation' });
});

it('preserves correlation from the existing remote capture without emitting another event', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const correlationId = '3a5ca0b8-5049-4db1-bd2a-d53345d063b2';
  expect(logDiagnostic('error', 'supabase/query.js:20', { correlationId })).toEqual({ operation: 'supabase/query.js:20', correlationId });
});
