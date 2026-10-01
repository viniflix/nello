import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export function candidateMigrations() {
  const manifest=JSON.parse(readFileSync('operations/backend/wave02-candidates.json','utf8'));
  const identity=JSON.parse(readFileSync('operations/backend/wave04-candidates.json','utf8'));
  if(identity.schemaVersion!==1||!Array.isArray(identity.migrations))throw Error('Invalid identity migration manifest');
  const authorization=JSON.parse(readFileSync('operations/backend/wave05-candidates.json','utf8'));
  if(authorization.schemaVersion!==1||!Array.isArray(authorization.migrations))throw Error('Invalid authorization migration manifest');
  manifest.migrations.push(...identity.migrations,...authorization.migrations);
  if(manifest.schemaVersion!==1||!Array.isArray(manifest.migrations))throw Error('Invalid candidate migration manifest');
  return manifest.migrations.map(({file,sha256})=>{
    if(!/^supabase\/migrations\/(releases|applied)\/\d{14}_(restrict_anonymous_clinical_table_privileges|document_source_replacement_boundary|clinical_adversarial_boundaries|wave04_identity_onboarding|wave05_authorization_boundaries)\.sql$/.test(file))throw Error('Unexpected candidate migration');
    const content=readFileSync(file,'utf8');
    if(createHash('sha256').update(content).digest('hex')!==sha256)throw Error('Candidate migration checksum mismatch');
    return {file,sha256,content};
  });
}
