import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getAppointmentNotifications } from '@/lib/supabase/appointment-notifications-queries';
import { track } from '@/infrastructure/analytics/posthog';

const states = {
  queued: ['Na fila', 'bg-muted text-foreground'],
  available: ['Disponível no Nello', 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'],
  failed: ['Falha no aviso', 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'],
  cancelled: ['Cancelado', 'bg-muted text-muted-foreground'],
  superseded: ['Substituído após alteração', 'bg-muted text-muted-foreground'],
  blocked: ['Aviso não habilitado', 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'],
  legacy_unverified: ['Legado sem confirmação', 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200']
};
const reasons = {
  no_patient_account: 'O contato precisa de uma conta no Nello para receber avisos internos.',
  external_channel_unconfigured: 'O canal externo ainda depende de configuração e autorização.',
  no_active_template: 'Não há modelo pós-consulta ativo para este profissional.',
  template_unavailable: 'O modelo foi desativado, removido ou mudou de canal.',
  template_variables_or_size: 'Revise as variáveis e o tamanho do modelo antes de utilizá-lo.',
  legacy_notice_unverified: 'O registro anterior não comprova o horário atual nem a leitura pelo paciente.',
  care_inactive: 'O acompanhamento não está ativo.',
  professional_inactive: 'O profissional não tem capacidade clínica ativa.',
  appointment_changed: 'O agendamento mudou; este aviso não será enviado.',
  appointment_deleted: 'O agendamento foi removido.',
  appointment_not_upcoming: 'A consulta deixou de ser futura.'
};
const time = value => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short' });

export default function AgendaNotificationsDialog({ appointment, nutritionistId, onClose }) {
  const [state, setState] = useState({ loading: true, error: false, rows: [] });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!appointment?.id || !nutritionistId) return;
    let active = true;
    const started = performance.now();
    setState({ loading: true, error: false, rows: [] });
    getAppointmentNotifications({ appointmentId: appointment.id, nutritionistId, limit: 20 }).then(result => {
      if (!active) return;
      setState({ loading: false, error: Boolean(result.error), rows: result.error ? [] : result.data });
      track('ui_action_outcome', { module: 'agenda', operation: 'agenda_notice_history', outcome: result.error ? 'failed' : 'succeeded', duration_ms: Math.round(performance.now() - started) });
    }).catch(() => {
      if (!active) return;
      setState({ loading: false, error: true, rows: [] });
      track('ui_action_outcome', { module: 'agenda', operation: 'agenda_notice_history', outcome: 'failed', duration_ms: Math.round(performance.now() - started) });
    });
    return () => { active = false; };
  }, [appointment?.id, nutritionistId, retry]);
  return <Dialog open={Boolean(appointment)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[92dvh] max-w-lg flex-col gap-0 p-0 [&>button]:h-11 [&>button]:w-11">
      <DialogHeader className="p-5 pr-16 text-left"><DialogTitle>Avisos da consulta</DialogTitle><DialogDescription>Acompanhe os registros internos. Disponibilidade não confirma leitura pelo paciente.</DialogDescription></DialogHeader>
      <div className="min-h-0 space-y-3 overflow-y-auto px-5 pb-5" aria-live="polite">
        {state.loading ? <p role="status" className="text-sm text-muted-foreground">Consultando avisos…</p> : state.error ? <div role="alert" className="space-y-3"><p className="text-sm">Não foi possível consultar os avisos. O agendamento permanece salvo.</p><Button variant="outline" className="min-h-11" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button></div> : state.rows.length ? state.rows.map(row => {
          const [label, color] = states[row.delivery_status] || ['Estado indisponível', 'bg-muted text-foreground'];
          return <article key={row.id} className="space-y-2 rounded-xl bg-muted/30 p-4">
            <h3 className="text-sm font-semibold">{row.event_kind === 'post_consultation' ? 'Pós-consulta' : 'Lembrete da consulta'}</h3>
            <span className={`inline-block max-w-full rounded-lg px-2 py-1 text-xs font-medium ${color}`}>{label}</span>
            <p className="text-xs text-muted-foreground">{row.available_at ? `Disponibilizado em ${time(row.available_at)}` : ['queued', 'failed'].includes(row.delivery_status) ? `Previsão de processamento: ${time(row.scheduled_for)}` : `Registrado em ${time(row.created_at)}`}</p>
            {reasons[row.reason_code] && <p className="text-sm">{reasons[row.reason_code]}</p>}
            {row.delivery_status === 'failed' && <p className="text-sm">{row.attempts < 3 ? 'Haverá uma nova tentativa automática.' : 'O limite de tentativas foi atingido; o aviso precisa de revisão.'} A consulta não precisa ser salva novamente.</p>}
          </article>;
        }) : <p className="text-sm text-muted-foreground">Ainda não há registros de avisos para esta consulta.{appointment?.reminder_sent_at ? ' Existe um marcador legado; ele não confirma entrega no horário atual.' : ''}</p>}
        <p className="text-xs text-muted-foreground">Email, WhatsApp e SMS não são enviados por este painel. Mudanças de horário e cancelamentos invalidam a fila anterior.</p>
      </div>
      <DialogFooter className="grid grid-cols-2 gap-2 border-t p-4 sm:flex"><Button variant="outline" className="min-h-11" disabled={state.loading} onClick={() => setRetry(value => value + 1)}>Atualizar</Button><Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={onClose}>Fechar histórico</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
