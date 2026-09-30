import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export function candidateMigrations() {
  const manifest=JSON.parse(readFileSync('operations/backend/wave02-candidates.json','utf8'));
  if(manifest.schemaVersion!==1||!Array.isArray(manifest.migrations))throw Error('Invalid candidate migration manifest');
  return manifest.migrations.map(({file,sha256})=>{
    if(!/^supabase\/migrations\/(releases|applied)\/\d{14}_restrict_anonymous_clinical_table_privileges\.sql$/.test(file))throw Error('Unexpected candidate migration');
    const content=readFileSync(file,'utf8');
    if(createHash('sha256').update(content).digest('hex')!==sha256)throw Error('Candidate migration checksum mismatch');
    return {file,sha256,content};
  });
}
