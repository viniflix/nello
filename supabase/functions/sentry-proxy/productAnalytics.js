export const WORK_EVENTS = ['patient_created','anamnesis_completed','anthropometry_saved','energy_calc_performed','meal_plan_published','appointment_scheduled','document_generated'];
export const OUTCOMES = ['started','succeeded','failed','expected_failure','unknown','cancelled'];
export function analyticsWindow(body) {
  if (Object.keys(body).some(key => !['action','window_days'].includes(key)) || ![30,90,180].includes(body.window_days ?? 30)) throw Error('invalid_analytics_window');
  return body.window_days ?? 30;
}
export function productQuery(days) {
  if (![30,90,180].includes(days)) throw Error('invalid_analytics_window');
  // Fixed, versioned aggregation of existing Wave14 events; never raw event export.
  return `SELECT event, if(event='ui_action_outcome',toString(properties.outcome),'capture') AS outcome,
 count(DISTINCT uuid) AS captures, count(DISTINCT person_id) AS observed_people, max(timestamp) AS last_observed_at
 FROM events WHERE timestamp>=now()-INTERVAL ${days} DAY AND timestamp<=now()
 AND properties.environment='production' AND toString(properties.event_schema_version)='1'
 AND properties.audience IN ('external','public')
 AND (event IN (${WORK_EVENTS.map(event => `'${event}'`).join(',')})
 OR (event='ui_action_outcome' AND properties.outcome IN (${OUTCOMES.map(outcome => `'${outcome}'`).join(',')})))
 GROUP BY event,outcome ORDER BY event,outcome LIMIT 20`;
}
export function safeProductResults(value,now=Date.now(),days=180) {
  const columns=['event','outcome','captures','observed_people','last_observed_at'];
  if (JSON.stringify(value?.columns)!==JSON.stringify(columns) || !Array.isArray(value?.results) || value.results.length>20 || value.results.some(row => !Array.isArray(row) || row.length!==5)) throw Error('invalid_analytics_response');
  const keys = new Set();
  return value.results.map(([event,outcome,captures,people,last]) => {
    const key = `${event}:${outcome}`;
    if ((!WORK_EVENTS.includes(event) && event!=='ui_action_outcome') ||
      (event==='ui_action_outcome' ? !OUTCOMES.includes(outcome) : outcome!=='capture') || keys.has(key)
      || !Number.isSafeInteger(captures) || captures<0 || !Number.isSafeInteger(people) || people<0 || people>captures
      || typeof last!=='string' || !Number.isFinite(Date.parse(last)) || Date.parse(last)>now
      || Date.parse(last)<now-days*86400000) throw Error('invalid_analytics_response');
    keys.add(key);
    return {event,outcome,captures,observed_people:people,last_observed_at:new Date(last).toISOString()};
  });
}
const cache = new Map();
const pending = new Map();
export async function readProductAnalytics({days,host,project,token,fetcher,now=()=>Date.now()}) {
  if (![30,90,180].includes(days)) throw Error('invalid_analytics_window');
  if (!token || !/^\d{1,12}$/.test(project || '') || !['https://us.posthog.com','https://eu.posthog.com'].includes(host))
    return {schema_version:1,state:'not_configured',source:'PostHog · captura consentida',window_days:days,generated_at:new Date(now()).toISOString(),data_through:null,rows:[]};
  const key=`${host}:${project}:${days}`;
  const hit=cache.get(key);
  if (hit && now()-Date.parse(hit.generated_at)<120000) return hit;
  if (pending.has(key)) return pending.get(key);
  if (pending.size>=2) throw Error('analytics_busy');
  const task=(async()=>{
    const base=`${host}/api/projects/${project}/query/`;
    const response=await fetcher(base,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify({query:{kind:'HogQLQuery',query:productQuery(days)},refresh:'force_blocking',name:'Nello admin governed work v1'})});
    if (!response.ok) throw Error('analytics_provider_unavailable');
    const body=await response.json();
    if (body.query_status?.complete===false) {
      const id=body.query_status.id;
      if (typeof id==='string' && /^[a-zA-Z0-9-]{1,80}$/.test(id)) await fetcher(`${base}${id}/`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}}).catch(()=>{});
      throw Error('analytics_query_incomplete');
    }
    const rows=safeProductResults(body,now(),days);
    const result={schema_version:1,state:'available',source:'PostHog · captura consentida',window_days:days,
      generated_at:new Date(now()).toISOString(),data_through:null,rows,
      last_observed_at:rows.length ? rows.map(row=>row.last_observed_at).sort().at(-1) : null};
    if(cache.size>=3 && !cache.has(key))cache.delete(cache.keys().next().value);
    cache.set(key,result);
    return result;
  })();
  pending.set(key,task);
  try {return await task;} finally {pending.delete(key);}
}
