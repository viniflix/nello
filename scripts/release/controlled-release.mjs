import { assertReleaseReady } from './readiness.mjs';
export async function controlledRelease({sha,evidence,previous,candidate,provider,smoke,record=()=>{}}){
 assertReleaseReady(evidence,sha);
 if(!previous||previous===candidate||!/^dpl_[a-zA-Z0-9]+$/.test(previous)||!/^dpl_[a-zA-Z0-9]+$/.test(candidate))throw Error('Distinct immutable deployment IDs required');
 let promotionAttempted=false;
 try{
  const staged=await provider.inspect(candidate);
  if(staged.projectId!==evidence.project.id||staged.meta?.githubCommitSha!==sha||staged.readyState!=='READY'||staged.target!=='production'||staged.alias?.includes('nellonutri.com.br'))throw Error('An unpromoted production canary for the exact SHA is required');
  const old=await provider.inspect(previous);if(old.projectId!==evidence.project.id||old.readyState!=='READY')throw Error('Rollback target is not ready in the same project');
  await smoke('https://'+old.url,{stage:'rollback-target'});
  await smoke('https://'+staged.url,{stage:'canary'});record({stage:'canary-passed',sha,candidate,previous});
  promotionAttempted=true;await provider.promote(candidate);await smoke('https://nellonutri.com.br',{stage:'production',observationMinutes:30});record({stage:'production-verified',sha,candidate,previous});return {passed:true,candidate};
 }catch(error){
  if(promotionAttempted){await provider.rollback(previous);await smoke('https://nellonutri.com.br',{stage:'rollback'});record({stage:'rolled-back',candidate,previous});}
  throw error;
 }
}
