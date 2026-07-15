import { describe, expect, it } from 'vitest';
import {
  buildProgressTimeline,
  getCurrentSharedClinicalRecords,
  sortNewestFirst,
} from './progressTimeline';

describe('progressTimeline', () => {
  it('sorts a copied array without mutating backend data', () => {
    const source = [
      { id: 'old', record_date: '2026-07-01' },
      { id: 'new', record_date: '2026-07-15' },
    ];

    expect(sortNewestFirst(source, 'record_date').map((item) => item.id)).toEqual(['new', 'old']);
    expect(source.map((item) => item.id)).toEqual(['old', 'new']);
  });

  it('keeps only the latest official version shared with the patient', () => {
    const records = [
      { id: 'v1', root_record_id: 'root', chain_version: 1, status: 'signed', visibility: 'shared_with_patient' },
      { id: 'v2', root_record_id: 'root', chain_version: 2, status: 'corrected', visibility: 'shared_with_patient', amendment: { type: 'correction', status: 'effective' } },
      { id: 'draft', root_record_id: 'draft', chain_version: 1, status: 'draft', visibility: 'shared_with_patient' },
      { id: 'private', root_record_id: 'private', chain_version: 1, status: 'signed', visibility: 'professional_private' },
    ];

    expect(getCurrentSharedClinicalRecords(records).map((item) => item.id)).toEqual(['v2']);
  });

  it('orders selected current clinical roots by encounter date, not chain version', () => {
    const records = [
      { id: 'older-v9', root_record_id: 'older', chain_version: 9, status: 'signed', visibility: 'shared_with_patient', encounter_at: '2026-07-01T10:00:00Z' },
      { id: 'newer-v1', root_record_id: 'newer', chain_version: 1, status: 'signed', visibility: 'shared_with_patient', encounter_at: '2026-07-15T10:00:00Z' },
    ];

    expect(getCurrentSharedClinicalRecords(records).map((item) => item.id)).toEqual(['newer-v1', 'older-v9']);
  });

  it('merges patient measurements, photos and safe clinical records by chronology', () => {
    const timeline = buildProgressTimeline({
      weightRecords: [
        { id: 'weight', record_date: '2026-07-10', weight: 75.2 },
        { id: 'measurement', record_date: '2026-07-09', circumferences: { waist: 82 } },
        { id: 'combined', record_date: '2026-07-08', weight: 75, height: 170 },
      ],
      glycemiaRecords: [{ id: 'glycemia', date: '2026-07-12T10:00:00Z', value: 96 }],
      photos: [{ id: 'photo', photo_date: '2026-07-11', photo_url: '/photo.jpg' }],
      clinicalRecords: [{ id: 'clinical', status: 'signed', visibility: 'shared_with_patient', encounter_at: '2026-07-13T10:00:00Z', record_type: 'follow_up' }],
    });

    expect(timeline.map((item) => item.id)).toEqual(['clinical', 'glycemia', 'photo', 'weight', 'measurement', 'combined']);
    expect(timeline.find((item) => item.id === 'clinical')).toMatchObject({ kind: 'clinical', readOnly: true });
    expect(timeline.find((item) => item.id === 'measurement')).toMatchObject({ kind: 'measurement' });
    expect(timeline.find((item) => item.id === 'combined')).toMatchObject({ kind: 'anthropometry' });
    expect(timeline.filter((item) => item.id === 'combined')).toHaveLength(1);
  });
});
