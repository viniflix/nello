import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getAgendaRegistrationContext, linkAgendaPatient } from '@/lib/supabase/agenda-reference-queries';
import { appointmentCharge } from '@/lib/agenda/navigation';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { formatCurrency } from '@/lib/utils';
import AgendaPatientPicker from './AgendaPatientPicker';
import AddPatientModal from '@/components/nutritionist/AddPatientModal';

export default function AgendaRegistrationDialog({ open, onOpenChange, appointmentId, userId, name, patients, searchPatients, onLinked }) {
  const [context, setContext] = useState(null), [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [selection, setSelection] = useState({ name: '', id: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const lock = useRef(false), owner = useRef(userId);
  owner.current = userId;
  useEffect(() => {
    if (!open || !appointmentId || !userId) return;
    let active = true;
    setLoading(true); setError(''); setContext(null);
    getAgendaRegistrationContext(userId, appointmentId)
      .then(row => { if (active) setContext(row); })
      .catch(failure => { if (active) setError(toPortugueseError(failure, 'Não foi possível conferir o agendamento.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, appointmentId, userId, revision]);
  useEffect(() => { if (open) setSelection({ name: '', id: '' }); }, [open, appointmentId, userId]);
  const permitted = context && !context.patient_id && ['scheduled', 'awaiting_confirmation', 'confirmed'].includes(context.status);
  const charge = appointmentCharge(context);
  const link = async () => {
    if (lock.current || !permitted || !selection.id) return;
    lock.current = true; setSaving(true); setError('');
    const actor = userId;
    try {
      await linkAgendaPatient(context, selection.id);
      if (owner.current !== actor) return;
      onOpenChange(false);
      await onLinked?.();
    } catch (failure) {
      if (owner.current === actor) setError(toPortugueseError(failure, failure.code === 'PT409'
        ? 'O agendamento ou a cobrança mudou. Confira os dados atuais antes de confirmar novamente.' : 'Não foi possível confirmar o vínculo. O cadastro e o agendamento foram preservados.'));
    } finally { lock.current = false; setSaving(false); }
  };
  return <>
    <Dialog open={open && !createOpen} onOpenChange={value => { if (!lock.current) onOpenChange(value); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" aria-busy={saving}>
        <DialogHeader><DialogTitle>Completar cadastro do agendamento</DialogTitle>
          <DialogDescription className="break-words">Selecione o cadastro correto para {name || 'este contato'}. Nomes iguais não são vinculados automaticamente.</DialogDescription></DialogHeader>
        {loading ? <p role="status">Conferindo agendamento e cobrança…</p> : <>
          {permitted ? <>
            <AgendaPatientPicker value={selection.name} selectedId={selection.id} patients={patients} onSearch={searchPatients} disabled={saving} allowGuest={false}
              onChange={(patientName, id) => setSelection({ name: patientName, id })} />
            <p className="text-sm text-muted-foreground">O horário, o nome original e o histórico serão preservados.{charge && ` Cobrança: ${formatCurrency(charge.amount)} (${({ paid: 'paga', pending: 'pendente', overdue: 'vencida', refunded: 'estornada' })[charge.status] || charge.status}). O vínculo não altera pagamentos.`}</p>
            <Button type="button" variant="outline" className="min-h-11 w-full" disabled={saving} onClick={() => setCreateOpen(true)}>Criar cadastro no formulário de Pacientes</Button>
            <p className="text-xs text-muted-foreground">O cadastro com email segue o convite existente. Sem email, segue o perfil offline. Depois, confirme o vínculo aqui.</p>
          </> : context && <p role="status">Este agendamento já tem paciente ou está encerrado. O histórico não será reatribuído.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="button" variant="ghost" className="min-h-11" disabled={saving} onClick={() => setRevision(value => value + 1)}>Conferir dados atuais</Button>
        </>}
        <DialogFooter className="flex-row gap-2"><Button variant="outline" className="min-h-11 flex-1" disabled={saving} onClick={() => onOpenChange(false)}>Agora não</Button>
          <Button className="min-h-11 flex-1" disabled={loading || saving || !permitted || !selection.id} onClick={link}>{saving ? 'Vinculando…' : 'Confirmar vínculo'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    {createOpen && <AddPatientModal isOpen={createOpen} setIsOpen={setCreateOpen} initialName={name} preserveExistingDraft
      onPatientAdded={async data => {
        setRevision(value => value + 1);
        const id = data?.userId;
        if (!id || owner.current !== userId) return;
        const found = await searchPatients('', 0, id);
        if (found.patients[0]) setSelection({ name: found.patients[0].name, id });
        else setError('Cadastro criado. O vínculo só será permitido quando houver um episódio de atendimento ativo autorizado.');
      }} />}
  </>;
}
