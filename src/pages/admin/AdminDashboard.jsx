import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, CalendarDays, ClipboardCheck, HeartPulse, RefreshCw, ShieldCheck, Users, Utensils } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getDashboardStats } from '@/services/adminService';

const number = (value) => Number(value ?? 0).toLocaleString('pt-BR');
const cards = [
  { key: 'nutritionists', label: 'Nutricionistas', icon: Users, source: 'Perfis cadastrados' },
  { key: 'patients', label: 'Pacientes', icon: HeartPulse, source: 'Perfis cadastrados' },
  { key: 'active_patients_30d', label: 'Pacientes ativos', icon: Activity, source: 'Eventos nos últimos 30 dias' },
  { key: 'meals_30d', label: 'Refeições registradas', icon: Utensils, source: 'Últimos 30 dias' },
  { key: 'plans_created_30d', label: 'Planos criados', icon: ClipboardCheck, source: 'Últimos 30 dias' },
  { key: 'appointments_today', label: 'Consultas hoje', icon: CalendarDays, source: 'Horário de Fortaleza' },
  { key: 'pending_verifications', label: 'Verificações pendentes', icon: ShieldCheck, source: 'Fila profissional' },
];

export default function AdminDashboard() {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    getDashboardStats().then(({ data, error }) => {
      if (active) setState({ loading: false, data, error });
    });
    return () => { active = false; };
  }, [refresh]);
  const data = state.data;
  const chart = (data?.registrations || []).map((row) => ({
    ...row,
    label: new Date(`${row.month}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }),
  }));
  return <div className="space-y-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-medium text-primary">Visão geral · Nello</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Operação da plataforma</h1><p className="mt-2 text-sm text-muted-foreground">Cadastros, uso e pendências derivados dos registros reais.</p></div>
      <Button variant="outline" onClick={() => { setState((current) => ({ ...current, loading: true })); setRefresh((n) => n + 1); }}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
    </div>
    {state.error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar os dados administrativos. Tente atualizar.</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ key, label, icon: Icon, source }) => <Card key={key} className="rounded-2xl border-border/70 shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><span className="text-sm text-muted-foreground">{label}</span><span className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span></div>{state.loading ? <Skeleton className="mt-4 h-9 w-20" /> : <p className="mt-3 text-3xl font-semibold tabular-nums">{data ? number(data.counts?.[key]) : '—'}</p>}<p className="mt-1 text-xs text-muted-foreground">{source}</p></CardContent></Card>)}</div>
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <Card className="rounded-2xl border-border/70 shadow-sm"><CardHeader><CardTitle className="text-lg">Novos cadastros por mês</CardTitle><p className="text-sm text-muted-foreground">Nutricionistas e pacientes · últimos seis meses · fonte: user_profiles</p></CardHeader><CardContent>{state.loading ? <Skeleton className="h-64 w-full" /> : !data ? <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Dados indisponíveis</div> : <ResponsiveContainer width="100%" height={260}><AreaChart data={chart} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Area name="Nutricionistas" dataKey="nutritionists" type="monotone" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.14} /><Area name="Pacientes" dataKey="patients" type="monotone" stroke="#14b8a6" fill="#14b8a6" fillOpacity={0.12} /></AreaChart></ResponsiveContainer>}</CardContent></Card>
      <Card className="rounded-2xl border-border/70 shadow-sm"><CardHeader><CardTitle className="text-lg">Ações prioritárias</CardTitle></CardHeader><CardContent className="space-y-2">{[['/admin/verifications', 'Revisar profissionais'], ['/admin/privacy', 'Solicitações de privacidade'], ['/admin/bugs', 'Incidentes e erros'], ['/admin/users', 'Pessoas cadastradas']].map(([to, label]) => <Link key={to} to={to} className="flex items-center justify-between rounded-xl border border-border/70 p-3 text-sm hover:bg-muted/60">{label}<ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>)}</CardContent></Card>
    </div>
    <p className="text-xs text-muted-foreground">{data?.generated_at ? `Dados consultados em ${new Date(data.generated_at).toLocaleString('pt-BR')}.` : 'Aguardando consulta ao banco.'} Contas de simulação não entram nos indicadores de pessoas.</p>
  </div>;
}
