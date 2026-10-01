import { assertReleaseReady } from './readiness.mjs';
import {observeDeployment} from './observation.mjs';
export async function controlledRelease({sha,evidence,previous,candidate,provider,smoke,observe=observeDeployment,record=()=>{}}){
 assertReleaseReady(evidence,sha);
 if(!previous||previous===candidate||!/^dpl_[a-zA-Z0-9]+$/.test(previous)||!/^dpl_[a-zA-Z0-9]+$/.test(candidate))throw Error('Distinct immutable deployment IDs required');
 let productionVerified=false;
 try{
  const staged=await provider.inspect(candidate);
  if(staged.projectId!==evidence.project.id||staged.meta?.githubCommitSha!==sha||staged.readyState!=='READY'||staged.target!=='production')throw Error('A production deployment for the exact SHA is required');
  if(await provider.current()!==candidate)throw Error('The canonical domain must already serve the direct main deployment');
  const old=await provider.inspect(previous);if(old.projectId!==evidence.project.id||old.readyState!=='READY')throw Error('Rollback target is not ready in the same project');
  await smoke('https://'+old.url,{stage:'rollback-target'});
  // A failed recovery preflight is not evidence that the live release is broken.
  // Arm rollback only after a usable recovery target has been verified.
  productionVerified=true;
  await smoke('https://nellonutri.com.br',{stage:'production'});
  const observation=await observe('https://nellonutri.com.br',{smoke,durationMs:0,record});
  record({stage:'production-verified',sha,candidate,previous,observation});return {passed:true,candidate,observation};
 }catch(error){
  if(productionVerified){const current=await provider.current();if(current!==candidate&&current!==previous)throw Error('Production changed concurrently; automatic rollback stopped to preserve the other release');await provider.rollback(previous);await smoke('https://nellonutri.com.br',{stage:'rollback'});record({stage:'rolled-back',candidate,previous});}
  throw error;
 }
}
