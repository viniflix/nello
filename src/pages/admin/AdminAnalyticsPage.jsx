import {useState} from 'react';
import {Link} from 'react-router-dom';
import {BarChart3,ArrowUpRight,Users,Target,Repeat2,Clock3,Info} from 'lucide-react';
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import {getAdminProductMetrics,getAdminProductCaptures} from '@/services/adminService';
import {useAdminSource} from '@/portals/admin/hooks/useAdminSource';
import AdminSourceStatus from '@/portals/admin/components/AdminSourceStatus';
import {operationalCount,operationalDate} from '@/portals/admin/model/sourceState';
import {MODULE_LABELS,CAPTURE_LABELS,OUTCOME_LABELS,ratio,hours,validateProductCaptures} from '@/portals/admin/model/productMetrics';

function Metric({icon:Icon,label,value,detail}) {
 return <Card className="min-w-0 rounded-2xl"><CardContent className="p-5"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4 shrink-0 text-primary"/>{label}</p><p className="mt-3 break-words text-2xl font-semibold tabular-nums">{value}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p></CardContent></Card>;
}
function CapturePanel({query}) {
 const data=query.data;
 return <Card className="rounded-2xl"><CardHeader><CardTitle className="text-lg">Captura consentida · PostHog</CardTitle><p className="text-sm text-muted-foreground">Eventos recebidos são uma amostra do comportamento. Não substituem a confirmação do banco.</p></CardHeader><CardContent className="space-y-4">
  <AdminSourceStatus query={query} queryOnly/>
  {data?.state==='not_configured' && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Consulta não configurada. Configure a credencial de leitura do projeto em Integrações; nenhuma chave pertence ao navegador.</p>}
  {data?.state==='available' && <>
   <p className="text-xs text-muted-foreground">Último evento observado: {operationalDate(data.last_observed_at)}. A consulta recente não garante ingestão completa.</p>
   {data.rows.length ? <ul className="divide-y">{data.rows.map(row=><li key={`${row.event}:${row.outcome}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span>{CAPTURE_LABELS[row.event]}<span className="block text-xs text-muted-foreground">{OUTCOME_LABELS[row.outcome]}</span></span><span className="text-right tabular-nums">{operationalCount(row.captures)} capturas<span className="block text-xs text-muted-foreground">{operationalCount(row.observed_people)} pessoas observadas</span></span></li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhum evento elegível recebido nesta janela. Isso não comprova ausência de uso.</p>}
   <p className="text-xs text-muted-foreground">Capturas deduplicadas por UUID do evento. Não são operações únicas ou taxa de sucesso; eventos iniciados/concluídos podem chegar em períodos diferentes.</p>
  </>}
  <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" asChild><a href="https://us.posthog.com/project/341310/insights/2qvmu72G" target="_blank" rel="noopener noreferrer">Insight existente de trabalho confirmado<ArrowUpRight className="ml-2 h-4 w-4"/></a></Button><Button variant="ghost" size="sm" asChild><Link to="/admin/integrations">Ver integrações</Link></Button></div>
 </CardContent></Card>;
}

export default function AdminAnalyticsPage() {
 const [days,setDays]=useState(30);
 const query=useAdminSource(`product-metrics:${days}`,()=>getAdminProductMetrics(days));
 const captures=useAdminSource(`product-captures:${days}`,async()=>{
  const result=await getAdminProductCaptures(days);
  if(result.error)return result;
  try {return {data:validateProductCaptures(result.data,days),error:null};}
  catch(error) {return {data:null,error};}
 });
 const data=query.data;
 return <div className="space-y-6">
  <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm font-medium text-primary">Produto · Nello</p><h1 className="mt-1 font-heading text-2xl uppercase leading-tight tracking-normal [word-spacing:0.08em] sm:text-3xl">Uso e valor confirmado</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Janelas completas, resultados persistidos e limites de captura. Definições de produto v1 em avaliação.</p></div><fieldset className="flex flex-wrap gap-1 rounded-xl border p-1"><legend className="sr-only">Período de análise</legend>{[30,90,180].map(value=><Button key={value} size="sm" className="transition-none" variant={value===days?'default':'ghost'} aria-pressed={value===days} onClick={()=>setDays(value)}>{value} dias</Button>)}</fieldset></header>
  <AdminSourceStatus query={query}/>
  {query.isPending && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({length:4},(_,index)=><Skeleton key={index} className="h-40 rounded-2xl"/>)}</div>}
  {data && <>
   <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <Metric icon={Target} label="Ativação em sete dias" value={ratio(data.activation.activated,data.activation.eligible)} detail={`${operationalCount(data.activation.activated)} de ${operationalCount(data.activation.eligible)} profissionais com janela completa publicaram o primeiro plano.`}/>
    <Metric icon={Repeat2} label="Retorno na semana seguinte" value={ratio(data.return.returned,data.return.eligible)} detail={`${operationalCount(data.return.returned)} de ${operationalCount(data.return.eligible)} ativados com janela completa tiveram nova operação confirmada.`}/>
    <Metric icon={Clock3} label="Tempo até primeiro valor" value={hours(data.activation.median_hours)} detail={`Mediana entre ativados · p90: ${hours(data.activation.p90_hours)}.`}/>
    <Metric icon={Users} label="Participação dos dois lados" value={operationalCount(data.both_sides_episodes)} detail="Episódios com plano publicado pelo profissional e diário registrado pelo próprio paciente no período."/>
   </div>
   <div className="rounded-xl border bg-primary/5 p-4 text-sm leading-relaxed"><p className="font-medium">Cobertura da observação</p><p className="mt-1 text-muted-foreground">Início: {operationalDate(data.capture_started_at)} · {operationalCount(data.activation.recent)} cadastros ainda sem sete dias completos · {operationalCount(data.historical_uncovered)} profissionais anteriores à captura, sem cobertura histórica de ativação · {operationalCount(data.return.incomplete)} ativações aguardando a janela de retorno.</p></div>
   <Card className="rounded-2xl"><CardHeader><CardTitle className="text-lg">Jornada do paciente · por episódio</CardTitle><p className="text-sm text-muted-foreground">Publicação em sete dias após o vínculo; diário em sete dias após a publicação. Cada etapa usa somente janelas completas.</p></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div><p className="text-sm font-medium">Vínculo → plano publicado</p><p className="mt-2 text-2xl font-semibold">{ratio(data.patient_journey.published_episodes,data.patient_journey.eligible_episodes)}</p><p className="mt-1 text-xs text-muted-foreground">{operationalCount(data.patient_journey.published_episodes)} de {operationalCount(data.patient_journey.eligible_episodes)} episódios elegíveis; {operationalCount(data.patient_journey.recent_episodes)} ainda sem sete dias.</p></div><div><p className="text-sm font-medium">Publicação → diário do paciente</p><p className="mt-2 text-2xl font-semibold">{ratio(data.patient_journey.diary_used,data.patient_journey.diary_eligible)}</p><p className="mt-1 text-xs text-muted-foreground">{operationalCount(data.patient_journey.diary_used)} de {operationalCount(data.patient_journey.diary_eligible)} episódios com janela completa. O diário é opcional; ausência não comprova abandono.</p></div></CardContent></Card>
   <div className="grid items-start gap-5">
    <Card className="rounded-2xl"><CardHeader><CardTitle className="text-lg">Resultados por módulo</CardTitle><p className="text-sm text-muted-foreground">Marcos confirmados no servidor; rascunhos não contam como publicação.</p></CardHeader><CardContent>{data.modules.length ? <ul className="divide-y">{data.modules.map(row=><li key={row.kind} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{MODULE_LABELS[row.kind]}</span><span className="text-right font-medium tabular-nums">{operationalCount(row.operations)} operações<span className="block text-xs font-normal text-muted-foreground">{operationalCount(row.actors)} atores distintos</span></span></li>)}</ul> : <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">Nenhum marco confirmado após o início da captura. As jornadas existentes continuam disponíveis.</p>}<Button className="mt-4" size="sm" variant="outline" asChild><Link to="/admin/operations">Ver volumes e pendências das jornadas</Link></Button></CardContent></Card>
   </div>
   <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-primary"/>Trabalho por semana</CardTitle><p className="text-sm text-muted-foreground">Semana civil em Fortaleza. A primeira e a última semana podem ser parciais; períodos anteriores à captura não são preenchidos com zero.</p></CardHeader><CardContent>{data.weekly.length ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.weekly.map(row=><li key={row.week} className="rounded-xl border p-3 text-sm"><p className="text-muted-foreground">Semana de {row.week.split('-').reverse().join('/')}</p><p className="mt-2 font-semibold tabular-nums">{operationalCount(row.operations)} operações</p><p className="text-xs text-muted-foreground">{operationalCount(row.actors)} atores distintos</p></li>)}</ul> : <p className="text-sm text-muted-foreground">A série começa quando houver marcos confirmados.</p>}</CardContent></Card>
   <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Info className="h-5 w-5"/>Definições e limites</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-relaxed"><p>{data.population}</p><p>{operationalCount(data.professional_population)} profissionais elegíveis atualmente; {operationalCount(data.consent.allowed)} permitem analytics nesta versão e {operationalCount(data.consent.not_allowed_or_unknown)} não permitem ou ainda não têm escolha válida. Ausência de consentimento não significa abandono.</p><ul className="list-disc space-y-2 pl-5 text-muted-foreground">{data.limitations.map(item=><li key={item}>{item}</li>)}</ul><p className="text-xs text-muted-foreground">Metadados operacionais: retenção de {data.retention_days} dias. Documentos e guarda clínica seguem política própria.</p><Button variant="outline" size="sm" asChild><Link to="/admin/study">Abrir pesquisa legada · critérios próprios</Link></Button></CardContent></Card>
  </>}
  <CapturePanel query={captures}/>
  <aside className="rounded-xl border p-4 text-sm leading-relaxed"><p className="font-medium">Leitura entre fontes e versões</p><p className="mt-1 text-muted-foreground">O banco observa confirmações persistidas; o PostHog observa capturas consentidas. As contagens usam populações diferentes e não devem ser subtraídas para estimar perda. Falhas, bloqueadores e ingestão atrasada exigem investigação própria.</p><p className="mt-2 break-all text-xs text-muted-foreground">Versão desta interface: {import.meta.env.VITE_APP_RELEASE || 'Não identificada'}. Os agregados do banco abrangem a janela selecionada, não são atribuídos integralmente a esta release. Comparações antes/depois não demonstram causalidade.</p><Button className="mt-3" size="sm" variant="outline" asChild><Link to="/admin/bugs">Investigar incidentes relacionados</Link></Button></aside>
 </div>;
}
