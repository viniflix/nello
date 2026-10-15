import {executeRead,readPolicies} from '@/lib/utils/readPolicy';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { validHealth } from '@/lib/utils/healthContract';
import PublicSiteLayout from './PublicSiteLayout';

const labels = { operational: 'Operacional', degraded: 'Instabilidade parcial', unavailable: 'Indisponível' };
const incidentLabels = { investigating: 'Em investigação', identified: 'Causa identificada', monitoring: 'Em observação', resolved: 'Resolvido' };

export default function StatusPage() {
  const [health, setHealth] = useState(null);
  const [failed, setFailed] = useState(false);
  const [pending,setPending]=useState(false);
  const [outdated,setOutdated]=useState(false);
  const request=useRef({controller:null,generation:0,active:true});
  const refresh=useCallback(async()=>{
    if(document.hidden||request.current.controller)return;
    const controller=new AbortController(),generation=++request.current.generation;
    request.current.controller=controller;setPending(true);setOutdated(true);setFailed(false);
    try{
      const result=await executeRead(async signal=>{
        const response=await fetch('/api/health',{cache:'no-store',signal});
        if(![200,503].includes(response.status)||!response.headers.get('content-type')?.includes('application/json'))throw new Error('health_unverifiable');
        const body=await response.json();
        if(!validHealth(body)||(response.status===200)!==(body.status==='operational'))throw new Error('health_unverifiable');
        return body;
      },{signal:controller.signal,policy:readPolicies.provider});
      if(request.current.active&&request.current.generation===generation&&!document.hidden){setHealth(result);setFailed(false);setOutdated(false)}
    }catch{
      if(request.current.active&&request.current.generation===generation&&!document.hidden)setFailed(true);
    }finally{
      if(request.current.generation===generation){request.current.controller=null;if(request.current.active)setPending(false)}
    }
  },[]);
  useEffect(()=>{
    request.current.active=true;
    const cancel=()=>{request.current.generation++;request.current.controller?.abort();request.current.controller=null;setPending(false);setOutdated(true)};
    const visibility=()=>{if(document.hidden)cancel();else void refresh()};
    void refresh();const interval=setInterval(refresh,30000);
    document.addEventListener('visibilitychange',visibility);window.addEventListener('online',refresh);
    return()=>{request.current.active=false;request.current.generation++;request.current.controller?.abort();request.current.controller=null;clearInterval(interval);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',refresh)};
  },[refresh]);
  useEffect(()=>{
    if(!health)return;
    const timer=setTimeout(()=>{setOutdated(true);void refresh()},Math.max(0,Date.parse(health.checkedAt)+60001-Date.now()));
    return()=>clearTimeout(timer);
  },[health,refresh]);
  const stale=outdated||failed;
  return <PublicSiteLayout activePath="/status"><main id="main-content" tabIndex={-1} className="site-container public-status">
    <header className="site-subhero"><span className="site-eyebrow">Disponibilidade dos serviços</span><h1>Status do Nello</h1><p>Acompanhe a conexão dos serviços e os comunicados de incidentes.</p></header>
    <section aria-live="polite" className={`public-status-summary${stale ? ' public-status-unknown' : ''}`}>
      <h2 className="text-xl">{failed ? 'Não foi possível verificar a disponibilidade' : pending ? 'Verificando disponibilidade…' : health && !stale ? labels[health.status] : 'Verificando disponibilidade…'}</h2>
      {health && <>
        {stale&&<p role="status">Última verificação desatualizada. Os estados abaixo são históricos; a disponibilidade atual não foi confirmada.</p>}
        <div className="public-service-grid">{[['auth','Autenticação'],['database','Banco de dados'],['storage','Arquivos']].map(([key, title]) => <div className="public-service" data-state={stale ? 'unknown' : health.checks[key]} key={key}><p>{title}: <span className="public-service-badge"><i aria-hidden="true" />{labels[health.checks[key]]}{stale?' (última verificação)':''}</span></p></div>)}</div>
        <p>Última verificação: <time dateTime={health.checkedAt}>{new Date(health.checkedAt).toLocaleString('pt-BR')}</time></p>
      </>}
      <button type="button" className="site-action" disabled={pending} onClick={refresh}>Verificar novamente</button>
      <p>A verificação acompanha a conexão dos serviços. Em caso de instabilidade, tente novamente em alguns minutos.</p>
    </section>
    <section className="public-status-incidents" aria-labelledby="incidents-title">
      {stale&&health&&<p>Comunicados da última verificação; podem estar desatualizados.</p>}
      <h2 id="incidents-title" className="text-xl">Comunicados de incidentes</h2>
      {!Array.isArray(health?.incidents) ? <p>Os comunicados não estão disponíveis nesta verificação.</p>
        : health.incidents.length === 0 ? <p>Nenhum incidente comunicado.</p>
          : health.incidents.map(incident => <article key={incident.id} className="border rounded-lg p-4 space-y-2">
            <h3 className="font-semibold">{incident.title}</h3>
            <p>{incidentLabels[incident.state] || 'Em investigação'}</p>
            <p>{incident.message}</p>
            <time dateTime={incident.updatedAt}>{new Date(incident.updatedAt).toLocaleString('pt-BR')}</time>
          </article>)}
    </section>
    <div className="public-status-actions"><Link className="site-action" to="/login">Ir para o login</Link><a className="site-inline-link" href="/ajuda">Encontrar ajuda</a></div>
  </main></PublicSiteLayout>;
}
