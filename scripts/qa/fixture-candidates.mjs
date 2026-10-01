import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export function applyFixtureCandidates(sql, migrations, read = readFileSync) {
  for (const migration of migrations) {
    const name = path.basename(migration.file);
    const version = name.slice(0, 14);
    if (!/^\d{14}$/.test(version)) throw Error('Invalid candidate version');
    const applied = sql(`select count(*) from supabase_migrations.schema_migrations where version='${version}';`).trim();
    if (applied === '0') sql(migration.content);
    else if (applied === '1') {
      const bytes = read(path.join('.backend-ci/supabase/migrations', name));
      if (createHash('sha256').update(bytes).digest('hex') !== migration.sha256) throw Error('Applied fixture migration checksum mismatch');
    } else throw Error('Unexpected migration history');
  }
}
