import { useEffect, useState } from 'react';
import { Globe2, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminBrandMigrationStatus, getAdminSecurityOverview } from '@/services/adminService';

export default function AdminSecurityPage() {
  const [state, setState] = useState({ loading: true, data: null, migration: null, error: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([getAdminSecurityOverview(), getAdminBrandMigrationStatus()]).then(([security, migration]) => {
      if (active) setState({ loading: false, data: security.data, migration: migration.data, error: security.error || migration.error });
    });
    return () => { active = false; };
  }, [version]);
  const data = state.data;
  const migration = state.migration;
  const remaining = Number(migration?.legacy_auth_accounts || 0) + Number(migration?.legacy_public_assets || 0) + Number(migration?.legacy_visible_achievements || 0);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-primary">Governança · Nello</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Segurança administrativa</h1><p className="mt-2 text-sm text-muted-foreground">Operadores autorizados, MFA e entrada no painel.</p></div><Button variant="outline" onClick={() => { setState((current) => ({ ...current, loading: true })); setVersion((n) => n + 1); }}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div>
    {state.error && <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">Não foi possível consultar a segurança administrativa.</p>}
    <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" />Operadores</CardTitle></CardHeader><CardContent className="space-y-3">{state.loading ? <Skeleton className="h-32 w-full" /> : data?.operators?.map((operator) => <div key={operator.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div className="min-w-0"><p className="truncate font-medium">{operator.email}</p><p className="text-xs text-muted-foreground">{operator.role} · concessão em {new Date(operator.granted_at).toLocaleDateString('pt-BR')}</p></div><div className="flex gap-2"><Badge variant={operator.revoked_at ? 'secondary' : 'outline'}>{operator.revoked_at ? 'Revogado' : 'Ativo'}</Badge><Badge variant={operator.mfa_verified ? 'outline' : 'destructive'}>{operator.mfa_verified ? 'MFA verificado' : 'MFA pendente'}</Badge></div></div>)}</CardContent></Card>
    <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Globe2 className="h-5 w-5 text-primary" />Migração da marca</CardTitle><p className="text-sm text-muted-foreground">Contagem atual no Auth, nos arquivos públicos e nos textos exibidos aos usuários.</p></CardHeader><CardContent>{state.loading ? <Skeleton className="h-28 w-full" /> : migration ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3">{[['Contas com email legado', migration.legacy_auth_accounts], ['Arquivos públicos legados', migration.legacy_public_assets], ['Conquistas com marca antiga', migration.legacy_visible_achievements]].map(([label, count]) => <div key={label} className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{Number(count).toLocaleString('pt-BR')}</p></div>)}</div><Badge variant={remaining === 0 ? 'outline' : 'destructive'}>{remaining === 0 ? 'Sem pendências ativas' : `${remaining} pendência(s) ativa(s)`}</Badge><p className="text-xs text-muted-foreground">{Number(migration.historical_reports).toLocaleString('pt-BR')} incidente(s) históricos conservam o email registrado na época. A troca de email de uma conta ativa depende da confirmação da nova caixa para preservar recuperação.</p></div> : <p className="text-sm text-muted-foreground">Estado da migração indisponível.</p>}</CardContent></Card>
    <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5 text-primary" />Entradas nos últimos sete dias</CardTitle><p className="text-sm text-muted-foreground">Consultas ao portão administrativo, agrupadas por operador, hora e resultado. Não inclui tentativas diretas a outras RPCs.</p></CardHeader><CardContent className="space-y-2">{state.loading ? <Skeleton className="h-24 w-full" /> : data?.access_last_7d?.length ? data.access_last_7d.map((event) => <div key={`${event.operator_id}-${event.hour}-${event.outcome}`} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"><span>{new Date(event.hour).toLocaleString('pt-BR')} · {data.operators.find((item) => item.user_id === event.operator_id)?.email || 'Operador'}</span><span>{event.outcome === 'authorized' ? 'MFA confirmado' : 'MFA exigido'} · {event.attempts} consulta(s)</span></div>) : <p className="text-sm text-muted-foreground">Nenhuma entrada registrada na janela.</p>}</CardContent></Card>
    <p className="text-xs text-muted-foreground">A concessão e revogação de operadores permanece fora do painel, por migração revisada. O registro não armazena senhas, tokens nem dados clínicos.</p>
  </div>;
}
