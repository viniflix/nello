import { Webhook } from 'npm:svix@2.7.0';
import { boundedBody, timedFetch } from '../_shared/http.ts';
import { boundedJson, callbackEvent, supportMailboxEvent } from '../admin-support/contracts.js';
import { supportGateway } from '../admin-support/gateway.js';
// This endpoint is public only for signed provider callbacks, never user writes.
Deno.serve(async req => {
 const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(req.method!=='POST')return json(405,{error:'method_not_allowed'});
 const secret=Deno.env.get('RESEND_WEBHOOK_SECRET');const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');const url=Deno.env.get('SUPABASE_URL');
 if(!secret||!service||!url)return json(503,{error:'webhook_not_configured'});
 let event;const eventId=req.headers.get('svix-id')||'';
 try {
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(req,65536));
  new Webhook(secret).verify(raw,{'svix-id':eventId,'svix-timestamp':req.headers.get('svix-timestamp')||'','svix-signature':req.headers.get('svix-signature')||''});
  const payload=JSON.parse(raw);event=callbackEvent(payload);
  // Provider subscriptions cover the account; other mailboxes never enter this ledger.
  if(!supportMailboxEvent(payload))return json(200,{received:true,ignored:true});
 }catch{return json(400,{error:'invalid_signed_webhook'});}
 const rpc=async(name:string,body:unknown)=>{
  const result=await timedFetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{authorization:`Bearer ${service}`,apikey:service,'content-type':'application/json'},body:JSON.stringify(body)});
  if(!result.ok)throw Error('webhook_storage_unavailable');return boundedJson(result);
 };
 try {
  if(await rpc('support_callback_seen',{p_event:eventId,p_provider:event.provider,p_kind:event.kind,p_occurred:event.occurred})===true)return json(200,{received:true,replayed:true});
  if(event.kind==='email.received')await supportGateway({apiKey:Deno.env.get('RESEND_API_KEY'),fetcher:timedFetch,rpc}).receive(event.provider);
  await rpc('support_callback',{p_event:eventId,p_provider:event.provider,p_kind:event.kind,p_occurred:event.occurred});
  return json(200,{received:true});
 }catch{return json(503,{error:'webhook_processing_unconfirmed'});}
});
