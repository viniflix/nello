import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { validHealth } from '@/lib/utils/healthContract';

const labels = { operational: 'Operacional', degraded: 'Instabilidade parcial', unavailable: 'Indisponível' };
const incidentLabels = { investigating: 'Em investigação', identified: 'Causa identificada', monitoring: 'Em observação', resolved: 'Resolvido' };

export default function StatusPage() {
  const [health, setHealth] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let controller;
    let timer;
    async function refresh() {
      controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 6000);
      try {
        const response = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
        if (![200, 503].includes(response.status) || !response.headers.get('content-type')?.includes('application/json')) throw new Error();
        const result = await response.json();
        if (!validHealth(result) || (response.status === 200) !== (result.status === 'operational')) throw new Error();
        if (active) { setHealth(result); setFailed(false); }
      } catch { if (active) setFailed(true); }
      finally { clearTimeout(timer); }
    }
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(interval); clearTimeout(timer); controller?.abort(); };
  }, []);
  return <main id="main-content" tabIndex={-1} className="min-h-dvh max-w-2xl mx-auto p-8 space-y-6">
    <h1 className="text-3xl font-semibold">Status do Nello</h1>
    <section aria-live="polite" className="space-y-3">
      <h2 className="text-xl">{failed ? 'Não foi possível verificar a disponibilidade' : health ? labels[health.status] : 'Verificando disponibilidade…'}</h2>
      {health && !failed && <>
        <p>Autenticação: {labels[health.checks.auth]}</p>
        <p>Banco de dados: {labels[health.checks.database]}</p>
        <p>Arquivos: {labels[health.checks.storage]}</p>
        <p>Última verificação: <time dateTime={health.checkedAt}>{new Date(health.checkedAt).toLocaleString('pt-BR')}</time></p>
      </>}
      <p>A verificação acompanha a conexão dos serviços. Em caso de instabilidade, tente novamente em alguns minutos.</p>
    </section>
    <section className="space-y-3" aria-labelledby="incidents-title">
      <h2 id="incidents-title" className="text-xl">Comunicados de incidentes</h2>
      {failed || !Array.isArray(health?.incidents) ? <p>Os comunicados não estão disponíveis nesta verificação.</p>
        : health.incidents.length === 0 ? <p>Nenhum incidente comunicado.</p>
          : health.incidents.map(incident => <article key={incident.id} className="border rounded-lg p-4 space-y-2">
            <h3 className="font-semibold">{incident.title}</h3>
            <p>{incidentLabels[incident.state] || 'Em investigação'}</p>
            <p>{incident.message}</p>
            <time dateTime={incident.updatedAt}>{new Date(incident.updatedAt).toLocaleString('pt-BR')}</time>
          </article>)}
    </section>
    <Link className="underline" to="/login">Ir para o login</Link>
  </main>;
}
