import { describe, expect, it } from 'vitest';
import { isCurrentMeasurement, isSameMeasurementRevision } from './anthropometry-history';

describe('corrected anthropometry history', () => {
  const original = { id: 87, revision_group_id: 87, is_latest_revision: false, record_date: '2026-07-30' };
  const corrected = { id: 115, supersedes_record_id: 87, revision_group_id: 87, is_latest_revision: true, record_date: '2026-07-30' };
  const laterMeasurement = { id: 120, revision_group_id: 120, is_latest_revision: true, record_date: '2026-08-30' };

  it('keeps only current revisions in longitudinal charts', () => {
    expect([original, corrected, laterMeasurement].filter(isCurrentMeasurement)).toEqual([corrected, laterMeasurement]);
  });
  it('does not call a correction on the same date clinical progress', () => {
    expect(isSameMeasurementRevision(original, corrected)).toBe(true);
    expect(isSameMeasurementRevision(corrected, laterMeasurement)).toBe(false);
    expect(isSameMeasurementRevision({ id: 1 }, { id: 2 })).toBe(false);
  });
});
