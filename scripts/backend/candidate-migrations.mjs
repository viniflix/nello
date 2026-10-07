import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export function candidateMigrations() {
  const manifest=JSON.parse(readFileSync('operations/backend/wave02-candidates.json','utf8'));
  const identity=JSON.parse(readFileSync('operations/backend/wave04-candidates.json','utf8'));
  if(identity.schemaVersion!==1||!Array.isArray(identity.migrations))throw Error('Invalid identity migration manifest');
  const authorization=JSON.parse(readFileSync('operations/backend/wave05-candidates.json','utf8'));
  if(authorization.schemaVersion!==1||!Array.isArray(authorization.migrations))throw Error('Invalid authorization migration manifest');
  const web=JSON.parse(readFileSync('operations/backend/wave06-candidates.json','utf8'));
  if(web.schemaVersion!==1||!Array.isArray(web.migrations))throw Error('Invalid web boundary manifest');
  const repairs=JSON.parse(readFileSync('operations/backend/post06-candidates.json','utf8'));
  if(repairs.schemaVersion!==1||!Array.isArray(repairs.migrations))throw Error('Invalid post06 repair manifest');
  const storage=JSON.parse(readFileSync('operations/backend/wave07-candidates.json','utf8'));
  if(storage.schemaVersion!==1||!Array.isArray(storage.migrations))throw Error('Invalid storage migration manifest');
  const realtime=JSON.parse(readFileSync('operations/backend/wave08-candidates.json','utf8'));
  if(realtime.schemaVersion!==1||!Array.isArray(realtime.migrations))throw Error('Invalid Realtime manifest');
  const integrity=JSON.parse(readFileSync('operations/backend/wave09-candidates.json','utf8'));
  if(integrity.schemaVersion!==1||!Array.isArray(integrity.migrations))throw Error('Invalid data integrity manifest');
  const clinical=JSON.parse(readFileSync('operations/backend/wave10-candidates.json','utf8'));
  if(clinical.schemaVersion!==1||!Array.isArray(clinical.migrations))throw Error('Invalid clinical calculation manifest');
  const performance=JSON.parse(readFileSync('operations/backend/wave12-candidates.json','utf8'));
  if(performance.schemaVersion!==1||!Array.isArray(performance.migrations))throw Error('Invalid performance manifest');
  const feed=JSON.parse(readFileSync('operations/backend/feed-candidates.json','utf8'));
  const nutrition=JSON.parse(readFileSync('operations/backend/nutrition-editor-candidates.json','utf8'));
  const admin=JSON.parse(readFileSync('operations/backend/admin-candidates.json','utf8'));
  if(admin.schemaVersion!==1||!Array.isArray(admin.migrations))throw Error('Invalid admin workspace manifest');
  if(nutrition.schemaVersion!==1||!Array.isArray(nutrition.migrations))throw Error('Invalid nutrition editor manifest');
  if(feed.schemaVersion!==1||!Array.isArray(feed.migrations))throw Error('Invalid feed scope manifest');
  manifest.migrations.push(...identity.migrations,...authorization.migrations,...web.migrations,...repairs.migrations,...storage.migrations,...realtime.migrations,...integrity.migrations,...clinical.migrations,...performance.migrations,...feed.migrations,...nutrition.migrations,...admin.migrations);
  if(manifest.schemaVersion!==1||!Array.isArray(manifest.migrations))throw Error('Invalid candidate migration manifest');
  return manifest.migrations.map(({file,sha256})=>{
    if(!/^supabase\/migrations\/(releases|applied)\/\d{14}_(restrict_anonymous_clinical_table_privileges|document_source_replacement_boundary|clinical_adversarial_boundaries|wave04_identity_onboarding|wave05_authorization_boundaries|wave06_edge_quotas|post06_clinical_and_invitation_repairs|wave07_private_storage|wave08_private_realtime|wave09_data_integrity|wave10_clinical_calculation_contract|wave12_bounded_queries|feed_active_care_scope|nutrition_editor_recovery|admin_operational_workspace|admin_triage_conflict_contract|admin_product_analytics)\.sql$/.test(file))throw Error('Unexpected candidate migration');
    const content=readFileSync(file,'utf8');
    if(createHash('sha256').update(content).digest('hex')!==sha256)throw Error('Candidate migration checksum mismatch');
    return {file,sha256,content};
  });
}
