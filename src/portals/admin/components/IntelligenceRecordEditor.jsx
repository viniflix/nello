import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {intelligenceSave,intelligenceHistory} from '@/features/admin/services/intelligenceService';
import {intelligenceError,OUTCOMES,fortalezaDay,FIELD_LABELS,FEATURE_STAGES,MODULE_NAMES} from '@/portals/admin/model/intelligence';

const today=fortalezaDay;
function initial(kind) {
 if(kind==='decision')return {title:'',evidence:'',action:'',expected:'',review_on:today(),outcome:'planned',result:''};
 if(kind==='feature')return {title:'',feature_key:'',module:'other',stage:'evaluation',scope:'',rationale:'',review_on:today()};
 if(kind==='change')return {title:'',detail:'',module:'other',change_kind:'configuration',release:'',occurred_at:new Date().toISOString()};
 return {provider:'Supabase',resource:'',unit:'',used:'',limit:'',cost:'',currency:'BRL',source_note:'',period_start:today(),period_end:today(),measured_on:today()};
}
const selectClass='h-11 w-full rounded-md border bg-background px-3 text-sm';
export default function IntelligenceRecordEditor({kind,entry,onClose,onSaved}) {
 const [payload,setPayload]=useState(()=>entry?.payload||initial(kind));
 const [reason,setReason]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [revision,setRevision]=useState(entry?.revision||0);const [conflict,setConflict]=useState(false);const [latest,setLatest]=useState(null);
 const id=useRef(entry?.id||crypto.randomUUID());const intent=useRef(null);
 const change=(key,value)=>setPayload(current=>({...current,[key]:value}));
 const field=(key,label,{type='text',minLength=1,maxLength=1000,optional=false,multiline=false}={})=><div className="min-w-0 space-y-2" key={key}><Label htmlFor={`intelligence-${key}`}>{label}{optional?' (opcional)':''}</Label>{multiline?<Textarea id={`intelligence-${key}`} value={payload[key]} onChange={e=>change(key,e.target.value)} required={!optional} minLength={optional?undefined:minLength} maxLength={maxLength} disabled={busy}/>:<Input id={`intelligence-${key}`} type={type} value={payload[key]??''} onChange={e=>change(key,e.target.value)} required={!optional} minLength={type==='text'?minLength:undefined} maxLength={type==='text'?maxLength:undefined} min={type==='number'?0:undefined} step={type==='number'?'any':undefined} disabled={busy}/>}</div>;
 const choices=(key,label,options)=><div className="min-w-0 space-y-2"><Label htmlFor={`intelligence-${key}`}>{label}</Label><select id={`intelligence-${key}`} className={selectClass} value={payload[key]} onChange={e=>change(key,e.target.value)} disabled={busy}>{Object.entries(options).map(([value,text])=><option value={value} key={value}>{text}</option>)}</select></div>;
 async function submit(e){
  e.preventDefault();setError('');setBusy(true);
  try {
   const savedPayload=kind==='capacity'?{...payload,used:Number(payload.used),limit:payload.limit===''||payload.limit===null?null:Number(payload.limit),cost:payload.cost===''||payload.cost===null?null:Number(payload.cost)}:payload;
   const fingerprint=JSON.stringify([kind,id.current,revision,savedPayload,reason]);
   if(intent.current?.fingerprint!==fingerprint)intent.current={fingerprint,nonce:crypto.randomUUID()};
   const result=await intelligenceSave({kind,id:id.current,revision,nonce:intent.current.nonce,payload:savedPayload,reason});
   if(result.error)throw result.error;
   if(result.data?.success!==true||result.data.id!==id.current||!Number.isSafeInteger(result.data.revision))throw Error('unconfirmed_intelligence_save');
   await onSaved();
  }catch(failure){setError(intelligenceError(failure));if(failure?.code==='PT409')setConflict(true);}finally{setBusy(false);}
 }
 async function refreshContext(){
  setBusy(true);setError('');
  try{const result=await intelligenceHistory(id.current);if(result.error)throw result.error;const item=result.data?.items?.[0];if(!item||!Number.isSafeInteger(item.revision))throw Error('history_unconfirmed');setLatest(item);setRevision(item.revision);setConflict(false);intent.current=null;}
  catch(failure){setError(intelligenceError(failure));}finally{setBusy(false);}
 }
 const labels={decision:'decisão',change:'mudança',capacity:'medição de capacidade'};
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="data-[state=open]:!animate-none [&_button]:transition-none [&_button.bg-primary]:hover:bg-primary [&_.text-muted-foreground]:text-foreground [&_h2]:tracking-normal [&_h2]:leading-snug [&_h2]:[word-spacing:.08em] [&_button]:h-auto [&_button]:min-h-11 [&_button]:whitespace-normal max-h-[90dvh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{entry?'Revisar':'Registrar'} {labels[kind]}</DialogTitle><DialogDescription className="text-foreground">Registro administrativo privado. Não inclua dados de pacientes, senhas ou chaves. {kind==='capacity'?'A medição é manual e não substitui o billing do provedor.':'Resultados observados não demonstram causalidade.'}</DialogDescription></DialogHeader>
  <form onSubmit={submit} className="min-w-0 space-y-4">
   {error&&<p role="alert" className="rounded-md border border-destructive p-3 text-sm">{error}</p>}
   {conflict&&<Button variant="outline" type="button" className="h-auto min-h-11 whitespace-normal" disabled={busy} onClick={()=>void refreshContext()}>Conferir versão atual preservando meu texto</Button>}
   {latest&&<div role="status" className="rounded-md border p-3 text-sm"><p>Versão {revision} conferida. Seu texto foi preservado; compare a evidência antes de salvar.</p><details className="mt-2"><summary className="cursor-pointer">Ver dados da versão atual</summary><dl className="mt-2 space-y-2">{Object.entries(latest.payload).map(([key,value])=><div key={key}><dt className="text-xs text-muted-foreground">{FIELD_LABELS[key]||key}</dt><dd className="break-words">{value===null?'Não informado':String(value)}</dd></div>)}</dl></details></div>}
   {kind==='decision'&&<>{field('title','Título',{maxLength:140})}{field('evidence','Evidência observada',{multiline:true,minLength:10})}{field('action','Ação adotada ou planejada',{multiline:true,minLength:10})}{field('expected','Resultado esperado',{multiline:true,minLength:10,maxLength:500})}<div className="grid gap-4 sm:grid-cols-2">{field('review_on','Data de revisão',{type:'date'})}{choices('outcome','Resultado da revisão',OUTCOMES)}</div>{field('result','O que foi observado na revisão',{multiline:true,optional:payload.outcome==='planned',minLength:10})}</>}
   {kind==='change'&&<>{field('title','Título',{maxLength:140})}{field('detail','Contexto da mudança',{multiline:true,minLength:10})}<div className="grid gap-4 sm:grid-cols-2">{choices('change_kind','Tipo',{configuration:'Configuração',release:'Release',incident:'Incidente'})}{choices('module','Módulo',{auth:'Acesso',meal_plan:'Plano alimentar',chat:'Chat',patients:'Pacientes',billing:'Cobrança',analytics:'Analytics',infrastructure:'Infraestrutura',other:'Outro'})}</div>{field('release','SHA do commit',{optional:true,maxLength:40})}<div className="space-y-2"><Label htmlFor="intelligence-occurred">Quando ocorreu (data local do navegador)</Label><Input id="intelligence-occurred" type="datetime-local" value={payload.occurred_at?new Date(Date.parse(payload.occurred_at)-new Date(payload.occurred_at).getTimezoneOffset()*60000).toISOString().slice(0,16):''} onChange={e=>{change('occurred_at',e.target.value?new Date(e.target.value).toISOString():'');}} required disabled={busy}/></div><p className="text-xs text-muted-foreground">Esta entrada será identificada como registro manual, inclusive quando mencionar um deploy.</p></>}
   {kind==='feature'&&<>{field('title','Nome da funcionalidade',{maxLength:140})}{field('feature_key','Identificador estável',{maxLength:80})}<div className="grid gap-4 sm:grid-cols-2">{choices('module','Módulo',MODULE_NAMES)}{choices('stage','Etapa declarada',FEATURE_STAGES)}</div>{field('scope','Escopo e público',{multiline:true,minLength:10,maxLength:500})}{field('rationale','Justificativa e evidência',{multiline:true,minLength:10})}{field('review_on','Data de revisão',{type:'date'})}<p className="text-xs text-muted-foreground">Inventário declarado para acompanhar o produto. Este registro não ativa, desativa ou altera permissões de uma funcionalidade.</p></>}
   {kind==='capacity'&&<><div className="grid gap-4 sm:grid-cols-2">{choices('provider','Provedor',{Supabase:'Supabase',Sentry:'Sentry',PostHog:'PostHog',Resend:'Resend',Vercel:'Vercel',Other:'Outro'})}{field('resource','Recurso medido',{maxLength:80})}</div><div className="grid gap-4 sm:grid-cols-3">{field('used','Uso medido',{type:'number'})}{field('limit','Limite contratado',{type:'number',optional:true})}{field('unit','Unidade',{maxLength:40})}</div><div className="grid gap-4 sm:grid-cols-2">{field('cost','Custo do período',{type:'number',optional:true})}{choices('currency','Moeda',{BRL:'BRL · Real',USD:'USD · Dólar'})}</div><div className="grid gap-4 sm:grid-cols-3">{field('period_start','Início do período',{type:'date'})}{field('period_end','Fim do período',{type:'date'})}{field('measured_on','Data da medição',{type:'date'})}</div>{field('source_note','Fonte e escopo da medição',{multiline:true,minLength:10,maxLength:500})}<p className="text-xs text-muted-foreground">Deixe limite ou custo vazios quando desconhecidos. Zero representa um valor efetivamente medido. Unidades, moedas e períodos diferentes não serão somados.</p></>}
   <div className="space-y-2"><Label htmlFor="intelligence-reason">Motivo deste registro ou alteração</Label><Textarea id="intelligence-reason" value={reason} onChange={e=>setReason(e.target.value)} minLength={10} maxLength={500} required disabled={busy}/></div>
   <DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy||conflict}>{busy?'Confirmando…':'Salvar registro'}</Button></DialogFooter>
  </form>
 </DialogContent></Dialog>;
}
