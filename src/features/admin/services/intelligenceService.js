import {executeRead,readPolicies} from '@/lib/utils/readPolicy';
import { adminReadRpc, adminReadInvoke } from './adminRead';
import {supabase} from '@/infrastructure/supabase/client';
import {validateIntelligenceSource} from '@/portals/admin/model/intelligence';
import {validHealth} from '@/lib/utils/healthContract';
export async function intelligenceOverview(kind='decision',page=1,options){
 const result=await adminReadRpc('admin_intelligence_overview',{p_kind:kind,p_page:page},options);if(result.error)return result;
 try{return {...result,data:validateIntelligenceSource(result.data)};}catch(error){return {data:null,error};}
}
export const intelligenceSave=({kind,id,revision,nonce,payload,reason})=>supabase.rpc('admin_intelligence_save',{p_kind:kind,p_id:id,p_revision:revision,p_nonce:nonce,p_payload:payload,p_reason:reason});
export const intelligenceMute=({key,revision,hours,nonce,reason})=>supabase.rpc('admin_intelligence_mute',{p_key:key,p_revision:revision,p_hours:hours,p_nonce:nonce,p_reason:reason});
export const intelligenceHistory=(id,page=1,options)=>adminReadRpc('admin_intelligence_history',{p_id:id,p_page:page},options);
export async function intelligenceReleases(cursor=null,options){
 const result=await adminReadInvoke('sentry-proxy',{body:{action:'releases',limit:20,cursor:cursor||''}},options);if(result.error)return result;
 const value=result.data;
 if(value?.schema_version!==1||!Array.isArray(value.items)||value.items.length>20
  ||!Number.isFinite(Date.parse(value.generated_at))||!['available','not_configured'].includes(value.state)
  ||(value.next_cursor!==null&&!/^[0-9:]{1,100}$/.test(value.next_cursor))
  ||value.items.some(r=>!/^[a-f0-9]{40}$/.test(r.version)||!Number.isFinite(Date.parse(r.created_at))))return {data:null,error:Error('invalid_release_source')};
 return result;
}
export async function intelligenceHealth({signal}={}){
 try{
  return await executeRead(async budget => {
  const response=await fetch('/api/health',{cache:'no-store',headers:{Accept:'application/json'},signal:budget});
  if(![200,503].includes(response.status)||!response.headers.get('content-type')?.includes('application/json'))throw Error('health_unconfirmed');
  const value=await response.json();if(!validHealth(value)||(response.status===200)!==(value.status==='operational'))throw Error('health_unconfirmed');
  return {data:{...value,generated_at:value.checkedAt,data_through:value.checkedAt,source:'Sondagem pontual · /api/health'},error:null};
  }, {signal,policy:readPolicies.provider});
 }catch(error){return {data:null,error};}
}

export async function intelligenceContinuity(options){
 const result=await adminReadInvoke('sentry-proxy',{body:{action:'continuity'}},options);if(result.error)return result;
 const v=result.data,a=v?.assessment;
 if(v?.schema_version!==1||!Number.isFinite(Date.parse(v.generated_at))||!['available','not_configured','unavailable'].includes(v.state)
  ||(v.state==='available'&&(!a||!['covered','coverage_gap','budget_burning','warming_up'].includes(a.state)||typeof a.fresh!=='boolean'||typeof a.coverageGap!=='boolean'||!Array.isArray(a.alerts)||a.alerts.some(x=>!['fast','sustained'].includes(x))
  ||[5,30,60,360].some(n=>{const w=a.windows?.[n];return !w||typeof w.covered!=='boolean'||!Number.isSafeInteger(w.samples)||w.samples<0||(w.burnRate!==null&&(!Number.isFinite(w.burnRate)||w.burnRate<0));})))
  ||(v.state!=='available'&&a!==null))return {data:null,error:Error('invalid_continuity_source')};
 return result;
}
