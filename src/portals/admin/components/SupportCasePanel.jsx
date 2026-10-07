import React, { useRef, useState } from 'react';
import { useAdminSource } from '@/portals/admin/hooks/useAdminSource';
import { supportCase, supportCompose, supportUpdate, supportGateway } from '@/features/admin/services/supportService';
import { CASE_STATES,CASE_CATEGORIES,CASE_MODULES,MESSAGE_STATES,supportDate,supportError } from '@/portals/admin/model/support';
import AdminSourceStatus from './AdminSourceStatus';
import { Button } from '@/components/ui/button';
import { Card,CardHeader,CardTitle,CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from '@/components/ui/dialog';

function CaseControls({item,canWrite,onRefresh}) {
 const [baseline,setBaseline]=useState(item);
 const [status,setStatus]=useState(item.status),[category,setCategory]=useState(item.category),[module,setModule]=useState(item.module),[issueId,setIssueId]=useState(item.issue_id||''),[reason,setReason]=useState(''),[body,setBody]=useState(''),[kind,setKind]=useState('note');
 const [review,setReview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
 const intent=useRef(null);
 const nonceFor=payload=>{const fingerprint=JSON.stringify(payload);if(intent.current?.fingerprint!==fingerprint)intent.current={fingerprint,nonce:crypto.randomUUID()};return intent.current.nonce;};
 async function run(action,payload){
  setBusy(true);setError('');setFeedback('');
  try {const result=await action({...payload,nonce:nonceFor(payload)});if(result.error)throw result.error;if(result.data?.success!==true)throw Error('unconfirmed_support_operation');intent.current=null;setBody('');setReason('');setReview(false);setFeedback('Alteração registrada.');const fresh=await onRefresh();if(fresh?.data?.item)setBaseline(fresh.data.item);}
  catch(failure){setError(supportError(failure));}finally{setBusy(false);}
 }
 const choices=(id,label,value,setValue,options)=><div className="space-y-2"><Label htmlFor={id}>{label}</Label><select id={id} className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={e=>setValue(e.target.value)} disabled={busy}>{Object.entries(options).map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></div>;
 if(!canWrite)return <p className="rounded-md bg-muted p-3 text-sm">Seu perfil permite consultar o atendimento. Respostas e triagem exigem operador autorizado com MFA.</p>;
 const changed=item.revision!==baseline.revision;
 return <div className="space-y-5">
  {changed&&<div role="alert" className="rounded-md border p-3 text-sm"><p>O caso mudou enquanto você escrevia. Seu texto foi preservado; confira as mensagens antes de continuar.</p><Button variant="outline" className="mt-2" disabled={busy} onClick={()=>{setBaseline(item);setStatus(item.status);setCategory(item.category);setModule(item.module);setIssueId(item.issue_id||'');}}>Atualizar contexto preservando texto</Button></div>}
  {error&&<p role="alert" className="rounded-md border border-destructive p-3 text-sm">{error}</p>}{feedback&&<p role="status" className="text-sm">{feedback}</p>}
  <form className="space-y-3 border-t pt-4" onSubmit={e=>{e.preventDefault();if(!changed)void run(supportUpdate,{id:baseline.id,revision:baseline.revision,status,category,module,issueId,reason});}}>
   <h3 className="font-semibold">Organização do caso</h3><div className="grid gap-3 sm:grid-cols-3">{choices('support-status','Situação',status,setStatus,CASE_STATES)}{choices('support-category','Categoria',category,setCategory,CASE_CATEGORIES)}{choices('support-module','Módulo',module,setModule,CASE_MODULES)}</div>
   <div className="space-y-2"><Label htmlFor="support-issue">ID de incidente Sentry (opcional)</Label><Input id="support-issue" value={issueId} onChange={e=>setIssueId(e.target.value)} pattern="[0-9]{1,30}" maxLength={30} disabled={busy}/></div>
   <div className="space-y-2"><Label htmlFor="support-reason">Motivo da alteração</Label><Textarea id="support-reason" value={reason} onChange={e=>setReason(e.target.value)} minLength={5} maxLength={500} required disabled={busy}/></div>
   <p className="text-xs text-muted-foreground">Encerrar o atendimento não comprova que um defeito foi corrigido.</p><Button variant="outline" disabled={busy||changed||reason.trim().length<5}>Registrar triagem</Button>
  </form>
  <form className="space-y-3 border-t pt-4" onSubmit={e=>{e.preventDefault();if(changed)return;if(kind==='outgoing')setReview(true);else void run(supportCompose,{id:baseline.id,revision:baseline.revision,body,kind});}}>
   <h3 className="font-semibold">Nota ou resposta</h3>{choices('support-kind','Destino do texto',kind,setKind,{note:'Nota interna · nunca enviada',outgoing:'Resposta por e-mail · revisar antes do envio'})}
   <div className="space-y-2"><Label htmlFor="support-body">{kind==='note'?'Nota interna':'Texto da resposta'}</Label><Textarea id="support-body" className="min-h-32" value={body} onChange={e=>setBody(e.target.value)} maxLength={20000} required disabled={busy}/></div>
   <Button disabled={busy||changed||!body.trim()}>{kind==='note'?'Registrar nota':'Preparar resposta'}</Button>
  </form>
  <Dialog open={review} onOpenChange={open=>{if(!busy)setReview(open);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Revisar resposta</DialogTitle><DialogDescription>Destino: {baseline.contact_email}. Esta etapa salva a intenção; o envio exige confirmação na mensagem preparada.</DialogDescription></DialogHeader><p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm">{body}</p>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" onClick={()=>setReview(false)} disabled={busy}>Voltar ao texto</Button><Button disabled={busy||changed} onClick={()=>void run(supportCompose,{id:baseline.id,revision:baseline.revision,body,kind:'outgoing'})}>Confirmar preparação</Button></DialogFooter></DialogContent></Dialog>
 </div>;
}

export default function SupportCasePanel({id,onQueueRefresh,onClose,canWriteCeiling}) {
 const [page,setPage]=useState(1),[busy,setBusy]=useState(null),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
 const query=useAdminSource(['support-case',id,page],()=>supportCase(id,page));const data=query.data,item=data?.item;
 const refresh=async()=>{const fresh=await query.refetch();await onQueueRefresh();return fresh;};
 async function deliver(messageId,action='send',attachmentId=null){
  setBusy(messageId);setError('');setFeedback('');
  try {const result=await supportGateway(action,{message_id:messageId,...(attachmentId?{attachment_id:attachmentId}:{})});if(result.error)throw result.error;
   if(action==='attachment') {const blob=new Blob([new Uint8Array(Array.from(atob(result.data.content),c=>c.charCodeAt(0)))],{type:result.data.content_type});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=result.data.filename;link.click();URL.revokeObjectURL(url);}
   else {setFeedback(result.data?.state==='sent'?'Resend aceitou a resposta. A entrega ainda precisa ser confirmada.':MESSAGE_STATES[result.data?.state]||'Consulte o estado atualizado da mensagem.');await refresh();}
  } catch(failure){setError(supportError(failure));await refresh();}finally{setBusy(null);}
 }
 return <Card className="min-w-0" data-ph-no-capture><CardHeader className="flex-row flex-wrap items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="break-words tracking-normal [word-spacing:.08em]">{item?.subject||'Detalhe do atendimento'}</CardTitle>{item&&<p className="mt-2 break-all text-sm text-muted-foreground">{item.contact_email}</p>}</div><Button variant="outline" onClick={onClose}>Fechar detalhes</Button></CardHeader><CardContent className="space-y-4">
  <AdminSourceStatus query={query} queryOnly/>{error&&<p role="alert" className="text-sm">{error}</p>}{feedback&&<p role="status" className="text-sm">{feedback}</p>}
  {item&&<><div className="flex flex-wrap gap-2"><Badge>{CASE_STATES[item.status]}</Badge><Badge variant="secondary">{CASE_CATEGORIES[item.category]}</Badge><Badge variant="secondary">{CASE_MODULES[item.module]}</Badge></div><p className="text-xs text-muted-foreground">Recebido em {supportDate(item.received_at)} · {item.reopen_count} reaberturas. O e-mail não comprova identidade cadastral.</p>
   <div className="space-y-3" aria-label="Mensagens do atendimento">{data.messages.map(message=><article key={message.id} className={`rounded-lg border p-4 ${message.direction==='note'?'border-amber-200 bg-amber-50/60':'bg-card'}`}><div className="flex flex-wrap justify-between gap-2 text-xs"><strong>{message.direction==='note'?'Nota interna':message.direction==='outgoing'?'Resposta':'Mensagem recebida'}</strong><span>{supportDate(message.occurred_at)}</span></div><p className="my-3 whitespace-pre-wrap break-words text-sm">{message.body}</p>{message.partial&&<p className="text-xs font-medium">Conteúdo parcial; original permanece sujeito à retenção do provedor.</p>}<p className="text-xs text-muted-foreground">{MESSAGE_STATES[message.state]||'Estado não confirmado'}</p>
    <div className="mt-3 flex flex-wrap gap-2">{data.can_write&&canWriteCeiling!==false&&message.can_send&&message.state==='queued'&&<Button size="sm" disabled={Boolean(busy)} onClick={()=>void deliver(message.id)}>Confirmar envio por e-mail</Button>}{message.direction==='outgoing'&&['sent','delivered','bounced','failed'].includes(message.state)&&<Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={()=>void deliver(message.id,'delivery')}>Conferir entrega</Button>}{message.attachments.map(attachment=><Button key={attachment.id} variant="outline" size="sm" className="max-w-full whitespace-normal break-all" disabled={Boolean(busy)||attachment.size>5*1024*1024||!['application/pdf','image/png','image/jpeg','text/plain'].includes(attachment.content_type)} onClick={()=>void deliver(message.id,'attachment',attachment.id)}>Baixar {attachment.filename}</Button>)}</div>
   </article>)}</div>
   <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={page===1||query.isFetching} onClick={()=>setPage(n=>n-1)}>Mensagens mais recentes</Button><Button variant="outline" disabled={!data.has_more||query.isFetching} onClick={()=>setPage(n=>n+1)}>Mensagens anteriores</Button></div>
   <CaseControls key={`${item.id}:${data.can_write&&canWriteCeiling!==false}`} item={item} canWrite={data.can_write===true&&canWriteCeiling!==false} onRefresh={refresh}/>
   <details className="border-t pt-3"><summary className="cursor-pointer font-medium">Histórico administrativo</summary><ol className="mt-3 space-y-2">{data.events.map(event=><li key={event.id} className="text-sm"><span className="text-xs text-muted-foreground">{supportDate(event.created_at)}</span><p className="break-words">{event.reason}</p></li>)}</ol></details>
  </>}
 </CardContent></Card>;
}
