import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);

// Called only by the guarded SQL matrix against its disposable database.
export async function runSecurityAuditConcurrency({ database, query }) {
  if (!/^nello_qa_wave02_\d+$/.test(database)) throw Error('Disposable SQL clone required');
  const actor = '10000000-0000-0000-0000-000000000963';
  const nonce = '50000000-0000-0000-0000-000000000963';
  query(database, `insert into auth.users(id,aud,role,email,raw_user_meta_data) values('${actor}','authenticated','authenticated','sec06-concurrent@example.invalid','{"name":"Synthetic concurrency","user_type":"nutritionist"}');`);
  const values = JSON.stringify({ nutritionist_id: actor, type: 'income', category: 'consulta', description: 'Synthetic concurrent receipt', amount: 10, transaction_date: '2026-10-10', status: 'pending' });
  const call = (key) => `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${actor}',true);select set_config('request.jwt.claims','{"sub":"${actor}","role":"authenticated","aal":"aal2"}',true);select public.mutate_record_idempotently('financial_transactions','${values}',null,null,'${key}','${actor}')->>'id';commit;`;
  const run = (statement) => execute('docker', ['exec', 'supabase_db_nello-reconstruction', 'psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database, '-c', statement], { timeout: 30000, maxBuffer: 1024 * 1024 });
  // All four clients are awaited even when one fails, so cleanup cannot race a live query.
  const replies = await Promise.allSettled(Array.from({ length: 4 }, () => run(call(nonce))));
  if (replies.some(reply => reply.status === 'rejected')) throw Error('Concurrent financial receipt failed');
  query(database, `do $$begin if (select count(*) from public.financial_transactions where nutritionist_id='${actor}')<>1 or (select count(*) from private.security_audit_events where tenant_id='${actor}' and resource_type='financial_transactions')<>1 then raise exception 'concurrent_retry_duplicated_data_or_audit';end if;end$$;`);
  const unique = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => run(call(`50000000-0000-0000-0000-00000000097${i}`))));
  if (unique.some(reply => reply.status === 'rejected')) throw Error('Concurrent independent mutation failed');
  query(database, `do $$begin if (select count(*) from public.financial_transactions where nutritionist_id='${actor}')<>5 or (select count(*) from private.security_audit_events where tenant_id='${actor}' and resource_type='financial_transactions')<>5 then raise exception 'concurrent_independent_event_lost';end if;end$$;`);
  const evaluations = await Promise.allSettled([run('select private.evaluate_security_alerts();'), run('select private.evaluate_security_alerts();')]);
  if (evaluations.some(reply => reply.status === 'rejected')) throw Error('Concurrent alert evaluation failed');
  return { passed: true, concurrentClients: 4, sameNonceEvents: 1, independentEvents: 4, serializedAlertEvaluations: 2 };
}
