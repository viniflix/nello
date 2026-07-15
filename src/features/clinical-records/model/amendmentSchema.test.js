import { describe, expect, it } from 'vitest';
import {
  AMENDMENT_STATUS_LABELS,
  compareSectionValues,
  normalizeImpact,
  recordDisplayStatus,
} from './amendmentSchema';

describe('clinical amendment display model', () => {
  it('provides explicit labels and preserves unknown statuses', () => {
    expect(AMENDMENT_STATUS_LABELS).toEqual(expect.objectContaining({
      draft: 'Correção em andamento',
      effective: 'Efetivada',
      abandoned: 'Abandonada',
      corrected: 'Corrigido',
      invalidated: 'Invalidado',
    }));
    expect(recordDisplayStatus({ status: 'corrected' })).toBe('Corrigido');
    expect(recordDisplayStatus({ status: 'custom_status' })).toBe('custom_status');
    expect(recordDisplayStatus(null)).toBe('Status indisponível');
  });

  it('identifies a signed record with a draft replacement as correction in progress', () => {
    expect(recordDisplayStatus({
      status: 'signed',
      amendment: { type: 'correction', status: 'draft', target_record_id: 'record-1' },
      id: 'record-1',
    })).toBe('Correção em andamento');
  });

  it('normalizes an impact snapshot into safe predictable defaults', () => {
    expect(normalizeImpact({
      record_id: 'record-1',
      root_record_id: 'root-1',
      chain_version: '2',
      care_episode_id: 'episode-1',
      episode_status: 'active',
      visibility: 'shared_with_patient',
      current_status: 'signed',
      has_patient_notice: true,
      known_references: [{ type: 'goal', id: 'goal-1' }],
      known_reference_count: 99,
      impact_hash: 'hash-1',
    })).toEqual({
      recordId: 'record-1',
      rootRecordId: 'root-1',
      chainVersion: 2,
      careEpisodeId: 'episode-1',
      episodeStatus: 'active',
      visibility: 'shared_with_patient',
      currentStatus: 'signed',
      hasPatientNotice: true,
      knownReferences: [{ type: 'goal', id: 'goal-1' }],
      knownReferenceCount: 1,
      impactHash: 'hash-1',
    });

    expect(normalizeImpact(null)).toEqual({
      recordId: null,
      rootRecordId: null,
      chainVersion: null,
      careEpisodeId: null,
      episodeStatus: null,
      visibility: null,
      currentStatus: null,
      hasPatientNotice: false,
      knownReferences: [],
      knownReferenceCount: 0,
      impactHash: null,
    });
  });
});

describe('compareSectionValues', () => {
  it.each([
    ['<p><br></p>', '  ', 'unchanged'],
    ['', '<p>Nova informação</p>', 'added'],
    ['<div>Anterior</div>', '&nbsp;', 'removed'],
    ['<p>Antes</p>', '<p>Depois</p>', 'changed'],
    ['<p>Igual</p>', '<p>Igual</p>', 'unchanged'],
  ])('classifies %s versus %s as %s', (left, right, expected) => {
    expect(compareSectionValues(left, right)).toBe(expected);
  });
});
