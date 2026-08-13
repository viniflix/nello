import { describe, expect, it } from 'vitest';
import { buildPortabilityIndex, portabilityIndexToCsv, safeFilename, summarizePortabilitySnapshot } from './export-package';

const snapshot = {
  categories: {
    clinical_records: [{ id: '1', status: 'signed', record_type: 'evolution', created_at: '2026-08-13' }],
    goals: [{ id: '2', goal_type: 'weight', created_at: '2026-08-12' }],
  },
  attachment_manifest: [{ id: 'a' }],
};

describe('C7 portability package', () => {
  it('builds a deterministic, localized CSV index', () => {
    expect(buildPortabilityIndex(snapshot)).toHaveLength(2);
    const csv = portabilityIndexToCsv(snapshot);
    expect(csv).toContain('"categoria";"identificador"');
    expect(csv).toContain('"clinical_records";"1"');
  });

  it('summarizes records and attachments without altering source data', () => {
    expect(summarizePortabilitySnapshot(snapshot)).toMatchObject({ recordCount: 2, attachmentCount: 1 });
  });

  it('removes traversal and unsafe filename characters', () => {
    expect(safeFilename('../../laudo médico?.pdf')).toBe('..-..-laudo-medico-.pdf');
  });
});
