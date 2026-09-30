import { describe, expect, it } from 'vitest';
import { applicationRestoreList } from './restore-list.mjs';

describe('isolated application snapshot restore', () => {
  it('excludes only the single-database scheduler extension and its comment', () => {
    const lines = [
      '; archive',
      '2; 3079 17001 EXTENSION - pg_cron ',
      '99; 0 0 COMMENT - EXTENSION pg_cron ',
      '3; 3079 17002 EXTENSION - pgcrypto ',
      '4; 0 0 COMMENT - EXTENSION pgcrypto ',
      '5; 1255 17003 FUNCTION private pg_cron_report() postgres',
      '6; 0 0 ACL public clinical_records postgres',
      '7; 0 0 POLICY storage objects patient-files postgres',
      '8; 0 0 EVENT TRIGGER - pgrst_ddl_watch postgres',
    ];
    const restored = applicationRestoreList(lines.join('\n'));
    expect(restored.excluded).toEqual(lines.slice(1, 3));
    expect(restored.text.split('\n').slice(3)).toEqual(lines.slice(3));
  });
  it('refuses a changed or ambiguous archive instead of silently dropping objects', () => {
    expect(() => applicationRestoreList('3; 3079 17002 EXTENSION - pgcrypto ')).toThrow('found 0');
    expect(() => applicationRestoreList('2; 3079 1 EXTENSION - pg_cron\n3; 3079 2 EXTENSION - pg_cron')).toThrow('found 2');
  });
});
