import { Link } from 'react-router-dom';
import { Activity, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminWorkflowOverview } from '@/services/adminService';
import {useAdminSource} from '@/portals/admin/hooks/useAdminSource';
import AdminSourceStatus from '@/portals/admin/components/AdminSourceStatus';
import {operationalCount} from '@/portals/admin/model/sourceState';

const number = operationalCount;

export default function AdminOperationsPage() {
  const query=useAdminSource('workflow-volumes',getAdminWorkflowOverview);
  const data = query.data;
  return <div className="space-y-6">
    <header><p className="text-sm font-medium text-primary">Operação · Nello</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Jornadas da plataforma</h1><p className="mt-2 text-sm text-muted-foreground">Registros criados nos últimos 30 dias, excluindo simulações e operadores internos. Publicação e retorno têm indicadores próprios em Uso e valor.</p></header>
    <AdminSourceStatus query={query}/>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{query.isPending ? Array.from({ length: 9 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />) : data?.workflows?.map((flow) => <Card key={flow.key} className="rounded-2xl"><CardContent className="p-5"><div className="flex justify-between"><p className="text-sm text-muted-foreground">{flow.label}</p><Activity className="h-4 w-4 text-primary" /></div><p className="mt-3 text-3xl font-semibold tabular-nums">{number(flow.count)}</p><p className="mt-1 text-xs text-muted-foreground">Fonte: {flow.source}</p></CardContent></Card>)}</div>
    <Card className="rounded-2xl"><CardHeader><CardTitle className="text-lg">Pendências operacionais</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{[
      ['Anamneses aguardando paciente', data?.pending?.anamnesis_patient, '/admin/study'],
      ['Check-ins pendentes', data?.pending?.checkins, '/admin/study'],
      ['Solicitações LGPD abertas', data?.pending?.privacy, '/admin/privacy'],
      ['Verificações profissionais', data?.pending?.verifications, '/admin/verifications'],
    ].map(([label, value, to]) => <Link key={label} to={to} className="flex items-center justify-between rounded-xl border p-3 text-sm"><span>{label}: <strong>{data ? number(value) : '—'}</strong></span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>)}</CardContent></Card>
    <p className="text-xs text-muted-foreground">{data?.generated_at ? `Consulta em ${new Date(data.generated_at).toLocaleString('pt-BR')}.` : 'Aguardando consulta.'} Os valores mostram registros, não taxa de sucesso ou disponibilidade.</p>
  </div>;
}
