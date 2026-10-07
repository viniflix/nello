// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { Webhook } from 'svix';
import { randomBytes, randomUUID } from 'node:crypto';
import { normalizeReceived, parseSupportRequest, callbackEvent, boundedJson, attachmentDownload, deliveryState, supportMailboxEvent } from '../../supabase/functions/admin-support/contracts.js';
import { supportGateway } from '../../supabase/functions/admin-support/gateway.js';

const sample = () => ({id:randomUUID(),from:'Synthetic <qa@example.invalid>',to:['suporte@nellonutri.com.br'],created_at:new Date().toISOString(),subject:'Synthetic support',text:'Private fictitious content',attachments:[]});
describe('private Resend gateway contracts', () => {
 it('uses only the support mailbox, bounds private text and never activates HTML',()=>{
  const email=sample();expect(normalizeReceived(email).p_body).toBe(email.text);
  expect(normalizeReceived({...email,to:['other@example.invalid']})).toBeNull();
  const html=normalizeReceived({...email,text:null,html:'<img src="https://attacker.invalid" onerror="alert(1)">'});
  expect(html.p_partial).toBe(true);expect(html.p_body).not.toContain('<img');
  expect(normalizeReceived({...email,text:'a'.repeat(20001)}).p_body).toHaveLength(20000);
  expect(()=>normalizeReceived({...email,from:'qa@example.invalid\r\nBcc: victim@example.invalid'})).toThrow();
 });
 it('requires bounded UUID requests and verifies exact signed bytes and time',()=>{
  expect(()=>parseSupportRequest({action:'send',message_id:'https://attacker.invalid'})).toThrow();
  const secret='whsec_'+randomBytes(32).toString('base64');const sdk=new Webhook(secret);const body=JSON.stringify({type:'email.sent',created_at:new Date().toISOString(),data:{email_id:randomUUID()}});const id='msg_synthetic';const date=new Date();
  const signature=sdk.sign(id,date,body);const headers={'svix-id':id,'svix-timestamp':String(Math.floor(date.getTime()/1000)),'svix-signature':signature};
  sdk.verify(body,headers);expect(callbackEvent(JSON.parse(body)).kind).toBe('email.sent');
  expect(()=>sdk.verify(body+' ',headers)).toThrow();expect(()=>sdk.verify(body,{...headers,'svix-timestamp':'1'})).toThrow();
 });
 it('stores intention before send; a timeout is unknown with no blind retry',async()=>{
  const id=randomUUID(),lease=randomUUID();const calls=[];const rpc=vi.fn(async(name,args)=>{calls.push(name);return name==='admin_support_claim'?{id,lease,to:'qa@example.invalid',subject:'Synthetic',body:'Only fictitious data',idempotency_key:'nello-support-'+id}:{success:true,state:args.p_state};});
  const fetcher=vi.fn(async()=>{calls.push('provider');throw Error('timeout after acceptance');});const gateway=supportGateway({apiKey:'synthetic',fetcher,rpc});
  expect((await gateway.send(id)).state).toBe('unknown');expect(calls).toEqual(['admin_support_claim','provider','support_delivery_record']);expect(fetcher).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[1][1].p_provider).toBeNull();
 });
 it('does not claim or mutate an intent without server configuration',async()=>{
  const rpc=vi.fn();await expect(supportGateway({fetcher:vi.fn(),rpc}).send(randomUUID())).rejects.toThrow('not_configured');expect(rpc).not.toHaveBeenCalled();
 });
 it('reports accepted separately from delivered and preserves stable idempotency',async()=>{
  const id=randomUUID(),provider=randomUUID();const rpc=vi.fn(async(name,args)=>name==='admin_support_claim'?{id,lease:randomUUID(),to:'qa@example.invalid',subject:'Synthetic',body:'Fiction',idempotency_key:'nello-support-'+id}:{success:true,state:args.p_state});
  const fetcher=vi.fn(async()=>Response.json({id:provider}));const result=await supportGateway({apiKey:'synthetic',fetcher,rpc}).send(id);
  expect(result).toMatchObject({state:'sent',accepted:true});expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('nello-support-'+id);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({reply_to:'suporte@nellonutri.com.br',text:'Fiction'});
 });
 it('reconciles a bounded page through official endpoints without leaking the key',async()=>{
  const email=sample();const rpc=vi.fn(async()=>({success:true,replayed:false}));const fetcher=vi.fn(async url=>Response.json(url.includes('?')?{data:[{id:email.id,to:email.to}],has_more:true}:email));
  const result=await supportGateway({apiKey:'synthetic-secret',fetcher,rpc,pause:async()=>{}}).sync();
  expect(result).toMatchObject({imported:1,has_more:true,cursor:email.id});expect(JSON.stringify(result)).not.toContain('synthetic-secret');expect(fetcher.mock.calls.every(([url])=>url.startsWith('https://api.resend.com/emails/receiving'))).toBe(true);
 });
 it('rejects oversized provider responses before parsing',async()=>{await expect(boundedJson(Response.json({text:'a'.repeat(300000)}))).rejects.toThrow('too_large');});
 it('does not retrieve email bodies addressed to another mailbox',async()=>{
  const fetcher=vi.fn(async()=>Response.json({data:[{id:randomUUID(),to:['other@example.invalid']}],has_more:false}));const rpc=vi.fn();
  expect((await supportGateway({apiKey:'synthetic',fetcher,rpc}).sync()).imported).toBe(0);expect(fetcher).toHaveBeenCalledTimes(1);expect(rpc).not.toHaveBeenCalled();
 });
 it('filters signed account events before retrieving private content',()=>{
  expect(supportMailboxEvent({type:'email.received',data:{to:['other@example.invalid']}})).toBe(false);
  expect(supportMailboxEvent({type:'email.received',data:{to:['suporte@nellonutri.com.br']}})).toBe(true);
  expect(supportMailboxEvent({type:'email.sent',data:{from:'Nello <suporte@nellonutri.com.br>'}})).toBe(true);
  expect(supportMailboxEvent({type:'email.sent',data:{from:'onboarding@example.invalid'}})).toBe(false);
 });
 it('never reports an unknown provider event as successful delivery',()=>{
  expect(deliveryState('delivered')).toBe('delivered');expect(deliveryState('delivery_delayed')).toBe('sent');
  for(const state of [null,'queued','canceled','invented'])expect(()=>deliveryState(state)).toThrow('not_confirmed');
 });
 it('bounds signed attachments, rejects invalid expiry and never forwards API credentials',async()=>{
  const expected={id:randomUUID(),size:5,content_type:'text/plain'};
  const metadata={...expected,download_url:'https://inbound-cdn.resend.com/synthetic',expires_at:new Date(Date.now()+60000).toISOString()};
  const fetcher=vi.fn(async()=>new Response('hello'));
  expect(await attachmentDownload(metadata,expected,fetcher)).toMatchObject({content_type:'text/plain',content:'aGVsbG8='});
  expect(fetcher.mock.calls[0][1]).toEqual({redirect:'error'});
  for(const invalid of [{expires_at:'invalid'},{expires_at:'2000-01-01'},{download_url:'https://attacker.invalid/a'},{size:6},{content_type:'text/html'}])await expect(attachmentDownload({...metadata,...invalid},expected,fetcher)).rejects.toThrow('not_authorized');
  await expect(attachmentDownload(metadata,expected,async()=>new Response('overflow'))).rejects.toThrow('too_large');
 });
 it('requires the existing PDF validator and rejects active PDF contents',async()=>{
  const bytes='%PDF-';const expected={id:randomUUID(),size:bytes.length,content_type:'application/pdf'};
  const metadata={...expected,download_url:'https://inbound-cdn.resend.com/synthetic',expires_at:new Date(Date.now()+60000).toISOString()};
  await expect(attachmentDownload(metadata,expected,async()=>new Response(bytes))).rejects.toThrow('validation_required');
  const validator=vi.fn(async()=>{throw Error('pdf_active_content_forbidden');});
  await expect(attachmentDownload(metadata,expected,async()=>new Response(bytes),validator)).rejects.toThrow('active_content');expect(validator).toHaveBeenCalledTimes(1);
 });
});
