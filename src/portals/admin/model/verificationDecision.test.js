import { describe, expect, it } from 'vitest';
import { validateVerificationQueue, verificationDecision } from './verificationDecision';

const now = Date.parse('2026-10-07T12:00:00Z');
const verification = { id: 'synthetic', status: 'pending', professional_role: 'nutritionist', updated_at: '2026-10-07T10:00:00Z' };
const request = { verification, decision: 'approved', reason: 'Fonte conferida manualmente', sourceUrl: 'https://cfn.org.br/', validUntil: '2027-01-07' };
describe('administrative verification decisions', () => {
  it('uses explicit Fortaleza civil-day validity and retains the expected revision', () => {
    expect(verificationDecision(request, now)).toMatchObject({ expected: verification.updated_at, validUntil: '2027-01-08T02:59:59.000Z' });
  });
  it('rejects missing/impossible/expired/excessive dates and embedded credentials', () => {
    for (const validUntil of ['', '2026-02-30', '2026-10-06', '2028-01-01', 'not-a-date']) expect(() => verificationDecision({ ...request, validUntil }, now)).toThrow();
    for (const sourceUrl of ['http://cfn.org.br/', 'https://key@cfn.org.br/', ['javascript', 'alert(1)'].join(':'), 'https://cfn.org.br/\n']) {
      // Trailing whitespace is intentionally trimmed; control characters inside a URL are rejected.
      if (sourceUrl.endsWith('\n')) expect(verificationDecision({ ...request, sourceUrl }, now).sourceUrl).toBe('https://cfn.org.br/');
      else expect(() => verificationDecision({ ...request, sourceUrl }, now)).toThrow();
    }
    expect(() => verificationDecision({ ...request, sourceUrl: 'https://cfn.org.br/a\nb' }, now)).toThrow();
    expect(() => verificationDecision({ ...request, verification: { ...verification, professional_role: 'student' }, validUntil: '2027-05-01' }, now)).toThrow();
  });
  it('limits transitions and refuses a missing revision; ignores approval-only fields for a rejection', () => {
    for (const status of ['expired', 'rejected', 'suspended', 'needs_information', 'not_submitted']) expect(() => verificationDecision({ ...request, verification: { ...verification, status } }, now)).toThrow();
    expect(() => verificationDecision({ ...request, verification: { ...verification, updated_at: null } }, now)).toThrow();
    expect(() => verificationDecision({ ...request, decision: 'suspended' }, now)).toThrow();
    expect(verificationDecision({ ...request, decision: 'rejected', sourceUrl: '', validUntil: '' }, now)).toMatchObject({ sourceUrl: null, validUntil: null });
    expect(verificationDecision({ ...request, decision: 'suspended', verification: { ...verification, status: 'approved' } }, now).decision).toBe('suspended');
  });
  it('rejects malformed source permissions, duplicate items and absent revisions', () => {
    const queue = { schema_version: 1, generated_at: verification.updated_at, source: 'Synthetic SQL', can_write: false, page: 1, page_size: 20, total: 1, items: [verification] };
    expect(validateVerificationQueue(queue)).toBe(queue);
    for (const changed of [{ can_write: 'true' }, { total: -1 }, { items: [{ ...verification, updated_at: null }] }, { total: 2, items: [verification, verification] }, { items: Array(21).fill(verification) }]) expect(() => validateVerificationQueue({ ...queue, ...changed })).toThrow();
  });
});
