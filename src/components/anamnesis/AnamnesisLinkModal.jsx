import {useAuth} from '@/contexts/AuthContext';
import React,{useState,useEffect,useRef} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogFooter} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Input} from '@/components/ui/input';
import {useAnamnesisRunner} from '@/hooks/useAnamnesisRunner';
import {useAnamnesisTemplates} from '@/hooks/useAnamnesisTemplates';
import {publicOrigin} from '@/lib/utils/publicOrigin';

export function AnamnesisLinkModal(props){
 const {user}=useAuth();
 return <LinkContent key={[user?.id,props.patientId,props.recordId||'',props.open].join(':')} {...props}/>;
}
function LinkContent({open,onOpenChange,patientId,patientName,recordId}){
 const {createRecord,generateLink,usePatientPendingRecord}=useAnamnesisRunner(patientId);
 const {useTemplates}=useAnamnesisTemplates();
 const templatesQuery=useTemplates(),pendingQuery=usePatientPendingRecord();
 const [selected,setSelected]=useState(''),[days,setDays]=useState('7'),[link,setLink]=useState(null);
 const [busy,setBusy]=useState(false),[copied,setCopied]=useState(false),[copyError,setCopyError]=useState(false),[error,setError]=useState(null);
 const active=useRef(true),busyRef=useRef(false),created=useRef(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const copy=async url=>{
  setCopied(false);setCopyError(false);
  try{if(!navigator.clipboard?.writeText)throw new Error('clipboard_unavailable');await navigator.clipboard.writeText(url);if(active.current)setCopied(true);}
  catch{if(active.current)setCopyError(true);}
 };
 const generate=async()=>{
  if(busyRef.current)return;
  busyRef.current=true;setBusy(true);setError(null);
  try{
   let id=recordId||pendingQuery.data?.id||created.current;
   if(!id){const record=await createRecord.mutateAsync({templateId:selected,content:{}});id=record.id;created.current=id;}
   if(!active.current)return;
   const data=await generateLink.mutateAsync({recordId:id,expiresDays:Number(days)});
   if(!active.current)return;
   if(!data?.token||!data.expires_at||!Number.isFinite(new Date(data.expires_at).getTime()))throw new Error('O servidor não confirmou o link e seu prazo. Tente novamente.');
   const result={url:publicOrigin()+'/f/'+data.token,expiresAt:data.expires_at};setLink(result);await copy(result.url);
  }catch{if(active.current)setError('Não foi possível gerar o link. O formulário foi preservado; tente novamente.');}
  finally{busyRef.current=false;if(active.current)setBusy(false);}
 };
 const close=()=>{active.current=false;onOpenChange(false);};
 const checking=pendingQuery.isLoading||templatesQuery.isLoading;
 const failed=pendingQuery.isError||templatesQuery.isError;
 const existing=recordId||pendingQuery.data?.id;
 return <Dialog open={open} onOpenChange={next=>{if(!next)close();}}><DialogContent className="max-w-md">
  <DialogHeader><DialogTitle>Enviar anamnese para {patientName||'paciente'}</DialogTitle><DialogDescription>Gere um link seguro para preenchimento antes da consulta.</DialogDescription></DialogHeader>
  {link?<div className="space-y-4">
   <p role="status">Link gerado. Expira em {new Date(link.expiresAt).toLocaleString('pt-BR')}.</p>
   {copied&&<p role="status">Link copiado!</p>}
   {copyError&&<p role="alert">Não foi possível copiar automaticamente. Selecione o link abaixo e copie manualmente, ou tente copiar novamente.</p>}
   <Input aria-label="Link do formulário" value={link.url} readOnly onClick={event=>event.target.select()}/>
   <Button variant="outline" onClick={()=>window.open(link.url,'_blank','noopener,noreferrer')}>Pré-visualizar formulário</Button>
  </div>:<div className="space-y-4">
   {checking&&<p role="status">Conferindo modelos e formulário pendente...</p>}
   {failed&&<div role="alert"><p>Não foi possível conferir os formulários. Tente novamente antes de gerar um link.</p><Button variant="outline" onClick={()=>{pendingQuery.refetch();templatesQuery.refetch();}}>Tentar novamente</Button></div>}
   {existing?<p>Já existe um formulário selecionado ou aguardando resposta. O novo link substitui o anterior, preservando o formulário.</p>:<Select value={selected} onValueChange={setSelected}><SelectTrigger aria-label="Modelo de anamnese"><SelectValue placeholder="Selecione um modelo..."/></SelectTrigger><SelectContent>{(templatesQuery.data||[]).map(t=><SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent></Select>}
   <Select value={days} onValueChange={setDays}><SelectTrigger aria-label="Validade do link"><SelectValue/></SelectTrigger><SelectContent>{[3,7,14,30].map(d=><SelectItem key={d} value={String(d)}>{d} dias</SelectItem>)}</SelectContent></Select>
   {error&&<p role="alert">{error}</p>}
  </div>}
  <DialogFooter><Button variant="ghost" onClick={close}>Fechar</Button>{link?<Button onClick={()=>copy(link.url)}>Copiar link</Button>:<Button disabled={busy||checking||failed||(!existing&&!selected)} onClick={generate}>{busy?'Gerando...':existing?'Reenviar novo link':'Gerar link'}</Button>}</DialogFooter>
 </DialogContent></Dialog>;
}
