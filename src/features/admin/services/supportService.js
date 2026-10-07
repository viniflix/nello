import { supabase } from '@/infrastructure/supabase/client';
import { validateSupportSource } from '@/portals/admin/model/support';

async function source(name,args,kind){
 const result=await supabase.rpc(name,args);if(result.error)return result;
 try{return {...result,data:validateSupportSource(result.data,kind)};}catch{return {data:null,error:{code:'SUPPORT_SOURCE_INVALID'}};}
}
export const supportQueue = (status, page=1) => source('admin_support_queue',{p_status:status||null,p_page:page},'queue');
export const supportCase = (id,page=1) => source('admin_support_case',{p_id:id,p_page:page},'case');
export const supportCreate = ({subject,email,nonce}) => supabase.rpc('admin_support_create',{p_subject:subject,p_email:email,p_nonce:nonce});
export const supportUpdate = ({id,revision,nonce,status,category,module,issueId,reason}) => supabase.rpc('admin_support_update',{p_id:id,p_revision:revision,p_nonce:nonce,p_status:status,p_category:category,p_module:module,p_issue_id:issueId||null,p_reason:reason});
export const supportCompose = ({id,revision,nonce,body,kind}) => supabase.rpc('admin_support_compose',{p_id:id,p_revision:revision,p_nonce:nonce,p_body:body,p_kind:kind});
export const supportGateway = (action, extra={}) => supabase.functions.invoke('admin-support',{method:'POST',body:{action,...extra}});
