import { supabase } from '@/lib/customSupabaseClient';
import { track, Events } from '@/infrastructure/analytics/posthog';
const intents = new Map();
const preparing = new Map();
let generation = 0;
let observedActor;
const TTL = 30 * 60 * 1000;
const volatile = new Set(['created_at','updated_at','confirmed_at','first_seen_at','last_seen_at','resolved_at','p_expected']);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter(k=>!volatile.has(k)&&value[k]!==undefined).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export function clearMutationIntents() { intents.clear();preparing.clear();generation += 1; }
supabase.auth?.onAuthStateChange?.((event,session)=>{
  const nextActor = session?.user?.id;
  if (event === 'SIGNED_OUT' || (observedActor !== undefined && observedActor !== nextActor)
    || [...intents.values()].some(entry=>entry.actor!==nextActor)) clearMutationIntents();
  observedActor = nextActor;
});
/** Manual retry reuses the same nonce; no persisted payload or automatic offline replay. */
export async function idempotentRpc(operation, args) {
  const { data: { session }, error } = await supabase.auth.getSession();
  const actor = session?.user?.id;
  if (error || !actor) return { data:null,error:error || {code:'42501',message:'authentication_required'} };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { data:null,error:{code:'OFFLINE',message:'Sem conexão. O servidor ainda não confirmou o salvamento.'} };
  const serialized = JSON.stringify(canonical(args));
  const encoded = new TextEncoder().encode(serialized);
  if(encoded.length>256*1024)return{data:null,error:{code:'22023',message:'Payload muito grande.'}};
  const preparationKey = `${actor}:${operation}:${serialized}`;
  if (preparing.has(preparationKey)) return preparing.get(preparationKey);
  if (preparing.size >= 100) return {data:null,error:{code:'RETRY_LIMIT',message:'Muitas operações simultâneas. Aguarde a confirmação.'}};
  const capturedGeneration = generation;
  const run = (async () => {
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoded))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if (generation !== capturedGeneration) return {data:null,error:{code:'SESSION_CHANGED',message:'A conta mudou durante o salvamento.'}};
  const key = `${actor}:${operation}:${digest}`;
  let entry = intents.get(key);
  if(entry && Date.now()-entry.at>TTL)return{data:null,error:{code:'RETRY_EXPIRED',message:'Retentativa expirada. Confira o registro no servidor antes de criar outro.'}};
  if(!entry){if(intents.size>=100)return{data:null,error:{code:'RETRY_LIMIT',message:'Muitas operações pendentes. Confira os registros antes de continuar.'}};entry={actor,nonce:crypto.randomUUID(),at:Date.now(),args:structuredClone(args)};intents.set(key,entry);}
  if(entry.promise)return entry.promise;
  const promise=(async()=>{
    try {
      const current = await supabase.auth.getSession();
      if (current.error || current.data?.session?.user?.id !== actor || generation !== capturedGeneration)
        return {data:null,error:{code:'SESSION_CHANGED',message:'A conta mudou durante o salvamento.'}};
      const result=await supabase.rpc(operation,{...entry.args,p_nonce:entry.nonce,p_actor:actor});
      if (intents.get(key) !== entry) return { data:null,error:{code:'SESSION_CHANGED',message:'A conta mudou durante o salvamento. Recarregue os dados da conta atual.'} };
      if(!result.error && args.p_table === 'anamnesis_records' && args.p_values?.status === 'completed')track(Events.ANAMNESIS_COMPLETED,{operation:'anamnesis_complete',outcome:'succeeded'});
      if(!result.error || result.error.code === 'PT409')intents.delete(key);
      return result;
    }catch{return{data:null,error:{code:'NETWORK_FAILURE',message:'Sem confirmação do servidor. Tente novamente para conferir a mesma operação.'}};}
    finally{entry.promise=null;}
  })();entry.promise=promise;return promise;
  })();
  preparing.set(preparationKey, run);
  try { return await run; } finally { if (preparing.get(preparationKey) === run) preparing.delete(preparationKey); }
}

export function insertIdempotently(table,values) {
  return idempotentRpc('mutate_record_idempotently',{p_table:table,p_values:values,p_id:null,p_expected:null});
}
export function updateIdempotently(table,id,values,expected=null) {
  return idempotentRpc('mutate_record_idempotently',{p_table:table,p_values:values,p_id:String(id),p_expected:expected});
}
export function clinicalRpc(operation, args, expected = null) {
  return idempotentRpc('perform_clinical_operation', { p_operation: operation, p_arguments: args, p_expected: expected });
}
