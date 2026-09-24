import { useEffect, useState } from 'react';
import { KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminSecurityOverview } from '@/services/adminService';

export default function AdminSecurityPage() {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    getAdminSecurityOverview().then(({ data, error }) => {
      if (active) setState({ loading: false, data, error });
    });
    return () => { active = false; };
  }, [version]);
  const data = state.data;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-primary">Governança · Nello</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Segurança administrativa</h1><p className="mt-2 text-sm text-muted-foreground">Operadores autorizados, MFA e entrada no painel.</p></div><Button variant="outline" onClick={() => { setState((current) => ({ ...current, loading: true })); setVersion((n) => n + 1); }}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div>
    {state.error && <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">Não foi possível consultar a segurança administrativa.</p>}
    <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" />Operadores</CardTitle></CardHeader><CardContent className="space-y-3">{state.loading ? <Skeleton className="h-32 w-full" /> : data?.operators?.map((operator) => <div key={operator.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div className="min-w-0"><p className="truncate font-medium">{operator.email}</p><p className="text-xs text-muted-foreground">{operator.role} · concessão em {new Date(operator.granted_at).toLocaleDateString('pt-BR')}</p></div><div className="flex gap-2"><Badge variant={operator.revoked_at ? 'secondary' : 'outline'}>{operator.revoked_at ? 'Revogado' : 'Ativo'}</Badge><Badge variant={operator.mfa_verified ? 'outline' : 'destructive'}>{operator.mfa_verified ? 'MFA verificado' : 'MFA pendente'}</Badge></div></div>)}</CardContent></Card>
    <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5 text-primary" />Entradas nos últimos sete dias</CardTitle><p className="text-sm text-muted-foreground">Consultas ao portão administrativo, agrupadas por operador, hora e resultado. Não inclui tentativas diretas a outras RPCs.</p></CardHeader><CardContent className="space-y-2">{state.loading ? <Skeleton className="h-24 w-full" /> : data?.access_last_7d?.length ? data.access_last_7d.map((event) => <div key={`${event.operator_id}-${event.hour}-${event.outcome}`} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"><span>{new Date(event.hour).toLocaleString('pt-BR')} · {data.operators.find((item) => item.user_id === event.operator_id)?.email || 'Operador'}</span><span>{event.outcome === 'authorized' ? 'MFA confirmado' : 'MFA exigido'} · {event.attempts} consulta(s)</span></div>) : <p className="text-sm text-muted-foreground">Nenhuma entrada registrada na janela.</p>}</CardContent></Card>
    <p className="text-xs text-muted-foreground">A concessão e revogação de operadores permanece fora do painel, por migração revisada. O registro não armazena senhas, tokens nem dados clínicos.</p>
  </div>;
}
