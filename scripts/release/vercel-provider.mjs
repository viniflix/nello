const projectId='prj_zbE0dJoJrygKzMBq6nG9o7NdVV3H',teamId='team_kCAILty1IGiFW2evFlF4Rmx5';
export function vercelProvider(token,{fetcher=fetch}={}){
 if(!token)throw Error('Vercel authentication required');
 const request=async(path,method='GET')=>{const r=await fetcher('https://api.vercel.com'+path+(path.includes('?')?'&':'?')+'teamId='+teamId,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Vercel operation failed: '+method+' HTTP '+r.status);const body=await r.text();return body.trim()?JSON.parse(body):{};};
 const valid=id=>{if(!/^dpl_[A-Za-z0-9]+$/.test(id))throw Error('Invalid deployment identifier');return id;};
 const current=async()=>{const alias=await request('/v4/aliases/nellonutri.com.br');const id=alias.deployment?.id||alias.deploymentId;if(!id)throw Error('Canonical domain deployment missing');return valid(id);};
 const waitFor=async id=>{const deadline=Date.now()+120000;while(Date.now()<deadline){if(await current()===id)return;await new Promise(resolve=>setTimeout(resolve,3000));}throw Error('Vercel domain assignment timed out');};
 return{current,inspect:async id=>{const d=await request('/v13/deployments/'+valid(id));if(d.projectId!==projectId)throw Error('Wrong Vercel project');return d;},promote:async id=>{await request('/v10/projects/'+projectId+'/promote/'+valid(id),'POST');await waitFor(id);},rollback:async id=>{await request('/v1/projects/'+projectId+'/rollback/'+valid(id),'POST');await waitFor(id);}};
}
