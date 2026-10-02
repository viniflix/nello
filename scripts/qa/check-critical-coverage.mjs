import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const criticalFiles=['src/features/auth/authFlows.js','src/lib/utils/authRedirect.js','src/features/clinical-records/model/attachmentSchema.js','src/lib/utils/dri-energy.js','src/lib/utils/energy-calculations.js','src/lib/utils/energy-inputs.js','src/lib/utils/energy-numbers.js','src/lib/utils/energy-planning.js','src/lib/utils/nutrition-calculations.js','supabase/functions/confirm-document-asset/assetValidation.ts',...['arithmetic','energy','energy-plan','factors','document'].map(name=>`supabase/functions/_shared/clinical-${name}.js`)];
export function assertCriticalCoverage(summary){
 for(const file of criticalFiles){
  const entries=Object.entries(summary).filter(([key])=>key.replaceAll('\\','/').endsWith('/'+file));
  if(entries.length!==1)throw Error('Missing or ambiguous critical coverage: '+file);
  for(const [metric,minimum] of Object.entries({lines:90,statements:90,functions:90,branches:85})){
   const value=entries[0][1][metric];
   // A fully exercised delegating function can genuinely have no branches.
   // Lines/statements/functions must still exist; absent metrics remain errors.
   const noBranches=metric==='branches'&&value?.total===0&&value.covered===0&&value.pct===100;
   if(!value||!Number.isFinite(value.pct)||(!noBranches&&value.total<1)||value.pct<minimum)throw Error(`Critical coverage below policy: ${file} ${metric}`);
  }
 }
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){assertCriticalCoverage(JSON.parse(readFileSync('coverage/coverage-summary.json')));console.log(`Critical coverage verified for all ${criticalFiles.length} required source files; missing entries fail closed.`);}
