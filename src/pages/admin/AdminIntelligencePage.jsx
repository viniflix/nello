import {useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Plus,Compass} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import {useAdminSource} from '@/portals/admin/hooks/useAdminSource';
import AdminSourceStatus from '@/portals/admin/components/AdminSourceStatus';
import IntelligenceRecordEditor from '@/portals/admin/components/IntelligenceRecordEditor';
import {IntelligencePriorities,IntelligenceRecordCard,IntelligenceRecordHistory,IntelligenceReleaseTimeline,IntelligenceContinuity} from '@/portals/admin/components/IntelligencePanels';
import {RECORDS} from '@/portals/admin/model/intelligence';
import {intelligenceOverview} from '@/features/admin/services/intelligenceService';

const VIEWS={priorities:'Prioridades',decision:'Decisões',change:'Mudanças',capacity:'Capacidade',feature:'Funcionalidades',continuity:'Continuidade'};
export default function AdminIntelligencePage(){
 const [params,setParams]=useSearchParams();const selected=params.get('view');const view=Object.hasOwn(VIEWS,selected)?selected:'priorities';
 const kind=Object.hasOwn(RECORDS,view)?view:'decision';
 const page=Math.max(1,Math.min(10000,Math.trunc(Number(params.get('page')))||1));const setPage=next=>setParams({view,page:String(typeof next==='function'?next(page):next)});
 const [editing,setEditing]=useState(null),[history,setHistory]=useState(null),[feedback,setFeedback]=useState('');
 const query=useAdminSource(['intelligence',kind,page],()=>intelligenceOverview(kind,page));const data=query.data;
 function navigate(next){setEditing(null);setHistory(null);setFeedback('');setParams({view:next});}
 async function saved(){setEditing(null);setFeedback('Registro confirmado no servidor.');if(page!==1)setPage(1);else await query.refetch();}
 return <div className="min-w-0 space-y-6 ph-no-capture [&_h3]:tracking-normal [&_h3]:leading-snug [&_h3]:[word-spacing:.08em] max-sm:[&_button]:h-auto max-sm:[&_button]:min-h-11 max-sm:[&_button]:max-w-full max-sm:[&_button]:whitespace-normal" data-ph-no-capture>
  <header className="space-y-2"><p className="text-sm font-medium text-primary">Operação · evidência e continuidade</p><h1 className="font-heading text-2xl uppercase leading-tight tracking-normal [word-spacing:.08em] sm:text-3xl">Inteligência operacional</h1><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">Priorize o trabalho, registre decisões e confira seus resultados. Sinais explicáveis, fontes identificadas e limites visíveis.</p></header>
  <nav aria-label="Áreas de inteligência operacional" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{Object.entries(VIEWS).map(([key,label])=><Button key={key} variant={view===key?'default':'outline'} className={view===key?'transition-none hover:bg-primary':'transition-none'} aria-pressed={view===key} onClick={()=>navigate(key)}>{label}</Button>)}</nav>
  <AdminSourceStatus query={query}/>{feedback&&<p role="status" className="rounded-xl border bg-primary/5 p-3 text-sm">{feedback}</p>}
  {query.isPending&&<div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-56 rounded-2xl"/><Skeleton className="h-56 rounded-2xl"/></div>}
  {data&&view==='priorities'&&<IntelligencePriorities data={data} onRefresh={query.refetch}/>}
  {data&&Object.hasOwn(RECORDS,view)&&<section className="space-y-4" aria-labelledby="intelligence-records"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="intelligence-records" className="text-lg font-semibold">{RECORDS[kind]}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{kind==='feature'?'Acompanhe a etapa, o escopo e a justificativa. Este inventário não modifica flags ou permissões.':kind==='decision'?'Evidência, ação e revisão. Resultado inconclusivo é uma conclusão válida.':kind==='change'?'Registros manuais de contexto, separados das releases oficiais.':'Medições declaradas com fonte, unidade, período e limite. Não representam receita Nello.'}</p></div>{data.can_write&&<Button onClick={()=>setEditing({kind,entry:null})}><Plus className="mr-2 h-4 w-4"/>{kind==='feature'?'Registrar funcionalidade':kind==='capacity'?'Registrar medição':kind==='decision'?'Registrar decisão':'Registrar mudança'}</Button>}</div>
   {data.items.length?<div className="grid items-start gap-4 lg:grid-cols-2">{data.items.map(entry=><IntelligenceRecordCard key={entry.id} entry={entry} canWrite={data.can_write} onEdit={item=>setEditing({kind,entry:item})} onHistory={setHistory}/>)}</div>:<div className="rounded-2xl border bg-card p-6"><Compass className="mb-3 h-6 w-6 text-primary"/><p className="font-medium">Nenhum registro nesta página</p><p className="mt-2 text-sm text-muted-foreground">{kind==='capacity'?'Não há custo ou quota reconciliada para preencher automaticamente. Registre uma medição identificada ou consulte o provedor.':'Registre evidência administrativa quando houver uma ação a acompanhar. Nenhum resultado será inventado.'}</p></div>}
   <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Página {page} · {data.total} registros</span><div className="flex gap-2"><Button variant="outline" disabled={page===1||query.isFetching} onClick={()=>setPage(n=>n-1)}>Anterior</Button><Button variant="outline" disabled={page*20>=data.total||query.isFetching} onClick={()=>setPage(n=>n+1)}>Próxima</Button></div></div>
   {view==='change'&&<IntelligenceReleaseTimeline/>}
  </section>}
  {view==='continuity'&&<IntelligenceContinuity/>}
  {editing&&data?.can_write&&<IntelligenceRecordEditor key={`${editing.kind}:${editing.entry?.id||'new'}`} kind={editing.kind} entry={editing.entry} onClose={()=>setEditing(null)} onSaved={saved}/>}
  {history&&data&&<IntelligenceRecordHistory entry={history} onClose={()=>setHistory(null)}/>}
 </div>;
}
