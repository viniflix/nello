import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminWorkflowOverview } from '@/services/adminService';

const number = (value) => Number(value ?? 0).toLocaleString('pt-BR');

export default function AdminOperationsPage() {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    getAdminWorkflowOverview().then(({ data, error }) => {
      if (active) setState({ loading: false, data, error });
    });
    return () => { active = false; };
  }, [version]);
  const data = state.data;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-primary">Operação · Nello</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Jornadas da plataforma</h1><p className="mt-2 text-sm text-muted-foreground">Volume por módulo nos últimos 30 dias. Sem conteúdo clínico individual.</p></div><Button variant="outline" onClick={() => { setState((current) => ({ ...current, loading: true })); setVersion((n) => n + 1); }}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div>
    {state.error && <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">Não foi possível carregar os fluxos.</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{state.loading ? Array.from({ length: 9 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />) : data?.workflows?.map((flow) => <Card key={flow.key} className="rounded-2xl"><CardContent className="p-5"><div className="flex justify-between"><p className="text-sm text-muted-foreground">{flow.label}</p><Activity className="h-4 w-4 text-primary" /></div><p className="mt-3 text-3xl font-semibold tabular-nums">{number(flow.count)}</p><p className="mt-1 text-xs text-muted-foreground">Fonte: {flow.source}</p></CardContent></Card>)}</div>
    <Card className="rounded-2xl"><CardHeader><CardTitle className="text-lg">Pendências operacionais</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{[
      ['Anamneses aguardando paciente', data?.pending?.anamnesis_patient, '/admin/study'],
      ['Check-ins pendentes', data?.pending?.checkins, '/admin/study'],
      ['Solicitações LGPD abertas', data?.pending?.privacy, '/admin/privacy'],
      ['Verificações profissionais', data?.pending?.verifications, '/admin/verifications'],
    ].map(([label, value, to]) => <Link key={label} to={to} className="flex items-center justify-between rounded-xl border p-3 text-sm"><span>{label}: <strong>{data ? number(value) : '—'}</strong></span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>)}</CardContent></Card>
    <p className="text-xs text-muted-foreground">{data?.generated_at ? `Consulta em ${new Date(data.generated_at).toLocaleString('pt-BR')}.` : 'Aguardando consulta.'} Os valores mostram registros, não taxa de sucesso ou disponibilidade.</p>
  </div>;
}
