import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260905193500_fix_submit_anamnesis_profile_flags.sql'),
  'utf8',
);

describe('correção da submissão pública de anamnese', () => {
  it('atualiza flags sem depender de user_profiles.updated_at', () => {
    const profileUpdate = migration.match(/update public\.user_profiles[\s\S]*?where id = v_record\.patient_id;/i)?.[0] || '';
    expect(profileUpdate).toContain("set clinical_flags = coalesce(clinical_flags, '{}'::jsonb) || v_flags");
    expect(profileUpdate).not.toContain('updated_at');
  });

  it('preserva consentimento, expiração e estados finais', () => {
    expect(migration).toContain("p_status not in ('draft', 'submitted')");
    expect(migration).toContain('r.token_expires_at >= now()');
    expect(migration).toContain("r.status not in ('submitted', 'validated')");
    expect(migration).toContain('LGPD_CONSENT_REQUIRED');
  });

  it('impede que um autosave concorrente reabra uma anamnese concluída', () => {
    expect(migration).toMatch(/where id = v_record\.id\s+and status not in \('submitted', 'validated'\)/i);
    expect(migration).toContain("raise exception 'ALREADY_COMPLETED'");
  });
});
