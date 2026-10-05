import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminIncidentState, getAdminIssueEvent, triageAdminIncident } from '@/services/adminService';
import { operationalDate } from '../model/sourceState';
export const TRIAGE_LABEL = { new: 'Nova', investigating: 'Em investigação', monitoring: 'Em acompanhamento', closed: 'Triagem encerrada' };

export default function AdminIncidentDetail({ issue, onClose }) {
  const [state, setState] = useState({ loading: true, event: null, triage: null, eventError: false, triageError: false });
  const [status, setStatus] = useState('investigating');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ loading: true, event: null, triage: null }); setError('');
    Promise.allSettled([getAdminIssueEvent(issue.id), getAdminIncidentState(issue.id)]).then(([event, triage]) => {
      if (!active) return;
      const e = event.status === 'fulfilled' ? event.value : { error: true };
      const t = triage.status === 'fulfilled' ? triage.value : { error: true };
      setState({ loading: false, event: e.error ? null : e.data, triage: t.error ? null : t.data, eventError: Boolean(e.error), triageError: Boolean(t.error) });
      setStatus(t.data?.item?.status || 'investigating');
    });
    return () => { active = false; };
  }, [issue.id, version]);
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await triageAdminIncident({ issueId: issue.id, revision: state.triage?.item?.revision || 0, status, reason: reason.trim() });
      if (result.error) throw result.error;
      if (!result.data || result.data.issue_id !== String(issue.id) || result.data.revision !== (state.triage?.item?.revision || 0) + 1) throw new Error('triage_unconfirmed');
      setReason('');
      setVersion(v => v + 1);
    } catch (failure) {
      setError(failure?.code === 'PT409' ? 'A triagem mudou em outra sessão. Atualize o histórico antes de tentar novamente.' : 'Resultado não confirmado. Confira o histórico antes de reenviar. Sua justificativa permanece neste formulário.');
    } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{issue.shortId} · investigação</DialogTitle><DialogDescription>Triagem interna separada do status do Sentry. Não inclua nomes, contatos ou conteúdo clínico na justificativa.</DialogDescription></DialogHeader>
    <p className="text-sm">Última ocorrência: {operationalDate(issue.lastSeen)}</p>
    {state.loading ? <Skeleton className="h-32 w-full" /> : <>
      {state.eventError && <p role="alert" className="text-sm text-destructive">O evento do Sentry não pôde ser consultado. A triagem interna continua independente.</p>}
      {state.event?.exceptions?.map((exception, i) => <div key={i} className="rounded-xl border p-3 text-sm"><strong>{exception.type}</strong><p className="mt-1 text-muted-foreground">{exception.value}</p><p className="mt-2 break-words font-mono text-xs">{exception.frames?.map(f => `${f.filename}:${f.line ?? '—'}`).join(' · ') || 'Sem quadros da aplicação'}</p></div>)}
      {state.triageError && <p role="alert" className="text-sm text-destructive">Histórico interno indisponível. A edição está bloqueada até nova consulta.</p>}
      {state.triage && <section className="space-y-3"><h2 className="font-semibold">Triagem interna</h2><p className="text-sm">{TRIAGE_LABEL[state.triage.item?.status] || 'Ainda não registrada'} · revisão {state.triage.item?.revision || 0}</p>
        {state.triage.can_triage && <form onSubmit={save} className="space-y-3"><div className="space-y-1"><Label htmlFor="triage-status">Encaminhamento</Label><select id="triage-status" className="flex min-h-11 w-full rounded-md border bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)} disabled={busy}>{Object.entries(TRIAGE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div><div className="space-y-1"><Label htmlFor="triage-reason">Evidência ou próxima ação</Label><Textarea id="triage-reason" value={reason} onChange={e => setReason(e.target.value)} minLength={10} maxLength={500} required disabled={busy} placeholder="Registre o diagnóstico técnico e a ação de acompanhamento." /></div><Button disabled={busy || reason.trim().length < 10}>{busy ? 'Registrando' : 'Registrar triagem'}</Button></form>}
        <ol className="max-h-52 space-y-2 overflow-y-auto">{state.triage.events?.map(entry => <li key={entry.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{TRIAGE_LABEL[entry.status]} · revisão {entry.revision}</p><p className="mt-1 whitespace-pre-wrap break-words">{entry.reason}</p><p className="mt-1 text-xs text-muted-foreground">{operationalDate(entry.created_at)}</p></li>)}</ol>
      </section>}
    </>}{error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" disabled={busy} onClick={() => setVersion(v => v + 1)}>Conferir histórico</Button></div>}
  </DialogContent></Dialog>;
}
