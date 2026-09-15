import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260905224500_version_anamnesis_template_updates.sql'),
  'utf8',
);

describe('versionamento de templates de anamnese', () => {
  it('incrementa a versão em mudanças clínicas e ignora versão fornecida pelo cliente', () => {
    expect(migration).toContain('is distinct from row(old.title, old.description, old.sections)');
    expect(migration).toContain('new.version := old.version + 1');
    expect(migration).toContain('new.version := old.version;');
  });

  it('executa antes de cada atualização e não é chamável pelos papéis da aplicação', () => {
    expect(migration).toMatch(/before update on public\.anamnesis_templates/i);
    expect(migration).toMatch(/revoke all[\s\S]*from public, anon, authenticated/i);
  });
});
