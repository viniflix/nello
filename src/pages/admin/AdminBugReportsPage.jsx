import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bug, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/customSupabaseClient';
import { getSystemLiveLogs } from '@/services/adminService';

export default function AdminBugReportsPage() {
  const [issues, setIssues] = useState([]);
  const [logs, setLogs] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [logError, setLogError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [event, setEvent] = useState(null);
  const [eventError, setEventError] = useState('');
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [issuesResult, logsResult] = await Promise.all([
      supabase.functions.invoke('sentry-proxy', { method: 'POST', body: { action: 'issues', limit: 100 } }),
      getSystemLiveLogs(50),
    ]);
    if (issuesResult.error || !Array.isArray(issuesResult.data)) {
      setError('Não foi possível consultar o Sentry. Verifique a integração e tente atualizar.');
      setIssues([]);
    } else setIssues(issuesResult.data);
    setLogError(Boolean(logsResult.error));
    setLogs(logsResult.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load, version]);

  const openIssue = async (issue) => {
    setSelected(issue);
    setEvent(null);
    setEventError('');
    const { data, error: detailError } = await supabase.functions.invoke('sentry-proxy', {
      method: 'POST',
      body: { action: 'latest_event', issue_id: String(issue.id) },
    });
    if (detailError) setEventError('O evento mais recente não está disponível.');
    else setEvent(data);
  };
  const visible = issues.filter((issue) => `${issue.title || ''} ${issue.shortId || ''} ${issue.culprit || ''}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-primary">Operação · Nello</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Incidentes e eventos</h1><p className="mt-2 text-sm text-muted-foreground">Issues não resolvidas do Sentry (até 100) e registros operacionais recentes.</p></div><Button variant="outline" onClick={() => setVersion((n) => n + 1)}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div>
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
    <Card className="rounded-2xl"><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle className="flex items-center gap-2 text-lg"><Bug className="h-5 w-5 text-primary" />Issues abertas na consulta: {loading ? '—' : issues.length}</CardTitle><Input aria-label="Filtrar issues" placeholder="Título, código ou origem" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:max-w-72" /></CardHeader><CardContent className="space-y-3">{loading ? <Skeleton className="h-40 w-full" /> : visible.length ? visible.map((issue) => <button key={issue.id} type="button" onClick={() => void openIssue(issue)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-left hover:bg-muted/60"><div className="min-w-0"><p className="font-medium">{issue.title || 'Erro sem título'}</p><p className="mt-1 truncate text-xs text-muted-foreground">{issue.shortId} · {issue.culprit || 'Origem não informada'}</p></div><div className="flex gap-2"><Badge variant="outline">{issue.level || 'error'}</Badge><span className="text-xs text-muted-foreground">{Number(issue.count || 0).toLocaleString('pt-BR')} eventos</span></div></button>) : !error && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma issue encontrada nesta consulta.</p>}</CardContent></Card>
    <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="h-5 w-5 text-primary" />Eventos operacionais recentes</CardTitle><p className="text-sm text-muted-foreground">Até 50 registros da fonte interna; não representa disponibilidade nem taxa de erro.</p></CardHeader><CardContent className="space-y-2">{logError && <p role="alert" className="text-sm text-destructive">Não foi possível consultar os eventos internos.</p>}{logs.length ? logs.map((log) => <div key={log.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"><span>{log.message}</span><span className="text-xs text-muted-foreground">{log.event_timestamp ? new Date(log.event_timestamp).toLocaleString('pt-BR') : 'sem horário'}</span></div>) : !logError && <p className="text-sm text-muted-foreground">Nenhum registro retornado.</p>}</CardContent></Card>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?.title || 'Detalhe da issue'}</DialogTitle></DialogHeader><div className="space-y-3 text-sm"><p>{selected?.shortId} · visto pela última vez em {selected?.lastSeen ? new Date(selected.lastSeen).toLocaleString('pt-BR') : 'data indisponível'}</p>{eventError && <p role="alert" className="text-destructive">{eventError}</p>}{!event && !eventError && <Skeleton className="h-32 w-full" />}{event && <><p className="text-muted-foreground">Evento {event.event_id} · {event.date_created ? new Date(event.date_created).toLocaleString('pt-BR') : 'sem horário'}</p>{event.exceptions?.map((exception, index) => <div key={index} className="rounded-lg border p-3"><strong>{exception.type}</strong><p className="mt-1 break-words">{exception.value}</p><p className="mt-2 text-xs text-muted-foreground">{exception.frames?.filter((frame) => frame.in_app).map((frame) => `${frame.filename}:${frame.line}`).join(' · ') || 'Sem quadros da aplicação'}</p></div>)}</>}</div></DialogContent></Dialog>
  </div>;
}
