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
  it('handles pg_dump extension-member ACLs retained despite exclude-schema=cron', () => {
    const scheduler = [
      '6; 3079 17861 EXTENSION - pg_cron ',
      '7438; 0 0 COMMENT - EXTENSION pg_cron ',
      '7439; 0 0 ACL - SCHEMA cron supabase_admin',
      '7462; 0 0 ACL cron FUNCTION alter_job(job_id bigint, schedule text, command text, database text, username text, active boolean) supabase_admin',
      '7464; 0 0 ACL cron FUNCTION schedule(schedule text, command text) supabase_admin',
      '8017; 0 0 ACL cron TABLE job supabase_admin',
      '8018; 0 0 ACL cron TABLE job_run_details supabase_admin',
    ];
    const controls = [
      '7462; 0 0 ACL private FUNCTION schedule(schedule text, command text) postgres',
      '8017; 0 0 ACL public TABLE job postgres',
      '8018; 0 0 ACL storage TABLE objects supabase_storage_admin',
      '7488; 0 0 ACL extensions FUNCTION grant_pg_cron_access() supabase_admin',
      '4602; 3466 16650 EVENT TRIGGER - issue_pg_cron_access supabase_admin',
    ];
    const restored = applicationRestoreList([...scheduler, ...controls].join('\n'));
    expect(restored.excluded).toEqual(scheduler);
    expect(restored.text.split('\n').slice(scheduler.length)).toEqual(controls);
  });
});
