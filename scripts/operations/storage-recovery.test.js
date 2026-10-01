import { describe, expect, it } from 'vitest';
import { planStorageRecovery } from './storage-recovery.mjs';

const now = Date.parse('2026-10-01T20:00:00Z');
const ref = 'afyoidxrshkmplxhcyeh';
const erased = { bucket_id: 'avatars', object_path: 'synthetic-user/erased.png' };
const retained = { bucket_id: 'clinical-attachments', object_path: 'synthetic-clinical' };
const exported = () => ({ capturedAt: new Date(now).toISOString(), sourceProjectRef: ref, complete: true, exclusions: [erased] });
describe('Storage backup recovery with independent erasure tombstones', () => {
  it('excludes old backup bytes already approved for deletion, preserving legally retained clinical bytes', () => {
    const plan = planStorageRecovery([erased, retained], exported(), ref, now);
    expect(plan.allowed).toEqual([retained]); expect(plan.excluded).toEqual([erased]); expect(plan.executed).toBe(false);
  });
  it.each([undefined, { ...exported(), complete: false }, { ...exported(), sourceProjectRef: 'x'.repeat(20) },
    { ...exported(), capturedAt: new Date(now - 16 * 60 * 1000).toISOString() },
    { ...exported(), capturedAt: new Date(now + 1).toISOString() }])('blocks absent, partial, foreign, stale or future erasure exports', exportData => {
    expect(() => planStorageRecovery([erased], exportData, ref, now)).toThrow('authoritative');
  });
  it('rejects traversal and duplicate restore identities', () => {
    expect(() => planStorageRecovery([{ ...erased, object_path: '../erased.png' }], exported(), ref, now)).toThrow('identity');
    expect(() => planStorageRecovery([erased, erased], exported(), ref, now)).toThrow('Duplicate');
  });
});
