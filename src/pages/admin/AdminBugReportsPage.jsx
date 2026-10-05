import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Bug, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminIssuePage, getSystemLiveLogs } from '@/services/adminService';
import AdminIncidentDetail from '@/portals/admin/components/AdminIncidentDetail';
import { useAdminSource } from '@/portals/admin/hooks/useAdminSource';
import { operationalDate } from '@/portals/admin/model/sourceState';

export default function AdminBugReportsPage() {
  const { user } = useAuth();
  const [hours, setHours] = useState(24);
  const [environment, setEnvironment] = useState('production');
  const [release, setRelease] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const logs = useAdminSource('operational-logs', () => getSystemLiveLogs(50));
  const issues = useInfiniteQuery({
    queryKey: ['admin-workspace', user?.id, 'issues', hours, environment, release],
    enabled: Boolean(user?.id) && (!release || /^[a-f0-9]{7,40}$/.test(release)),
    initialPageParam: '', retry: false, staleTime: 60000, gcTime: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await getAdminIssuePage({ hours, environment, release, cursor: pageParam });
      if (error) throw error;
      if (!Array.isArray(data?.items) || (data.next_cursor && !/^[0-9:]{1,100}$/.test(data.next_cursor))) throw new Error('invalid_issue_page');
      return data;
    },
    getNextPageParam: (last, pages, previous, params) => last.next_cursor && !params.includes(last.next_cursor) && pages.length < 10 ? last.next_cursor : undefined,
  });
  const all = useMemo(() => [...new Map((issues.data?.pages || []).flatMap(p => p.items).map(issue => [issue.id, issue])).values()], [issues.data]);
  const visible = all.filter(issue => `${issue.title} ${issue.shortId}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-6"><header className="space-y-2"><p className="text-sm font-medium text-primary">Operação · investigação</p><h1 className="font-heading text-2xl uppercase sm:text-3xl">Incidentes e eventos</h1><p className="max-w-2xl text-sm text-muted-foreground">Consulte issues abertas do projeto Nello e registre o acompanhamento interno. O total abaixo corresponde às páginas carregadas.</p></header>
    <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Bug className="h-5 w-5 text-primary" />Issues carregadas: {issues.data ? all.length : '—'}</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="space-y-1"><Label htmlFor="issue-window">Janela de consulta</Label><select id="issue-window" className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" value={hours} onChange={e => setHours(Number(e.target.value))}>{[[24, 'Últimas 24 horas'], [72, 'Últimos 3 dias'], [168, 'Últimos 7 dias'], [336, 'Últimos 14 dias']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="space-y-1"><Label htmlFor="issue-environment">Ambiente</Label><select id="issue-environment" className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" value={environment} onChange={e => setEnvironment(e.target.value)}>{[['production', 'Produção'], ['development', 'Desenvolvimento'], ['test', 'Teste'], ['all', 'Todos']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="space-y-1"><Label htmlFor="issue-release">Release (SHA opcional)</Label><Input id="issue-release" value={release} onChange={e => setRelease(e.target.value.trim())} maxLength={40} placeholder="7 a 40 caracteres hexadecimais" /></div><div className="space-y-1"><Label htmlFor="issue-filter">Filtrar páginas carregadas</Label><Input id="issue-filter" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tipo de erro ou código" /></div></div>
      {release && !/^[a-f0-9]{7,40}$/.test(release) && <p role="alert" className="text-sm text-destructive">Informe um SHA válido para consultar esta release.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Sentry · javascript-react · {operationalDate(issues.data?.pages[0]?.generated_at)}. Eventos por issue são acumulados de toda sua duração, não da janela.</p><Button variant="outline" size="sm" disabled={issues.isFetching} onClick={() => void issues.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div>
      {issues.isError && <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">Não foi possível consultar o Sentry. {issues.data ? 'Últimas páginas preservadas; atualização não confirmada.' : 'Verifique a integração e tente atualizar.'}</p>}
      {issues.isPending && issues.fetchStatus !== 'idle' ? <Skeleton className="h-40 w-full" /> : visible.map(issue => <button key={issue.id} type="button" onClick={() => setSelected(issue)} className="flex min-h-20 w-full flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-left hover:bg-muted/50"><div className="min-w-0"><p className="break-words font-medium">{issue.title}</p><p className="mt-1 text-xs text-muted-foreground">{issue.shortId} · última ocorrência {operationalDate(issue.lastSeen)}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{issue.level}</Badge><span className="text-xs text-muted-foreground">{issue.count == null ? 'Quantidade desconhecida' : `${Number(issue.count).toLocaleString('pt-BR')} eventos acumulados`}</span></div></button>)}
      {issues.data && !visible.length && !issues.isError && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma issue encontrada nas páginas carregadas e filtros atuais.</p>}
      {issues.hasNextPage && <Button variant="outline" disabled={issues.isFetching} onClick={() => void issues.fetchNextPage()}>{issues.isFetchingNextPage ? 'Carregando' : 'Carregar próxima página'}</Button>}
      {issues.data?.pages.length === 10 && <p className="text-xs text-muted-foreground">Limite de 250 resultados por consulta. Refine os filtros para investigar outros incidentes.</p>}
    </CardContent></Card>
    <Card className="rounded-2xl"><CardHeader><CardTitle className="text-lg">Eventos operacionais recentes</CardTitle><p className="text-sm text-muted-foreground">Até 50 registros internos. Não representa disponibilidade ou taxa de erro.</p></CardHeader><CardContent className="space-y-2">{logs.isError && <p role="alert" className="text-sm text-destructive">Eventos internos indisponíveis; nenhuma fila vazia foi confirmada.</p>}{logs.isPending ? <Skeleton className="h-24 w-full" /> : logs.data?.map(log => <div key={log.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"><span>{log.message}</span><span className="text-xs text-muted-foreground">{operationalDate(log.event_timestamp)}</span></div>)}{logs.data?.length === 0 && !logs.isError && <p className="text-sm text-muted-foreground">Nenhum registro retornado nesta consulta.</p>}</CardContent></Card>
    {selected && <AdminIncidentDetail key={`${user?.id}:${selected.id}`} issue={selected} onClose={() => setSelected(null)} />}
  </div>;
}
