export const MAILBOX = 'suporte@nellonutri.com.br';
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
export function mailboxAddress(value) {
  if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw Error('invalid_address');
  const match = value.match(/<([^<>]+)>$/);
  const email = (match ? match[1] : value).trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) throw Error('invalid_address');
  return email;
}
export function normalizeReceived(data) {
  if (!data || !UUID.test(data.id) || !Array.isArray(data.to)) throw Error('invalid_received_email');
  if (!data.to.some(value => mailboxAddress(value) === MAILBOX)) return null;
  const received = Date.parse(data.created_at);
  if (!Number.isFinite(received) || received > Date.now() + 300000) throw Error('invalid_received_time');
  const attachments = (data.attachments || []).slice(0, 20).map(item => {
    if (!UUID.test(item.id) || !Number.isSafeInteger(item.size) || item.size < 0) throw Error('invalid_attachment');
    return { id: item.id, filename: String(item.filename || 'anexo').replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 160), content_type: String(item.content_type || '').slice(0, 100), size: item.size };
  });
  // Never activate HTML, tracking pixels or remote images. Keep absence explicit.
  const original = typeof data.text === 'string' ? data.text : '[Mensagem sem versão em texto. Consulte o original no provedor.]';
  return { p_provider: data.id, p_from: mailboxAddress(data.from), p_subject: String(data.subject || '(Sem assunto)').replace(/[\r\n\0]/g, ' ').slice(0, 200),
    p_body: original.slice(0, 20000), p_occurred: data.created_at, p_message_id: typeof data.message_id === 'string' ? data.message_id.slice(0, 998) : null,
    p_attachments: attachments, p_partial: original.length > 20000 || typeof data.text !== 'string' || (data.attachments || []).length > 20 };
}
export function parseSupportRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('invalid_support_request');
  if (!['status', 'sync', 'send', 'delivery', 'attachment'].includes(body.action)) throw Error('invalid_support_action');
  if (['send', 'delivery', 'attachment'].includes(body.action) && !UUID.test(body.message_id || '')) throw Error('invalid_support_message');
  if (body.action === 'attachment' && !UUID.test(body.attachment_id || '')) throw Error('invalid_attachment');
  if (body.cursor != null && !UUID.test(body.cursor)) throw Error('invalid_support_cursor');
  return { action: body.action, messageId: body.message_id, attachmentId: body.attachment_id, cursor: body.cursor || null };
}
export async function boundedJson(response, maxBytes = 262144) {
  if (!response.body) throw Error('missing_provider_body');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) { const {done, value} = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) throw Error('provider_body_too_large'); chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export function callbackEvent(data) {
  const kinds = ['email.sent','email.delivered','email.bounced','email.failed','email.delivery_delayed','email.received'];
  if (!data || !kinds.includes(data.type) || !UUID.test(data.data?.email_id || '') || !Number.isFinite(Date.parse(data.created_at)) || Date.parse(data.created_at) > Date.now() + 300000) throw Error('invalid_webhook_event');
  return {kind: data.type, provider: data.data.email_id, occurred: data.created_at};
}
export function supportMailboxEvent(data) {
 if(data.type==='email.received')return Array.isArray(data.data?.to)&&data.data.to.some(value=>mailboxAddress(value)===MAILBOX);
 return mailboxAddress(data.data?.from)===MAILBOX;
}
export function deliveryState(event) {
 const states={'sent':'sent','delivered':'delivered','bounced':'bounced','failed':'failed','delivery_delayed':'sent'};
 if(!Object.hasOwn(states,event))throw Error('delivery_not_confirmed');
 return states[event];
}
export async function attachmentDownload(metadata, expected, fetcher, validatePdf) {
 const types={'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg','text/plain':'txt'};
 const url=new URL(metadata.download_url);
 if(metadata.id!==expected.id||metadata.size!==expected.size||metadata.content_type!==expected.content_type||!types[metadata.content_type]||!Number.isSafeInteger(metadata.size)||metadata.size>5*1024*1024||metadata.size<0||url.origin!=='https://inbound-cdn.resend.com'||url.username||url.password||!Number.isFinite(Date.parse(metadata.expires_at))||Date.parse(metadata.expires_at)<=Date.now())throw Error('attachment_not_authorized');
 // Credentials are never forwarded from api.resend.com to the signed CDN URL.
 const response=await fetcher(url.href,{redirect:'error'});if(!response.ok||!response.body)throw Error('attachment_unavailable');
 const reader=response.body.getReader();const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>5*1024*1024||size>metadata.size)throw Error('attachment_too_large');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 if(size!==metadata.size)throw Error('attachment_size_changed');
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const prefix=Array.from(bytes.slice(0,8)).map(n=>n.toString(16).padStart(2,'0')).join('');
 if(metadata.content_type==='image/png'&&prefix!=='89504e470d0a1a0a')throw Error('invalid_attachment_content');
 if(metadata.content_type==='image/jpeg'&&!prefix.startsWith('ffd8ff'))throw Error('invalid_attachment_content');
 if(metadata.content_type==='application/pdf'){
  if(typeof validatePdf!=='function')throw Error('pdf_validation_required');
  await validatePdf(bytes,5*1024*1024);
 }
 if(metadata.content_type==='text/plain')new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {content:btoa(binary),content_type:metadata.content_type,filename:`anexo-${expected.id}.${types[metadata.content_type]}`};
}
