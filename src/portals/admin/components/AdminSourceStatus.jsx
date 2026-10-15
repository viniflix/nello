import { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { operationalDate, sourceFreshness } from '../model/sourceState';
import { accessDenied } from '../hooks/useAdminSource';
import { useElementActivity } from '@/hooks/useElementActivity';

export default function AdminSourceStatus({ query, cadenceMs = 120000, queryOnly = false }) {
  const { ref, active } = useElementActivity();
  const [, setClock] = useState(0);
  const timestamp = Date.parse(query.data?.data_through || query.data?.generated_at || '');
  useEffect(() => {
    if (!active || query.isError || query.isPending || !Number.isFinite(timestamp)) return undefined;
    const now = Date.now();
    // Labels only change at these boundaries; there is no recurring render clock.
    const boundary = timestamp > now + 5000 ? timestamp - 5000 : timestamp + cadenceMs * 2 + 1;
    if (boundary <= now) return undefined;
    const timer = window.setTimeout(() => setClock(value => value + 1), Math.min(boundary - now, 2147483647));
    return () => window.clearTimeout(timer);
  });
  const freshness = sourceFreshness(query.data, Date.now(), cadenceMs);
  const denied = accessDenied(query.error);
  return <div ref={ref} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm" aria-live="polite">
    <div className="min-w-0 space-y-1">
      <p className="flex items-center gap-2 font-medium">{query.isError ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <Clock3 className="h-4 w-4 text-primary" />}
        {query.isError ? (denied ? 'Acesso à fonte não confirmado' : query.data ? 'Falha ao atualizar · última consulta preservada' : 'Fonte indisponível') : query.isPending ? 'Consultando fonte' : freshness.label}</p>
      {query.data && <p className="text-xs text-muted-foreground">{query.data.source || 'Banco Nello'} · {queryOnly ? 'consulta em' : 'dados até'} {operationalDate(queryOnly ? query.data.generated_at : query.data.data_through || query.data.generated_at)}</p>}
      {query.isError && <p role="alert" className="text-xs text-destructive">{denied ? 'Valide sua sessão e o MFA. Atualizar esta fonte não autoriza o painel.' : 'A consulta não foi confirmada. Não interprete campos ausentes como zero.'}</p>}
    </div>
    <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />{query.isFetching ? 'Atualizando' : 'Atualizar'}</Button>
  </div>;
}
