import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAdminSecurityActivity } from '@/services/adminService';

const rules = {
  operator_privilege_changed: 'Privilégio de operador alterado',
  operator_mfa_removed: 'Fator MFA de operador removido',
  password_change_volume: 'Volume de alterações de senha',
  mfa_activity_volume: 'Volume de atividade MFA',
  admin_mfa_gate_volume: 'Consultas repetidas ao portão MFA',
};
const resources = { user_profiles: 'Permissões da conta', admin_operators: 'Operador administrativo' };
const actions = { INSERT: 'Criação', UPDATE: 'Alteração', DELETE: 'Exclusão' };
const fields = { user_type: 'Papel da conta', is_active: 'Acesso ativo', is_admin: 'Sinalizador administrativo', nutritionist_id: 'Vínculo profissional', role: 'Papel administrativo', granted_at: 'Data da concessão', revoked_at: 'Revogação', grant_reason: 'Justificativa', user_id: 'Conta' };
const origins = { authenticated: 'Usuário autenticado', service_role: 'Serviço', database: 'Operação de banco' };
const date = (value) => value ? new Date(value).toLocaleString('pt-BR') : 'Ainda não executado';

export default function SecurityActivityCard({ version = 0 }) {
  const [before, setBefore] = useState(null);
  const [state, setState] = useState({ loading: true, data: null, error: false });
  useEffect(() => { setBefore(null); }, [version]);
  useEffect(() => {
    let active = true;
    setState({ loading: true, data: null, error: false });
    getAdminSecurityActivity(before).then(({ data, error }) => {
      if (active) setState({ loading: false, data: error ? null : data, error: Boolean(error || data?.schema_version !== 1) });
    }).catch(() => {
      if (active) setState({ loading: false, data: null, error: true });
    });
    return () => { active = false; };
  }, [before, version]);
  const data = state.data;
  const events = data?.events || [];
  const alerts = data?.alerts || [];
  const monitorStale = data?.monitor?.last_evaluated_at && Date.now() - Date.parse(data.monitor.last_evaluated_at) > 15 * 60 * 1000;
  return <Card className="rounded-2xl">
    <CardHeader><CardTitle className="text-lg">Auditoria e sinais de segurança</CardTitle>
      <p className="text-sm text-muted-foreground">Alterações de acesso e alertas internos para investigação. Volume de atividade não confirma uma tentativa maliciosa.</p>
    </CardHeader>
    <CardContent className="space-y-4">
      {state.loading ? <p role="status">Consultando auditoria…</p> : state.error ? <p role="alert" className="text-sm text-destructive">Não foi possível consultar a auditoria. Use Atualizar para tentar novamente.</p> : <>
        <p className="text-xs text-muted-foreground">Última avaliação: {date(data?.monitor?.last_evaluated_at)}. Notificações externas ainda não configuradas; falhas de login não têm cobertura completa.</p>
        {monitorStale && <p role="alert" className="text-sm text-destructive">A avaliação está atrasada. Verifique o monitor antes de confiar na atualização dos alertas.</p>}
        <h2 className="font-medium">Alertas internos recentes</h2>
        {alerts.length ? alerts.map((alert) => <div key={alert.id} className="space-y-1 rounded-xl border p-3 text-sm">
          <p className="font-medium">{rules[alert.rule] || 'Sinal de segurança'} · {alert.severity === 'critical' ? 'Prioridade alta' : 'Atenção'}</p>
          <p className="text-muted-foreground">{date(alert.window_start)} · {alert.occurrences} ocorrência(s)</p>
          <p className="break-all text-xs text-muted-foreground">Conta: {alert.subject_id}</p>
        </div>) : <p className="text-sm text-muted-foreground">Nenhum sinal registrado. Isso não comprova ausência de incidentes.</p>}
        <h2 className="font-medium">Histórico de alterações de acesso</h2>
        {events.length ? events.map((event) => <div key={event.id} className="space-y-1 rounded-xl border p-3 text-sm">
          <p>{resources[event.resource_type] || 'Acesso'} · {actions[event.action] || 'Mudança'} · {date(event.occurred_at)}</p>
          <p className="break-all text-xs text-muted-foreground">Conta: {event.resource_id} · Ator: {event.actor_id || 'Operação de banco'} · Origem: {origins[event.origin] || 'Origem desconhecida'}</p>
          <p className="break-words text-xs text-muted-foreground">Campos: {(event.changed_fields || []).map((field) => fields[field] || 'Permissão').join(', ')}</p>
        </div>) : <p className="text-sm text-muted-foreground">Nenhuma alteração nesta página. O histórico começa na ativação da auditoria.</p>}
        <div className="flex flex-wrap gap-2">
          {before !== null && <Button variant="outline" onClick={() => setBefore(null)}>Mais recentes</Button>}
          {events.length === 25 && <Button variant="outline" onClick={() => setBefore(events.at(-1).id)}>Alterações anteriores</Button>}
        </div>
      </>}
    </CardContent>
  </Card>;
}
