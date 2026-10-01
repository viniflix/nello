import { describe, expect, it, vi } from 'vitest';
import { sanitizeCspReport } from '../../operations/security/csp-report.mjs';
import handler from '../../api/csp-report.js';

describe('CSP reporting privacy', () => {
  it('discards full URLs, clinical paths, tokens and script samples', () => {
    const result = sanitizeCspReport({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'https://patient.example?token=SECRET',
      'document-uri': 'https://nello.example/patient/PRIVATE', 'script-sample': 'CPF_PRIVATE', disposition: 'enforce' } });
    expect(result).toEqual([{ directive: 'script-src', category: 'url', disposition: 'enforce' }]);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|PRIVATE|https/);
  });
  it('accepts the Reporting API format without retaining its envelope', () => {
    expect(sanitizeCspReport([{ type: 'csp-violation', url: 'PRIVATE', body: { effectiveDirective: 'style-src-attr', blockedURL: 'inline', disposition: 'report' } }]))
      .toEqual([{ directive: 'style-src-attr', category: 'inline', disposition: 'report' }]);
  });
  it.each([null, {}, { 'csp-report': { 'effective-directive': 'SECRET_DATA' } }])('rejects arbitrary metadata: %j', input => {
    expect(sanitizeCspReport(input)).toEqual([]);
  });
  it.each([
    ['GET', {}, undefined, 405],
    ['POST', { 'content-type': 'text/plain' }, '{}', 415],
    ['POST', { 'content-type': 'application/csp-report' }, 'x'.repeat(4097), 413],
    ['POST', { 'content-type': 'application/csp-report' }, '{invalid', 400],
    ['POST', { 'content-type': 'application/csp-report' }, '{}', 204],
  ])('handles method, content type, byte cap and malformed JSON', async (method, headers, body, expected) => {
    const response = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), end: vi.fn() };
    await handler({ method, headers, body }, response);
    expect(response.status).toHaveBeenCalledWith(expected);
  });
});
