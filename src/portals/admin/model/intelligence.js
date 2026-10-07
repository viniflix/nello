import {validateBriefing,sourceFreshness} from './sourceState';
import {validateProductMetrics} from './productMetrics';

export const SIGNALS = {
 privacy_overdue:{label:'Solicitações de privacidade vencidas',severity:'high',unit:'solicitações',source:'data_subject_requests · due_at',route:'/admin/privacy',rule:'Prazo existente vencido e solicitação ainda em andamento.',next:'Conferir prazo, contexto e resposta pendente. Um caso basta para exigir revisão.'},
 support_unknown:{label:'Resultado de envio não confirmado',severity:'high',unit:'envios',source:'support_messages · estado/lease',route:'/admin/support',rule:'Estado desconhecido ou envio com lease sem confirmação há mais de dois minutos.',next:'Conferir o provedor e o histórico. Não reenviar às cegas.'},
 review_due:{label:'Decisões aguardando revisão',severity:'attention',unit:'decisões',source:'admin_intelligence_records · review_on',route:'/admin/intelligence?view=decision',rule:'Decisão planejada com data de revisão anterior ao dia atual em Fortaleza.',next:'Registrar o resultado observado, inclusive quando inconclusivo.'},
 incident_investigation:{label:'Investigações em andamento',severity:'info',unit:'triagens',source:'admin_incident_triage',route:'/admin/bugs',rule:'Triagem interna em investigação; não representa o estado oficial do Sentry.',next:'Conferir a evidência e atualizar a triagem após a ação.'},
};
export const RECORDS={decision:'Decisões',change:'Mudanças',capacity:'Capacidade e custo',feature:'Ciclo de vida das funcionalidades'};
export const FEATURE_STAGES={evaluation:'Em avaliação',beta:'Beta',active:'Ativa',deprecated:'Em descontinuação',retired:'Retirada'};
export const OUTCOMES={planned:'Revisão pendente',improved:'Melhora observada',worse:'Piora observada',unchanged:'Sem mudança observada',inconclusive:'Inconclusivo'};
export const civilDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value.split('-').reverse().join('/'):'Não informado';
export function fortalezaDay(value=new Date()){
 const parts=new Intl.DateTimeFormat('en',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
 return ['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-');
}
export const FIELD_LABELS={title:'Título',evidence:'Evidência',action:'Ação',expected:'Resultado esperado',review_on:'Data de revisão',outcome:'Resultado',result:'Observação',detail:'Contexto',module:'Módulo',change_kind:'Tipo de mudança',release:'Commit',occurred_at:'Quando ocorreu',provider:'Provedor',resource:'Recurso',unit:'Unidade',used:'Uso medido',limit:'Limite declarado',cost:'Custo',currency:'Moeda',source_note:'Fonte e escopo',period_start:'Início do período',period_end:'Fim do período',measured_on:'Data da medição'};
export const MODULE_NAMES={auth:'Acesso',meal_plan:'Plano alimentar',chat:'Chat',patients:'Pacientes',billing:'Cobrança',analytics:'Analytics',infrastructure:'Infraestrutura',other:'Outro'};
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const count=value=>Number.isSafeInteger(value)&&value>=0;
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function validRecordPayload(kind,p) {
 if(!p||typeof p!=='object'||Array.isArray(p))return false;
 const text=(key)=>typeof p[key]==='string'&&p[key].length<=1000;
 if(kind==='decision')return ['title','evidence','action','expected','review_on','result'].every(text)&&Object.hasOwn(OUTCOMES,p.outcome)&&/^\d{4}-\d{2}-\d{2}$/.test(p.review_on);
 if(kind==='change')return ['title','detail','release'].every(text)&&Object.hasOwn(MODULE_NAMES,p.module)&&['release','configuration','incident'].includes(p.change_kind)&&date(p.occurred_at);
 if(kind==='feature')return ['title','feature_key','scope','rationale','review_on'].every(text)&&Object.hasOwn(MODULE_NAMES,p.module)&&Object.hasOwn(FEATURE_STAGES,p.stage)&&/^\d{4}-\d{2}-\d{2}$/.test(p.review_on);
 if(kind==='capacity')return ['provider','resource','unit','source_note','period_start','period_end','measured_on'].every(text)&&['BRL','USD'].includes(p.currency)
  &&Number.isFinite(p.used)&&p.used>=0&&[p.limit,p.cost].every(n=>n===null||(typeof n==='number'&&Number.isFinite(n)&&n>=0));
 return false;
}
export function validateIntelligenceSource(data) {
 if(data?.schema_version!==1||data.definition_version!=='intelligence-v1'||!date(data.generated_at)||!date(data.data_through)
  ||typeof data.can_write!=='boolean'||!Object.hasOwn(RECORDS,data.kind)||!count(data.total)||!count(data.page)||data.page<1||data.page_size!==20
  ||!Array.isArray(data.items)||data.items.length>20||!Array.isArray(data.signals)||data.signals.length!==4
  ||!Array.isArray(data.signal_events)||data.signal_events.length>30)throw Error('invalid_intelligence_source');
 validateBriefing(data.briefing);validateProductMetrics(data.product);
 if(!count(data.support?.open)||!count(data.support?.unknown_sends))throw Error('invalid_intelligence_support');
 const keys=new Set();
 for(const s of data.signals){if(!Object.hasOwn(SIGNALS,s.key)||keys.has(s.key)||typeof s.active!=='boolean'||!count(s.value)
  ||s.active!==(s.value>0)||!count(s.episode)||!count(s.revision)||s.revision<1||!date(s.changed_at)||!date(s.evaluated_at)
  ||(s.muted_until!==null&&!date(s.muted_until)))throw Error('invalid_intelligence_signal');keys.add(s.key);}
 for(const r of data.items)if(!uuid(r.id)||r.kind!==data.kind||!count(r.revision)||r.revision<1||!date(r.created_at)||!date(r.updated_at)
  ||!validRecordPayload(r.kind,r.payload)||'actor_id' in r)throw Error('invalid_intelligence_record');
 if(data.signal_events.some(e=>!Object.hasOwn(SIGNALS,e.signal_key)||!date(e.created_at)||typeof e.reason!=='string'||'actor_id' in e))throw Error('invalid_intelligence_events');
 return data;
}
export function signalState(signal,now=Date.now()) {
 const freshness=sourceFreshness({data_through:signal.evaluated_at},now);
 if(freshness.state!=='fresh')return {state:'unknown',label:'Avaliação atrasada ou desconhecida'};
 if(!signal.active)return {state:'inactive',label:'Condição não observada nesta consulta'};
 if(signal.muted_until&&Date.parse(signal.muted_until)>now)return {state:'muted',label:'Silenciado temporariamente'};
 return {state:'active',label:'Precisa de revisão'};
}
export function capacityComparison(payload) {
 if(typeof payload.used!=='number'||!Number.isFinite(payload.used)||payload.used<0)throw Error('invalid_capacity');
 if(payload.limit===null)return {percentage:null,remaining:null,label:'Limite não informado'};
 if(typeof payload.limit!=='number'||!Number.isFinite(payload.limit)||payload.limit<0)throw Error('invalid_capacity');
 return {percentage:payload.limit>0?payload.used/payload.limit*100:null,remaining:payload.limit-payload.used,
  label:payload.used>payload.limit?'Acima do limite declarado':payload.used===payload.limit?'No limite declarado':'Abaixo do limite declarado'};
}
export function sampleQualification(numerator,denominator) {
 if(!count(numerator)||!count(denominator)||numerator>denominator)throw Error('invalid_population');
 return {ratio:denominator?`${numerator}/${denominator}`:'Sem população com janela completa',
  qualified:denominator<20,label:denominator<20?'Amostra pequena; suspenda comparação de variação.':'A população permite leitura descritiva; não demonstra causalidade.'};
}
export function intelligenceError(error) {
 if(error?.code==='PT409')return 'O registro mudou. Seu texto foi preservado; atualize o contexto antes de tentar novamente.';
 if(['42501','PGRST301','PGRST302'].includes(error?.code))return 'A sessão ou a permissão precisa ser validada novamente.';
 if(error?.code==='22023')return 'Confira os campos, as datas e o motivo. Não inclua credenciais ou dados de pacientes.';
 return 'Não foi possível confirmar a operação. O texto foi preservado; confira a conexão e tente novamente.';
}
export const RUNBOOKS=[
 {id:'ambiguous-send',title:'Envio com resultado desconhecido',route:'/admin/support',steps:['Conferir a intenção e o ID do provedor no atendimento.','Reconciliar o estado oficial antes de qualquer nova tentativa.','Sem ID verificável, investigar no Resend; não criar outra resposta automaticamente.']},
 {id:'source-failure',title:'Fonte indisponível ou atrasada',route:'/admin/integrations',steps:['Identificar qual leitura falhou e a data da última confirmação.','Conferir o painel oficial, a autorização e os limites.','Manter os resultados anteriores identificados como atrasados; ausência de captura não significa ausência de uso.']},
 {id:'release-recovery',title:'Problema após uma publicação',route:'/admin/bugs',steps:['Relacionar a ocorrência ao SHA e à jornada, sem inferir causa pelo horário.','Preservar rascunhos e evidências antes de atualizar uma aba antiga.','Validar a correção na main; rollback da interface não desfaz banco, arquivos ou e-mails.']},
 {id:'backup',title:'Recuperação de dados e arquivos',route:'/admin/privacy',steps:['Confirmar responsável, escopo, retenção e restauração contratada do provedor.','Conferir banco, Auth e Storage separadamente e preservar dados clínicos.','O ensaio sintético valida o procedimento técnico; não certifica PITR ou backups reais de produção.']},
];
