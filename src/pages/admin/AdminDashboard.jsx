import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, FileClock, HeartPulse, ShieldCheck, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminBriefing } from '@/services/adminService';
import { useAdminSource } from '@/portals/admin/hooks/useAdminSource';
import AdminSourceStatus from '@/portals/admin/components/AdminSourceStatus';
import { operationalCount, operationalDate } from '@/portals/admin/model/sourceState';

const metrics = [
  ['nutritionists', 'Nutricionistas', Users, 'Perfis cadastrados', 'bg-primary/10 text-primary'],
  ['patients', 'Pacientes', HeartPulse, 'Perfis cadastrados', 'bg-blue-50 text-blue-800'],
  ['plans_confirmed_30d', 'Planos confirmados', ClipboardCheck, 'Criados nos últimos 30 dias · não arquivados', 'bg-emerald-50 text-emerald-800'],
  ['plans_draft_30d', 'Planos em rascunho', FileClock, 'Criados nos últimos 30 dias · não arquivados', 'bg-orange-50 text-orange-800'],
];
export default function AdminDashboard() {
  const query = useAdminSource('briefing', getAdminBriefing);
  const data = query.data;
  return <div className="space-y-6">
    <header className="space-y-2"><p className="text-sm font-medium text-primary">Administração · {/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(import.meta.env.VITE_SUPABASE_URL || '') ? 'ensaio local' : 'produção'}</p><h1 className="font-heading text-2xl uppercase leading-tight sm:text-3xl">Central de operação</h1><p className="max-w-2xl text-sm text-muted-foreground">Encontre o que precisa de atenção, investigue a origem e acompanhe a ação.</p><p className="text-xs text-muted-foreground">Versão da aplicação: {import.meta.env.VITE_APP_RELEASE || 'Não identificada'}</p></header>
    <AdminSourceStatus query={query} />
    <section aria-labelledby="admin-priorities" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="admin-priorities" className="text-lg font-semibold">Precisa de atenção</h2><span className="text-xs text-muted-foreground">Prazos exibidos em Fortaleza</span></div>
      <div className="grid gap-4 md:grid-cols-3">{query.isPending ? [0, 1, 2].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />) : data?.queues.map(queue => <Card key={queue.key} className="overflow-hidden rounded-2xl border-border/70 shadow-sm"><CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{queue.label}</h3>{queue.overdue > 0 && <Badge variant="destructive">Prazo vencido</Badge>}</div>
        <p className="text-3xl font-semibold tabular-nums">{operationalCount(queue.count)}</p>
        <div className="space-y-1 text-xs text-muted-foreground">{queue.overdue != null && <p>{operationalCount(queue.overdue)} vencidas · {operationalCount(queue.due_soon)} vencem em até 2 dias</p>}<p>{queue.oldest_at ? `Mais antiga: ${operationalDate(queue.oldest_at)}` : 'Nenhuma pendência confirmada'}</p><p>Fonte: {queue.source}</p></div>
        <Link to={queue.route} className="mt-auto flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5">Abrir fila<ArrowRight className="h-4 w-4 shrink-0" /></Link>
      </CardContent></Card>)}</div>
    </section>
    <section aria-labelledby="admin-pulse" className="space-y-3"><h2 id="admin-pulse" className="text-lg font-semibold">Pulso da plataforma</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([key, label, Icon, explanation, color]) => <Card key={key} className="rounded-2xl shadow-none"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-medium">{label}</h3><span className={`rounded-xl p-2 ${color}`}><Icon className="h-4 w-4" /></span></div>{query.isPending ? <Skeleton className="mt-3 h-9 w-20" /> : <p className="mt-3 text-3xl font-semibold tabular-nums">{operationalCount(data?.counts[key])}</p>}<p className="mt-2 text-xs text-muted-foreground">{explanation}</p></CardContent></Card>)}</div><p className="text-xs text-muted-foreground">{data?.population || 'A população será informada quando a consulta for confirmada.'} Registro criado não equivale a adoção ou resultado clínico.</p></section>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-2xl"><CardHeader><CardTitle className="text-lg">Confiança nos resultados</CardTitle></CardHeader><CardContent className="space-y-4">{data?.invariants.map(item => <div key={item.key} className="rounded-xl bg-muted/40 p-4"><h3 className="text-sm font-medium">{item.label} <span className="ml-1 text-xs text-muted-foreground">· ainda não instrumentado</span></h3><p className="mt-2 text-sm text-muted-foreground">{item.detail}</p></div>)}<Link to="/admin/integrations" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary">Conferir fontes e integrações<ArrowRight className="h-4 w-4" /></Link></CardContent></Card>
      <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" />Acessos e governança</CardTitle></CardHeader><CardContent className="space-y-2">{[['/admin/users', 'Pessoas e contexto operacional'], ['/admin/security', 'Operadores e autenticação'], ['/admin/operations', 'Volume por módulo'], ['/admin/study', 'Indicadores disponíveis']].map(([to, label]) => <Link key={to} to={to} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border p-3 text-sm hover:bg-muted/50">{label}<ArrowRight className="h-4 w-4 shrink-0" /></Link>)}</CardContent></Card>
    </div>
  </div>;
}
