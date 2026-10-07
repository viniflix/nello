export const CASE_STATES = {new:'Novo',in_progress:'Em atendimento',waiting_user:'Aguardando usuário',waiting_fix:'Aguardando correção',closed:'Encerrado'};
export const CASE_CATEGORIES = {bug:'Defeito',friction:'Dificuldade de uso',suggestion:'Sugestão',guidance:'Orientação'};
export const CASE_MODULES = {meal_plan:'Plano alimentar',chat:'Chat',patients:'Pacientes',auth:'Acesso',billing:'Cobrança',other:'Outros'};
export const MESSAGE_STATES = {received:'Recebida',internal:'Nota interna',queued:'Preparada · não enviada',sending:'Envio em andamento',unknown:'Resultado desconhecido · verificar antes de reenviar',sent:'Aceita pelo Resend',delivered:'Entrega confirmada pelo Resend',bounced:'Devolvida',failed:'Falha confirmada'};
export const supportDate = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}) : 'Data indisponível';
export function validateSupportSource(data,kind){
 const uuid=value=>typeof value==='string'&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
 const natural=value=>Number.isSafeInteger(value)&&value>=0;
 const item=row=>row&&uuid(row.id)&&typeof row.subject==='string'&&row.subject.length<=200&&typeof row.contact_email==='string'&&row.contact_email.length<=254&&Object.hasOwn(CASE_STATES,row.status)&&Object.hasOwn(CASE_CATEGORIES,row.category)&&Object.hasOwn(CASE_MODULES,row.module)&&natural(row.revision);
 let valid=data?.schema_version===1&&typeof data.can_write==='boolean'&&Number.isFinite(Date.parse(data.generated_at));
 if(kind==='queue')valid=valid&&Array.isArray(data.items)&&data.items.length<=20&&data.items.every(item)&&natural(data.total)&&natural(data.metrics?.open)&&natural(data.metrics?.unknown_sends)&&natural(data.metrics?.first_reply_sample)&&(data.metrics.first_reply_p50_hours===null||(Number.isFinite(data.metrics.first_reply_p50_hours)&&data.metrics.first_reply_p50_hours>=0));
 else if(kind==='case')valid=valid&&item(data.item)&&natural(data.item.reopen_count)&&typeof data.has_more==='boolean'&&Array.isArray(data.events)&&data.events.length<=30&&Array.isArray(data.messages)&&data.messages.length<=30&&data.messages.every(message=>uuid(message.id)&&['incoming','outgoing','note'].includes(message.direction)&&Object.hasOwn(MESSAGE_STATES,message.state)&&typeof message.body==='string'&&message.body.length<=20000&&Array.isArray(message.attachments)&&message.attachments.length<=20&&message.attachments.every(attachment=>uuid(attachment.id)&&natural(attachment.size)&&typeof attachment.filename==='string'&&typeof attachment.content_type==='string'));
 else valid=false;
 if(!valid)throw Error('support_source_invalid');return data;
}
export function supportError(error) {
 if(error?.code==='PT409'||Number(error?.status)===409)return 'Este caso mudou ou há uma resposta pendente. Atualize e confira antes de continuar.';
 if(['42501','PGRST301','PGRST302'].includes(error?.code)||[401,403].includes(Number(error?.status)))return 'Sua sessão não autoriza esta ação. Entre novamente e confirme o MFA.';
 return 'A operação não foi confirmada. O conteúdo permanece disponível para conferência; não repita um envio desconhecido.';
}
