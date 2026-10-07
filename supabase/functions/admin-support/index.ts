import { edgeBoundary, timedFetch, RequestError } from '../_shared/http.ts';
import { parseSupportRequest, boundedJson, attachmentDownload, deliveryState } from './contracts.js';
import { validatePdf } from '../upload-private-file/pdfValidation.ts';
import { supportGateway } from './gateway.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
Deno.serve(edgeBoundary(async req => {
 const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const authorization = req.headers.get('authorization');
 if (!url || !anon || !service) throw new RequestError(503,'support_unavailable');
 if (!authorization?.startsWith('Bearer ')) throw new RequestError(401,'authentication_required');
 const rpc = async (name: string, body: unknown, privileged = false) => {
  const response = await timedFetch(`${url}/rest/v1/rpc/${name}`, {method:'POST',headers:{authorization:privileged ? `Bearer ${service}` : authorization,apikey:privileged?service:anon,'content-type':'application/json'},body:JSON.stringify(body)});
  if (!response.ok) throw new RequestError([401,403,409,429].includes(response.status)?response.status:503,'support_operation_not_confirmed');
  return boundedJson(response,1048576);
 };
 // Full server-side active operator + MFA guard. No caller-supplied actor ID.
 await rpc('admin_support_queue',{p_page:1});
 let input; try {input=parseSupportRequest(await req.json());} catch {throw new RequestError(400,'invalid_support_request');}
 const apiKey = Deno.env.get('RESEND_API_KEY');
 if(input.action==='status') return json({configured:Boolean(apiKey),webhook_configured:Boolean(Deno.env.get('RESEND_WEBHOOK_SECRET')),source:'Configuração do gateway Resend',generated_at:new Date().toISOString(),delivery_verified:false});
 if(!apiKey) throw new RequestError(503,'resend_not_configured');
 const gateway=supportGateway({apiKey,fetcher:timedFetch,rpc});
 try {
  if(input.action==='sync') {
   // Reconciliation writes provider content and requires operator capability.
   const access=await rpc('admin_support_queue',{p_page:1}); if(access.can_write!==true) throw new RequestError(403,'support_write_required');
   return json(await gateway.sync(input.cursor));
  }
  if(input.action==='send') return json(await gateway.send(input.messageId));
  const source=await rpc('admin_support_message_source',{p_message:input.messageId,p_attachment:input.attachmentId||null});
  if(input.action==='delivery') {
   if(source.direction!=='outgoing')throw new RequestError(400,'outgoing_message_required');
   const email=await gateway.provider(`/emails/${source.provider_id}`);
   if(email.id!==source.provider_id)throw new RequestError(503,'invalid_delivery_source');
   const state=deliveryState(email.last_event);
   return json(await rpc('support_delivery_observed',{p_provider:source.provider_id,p_state:state,p_message_id:email.message_id||null},true));
  }
  if(input.action==='attachment') {
   const metadata=await gateway.provider(`/emails/receiving/${source.provider_id}/attachments/${input.attachmentId}`);
   return json(await attachmentDownload(metadata,source.attachment,timedFetch,validatePdf));
  }
  throw new RequestError(400,'unsupported_support_action');
 } catch(error) {if(error instanceof RequestError)throw error;throw new RequestError(503,'support_provider_unavailable');}
},{maxBytes:32768}));
