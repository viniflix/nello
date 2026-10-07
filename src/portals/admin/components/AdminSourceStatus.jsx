import { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { operationalDate, sourceFreshness } from '../model/sourceState';

export default function AdminSourceStatus({ query, cadenceMs = 120000, queryOnly = false }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const freshness = sourceFreshness(query.data, now, cadenceMs);
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm" aria-live="polite">
    <div className="min-w-0 space-y-1">
      <p className="flex items-center gap-2 font-medium">{query.isError ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <Clock3 className="h-4 w-4 text-primary" />}
        {query.isError ? (query.data ? 'Falha ao atualizar · última consulta preservada' : 'Fonte indisponível') : query.isPending ? 'Consultando fonte' : freshness.label}</p>
      {query.data && <p className="text-xs text-muted-foreground">{query.data.source || 'Banco Nello'} · {queryOnly ? 'consulta em' : 'dados até'} {operationalDate(queryOnly ? query.data.generated_at : query.data.data_through || query.data.generated_at)}</p>}
      {query.isError && <p role="alert" className="text-xs text-destructive">A consulta não foi confirmada. Não interprete campos ausentes como zero.</p>}
    </div>
    <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />{query.isFetching ? 'Atualizando' : 'Atualizar'}</Button>
  </div>;
}
