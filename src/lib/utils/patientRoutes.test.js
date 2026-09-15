import { describe, expect, it } from 'vitest';
import { isUuid } from './patientRoutes';

describe('isUuid', () => {
  it('accepts normalized UUID-shaped public identifiers', () => {
    expect(isUuid(' 8c1a43d1-7d51-4e2f-86c5-2bd4f672d752 ')).toBe(true);
  });

  it.each([
    '',
    'bughunt-invalid-token',
    '8c1a43d1-7d51-4e2f-86c5',
    '../../admin',
    null,
  ])('rejects malformed identifier %s before an RPC cast', (value) => {
    expect(isUuid(value)).toBe(false);
  });
});
