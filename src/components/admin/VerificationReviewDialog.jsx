import { formatDateToIsoDate } from '@/lib/utils/date';
import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { decideAdminVerification } from '@/services/adminService';
import { verificationDecision } from '@/portals/admin/model/verificationDecision';

export default function VerificationReviewDialog({ verification, open, onOpenChange, onCompleted, canWrite = false }) {
  const [decision, setDecision] = useState('approved');
  const [reason, setReason] = useState('');
  const [sourceUrl, setSourceUrl] = useState('https://cfn.org.br/');
  const [validUntil, setValidUntil] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const intent = useRef(null);
  const generation = useRef(0);

  const { id, status, updated_at: revision, professional_role: role } = verification || {};
  useEffect(() => {
    generation.current += 1;
    intent.current = null;
    setSubmitting(false);
    if (!open || !id) return;
    setDecision(status === 'approved' ? 'suspended' : 'approved');
    setReason('');
    setError('');
    setSourceUrl('https://cfn.org.br/');
    const date = new Date();
    date.setMonth(date.getMonth() + (role === 'student' ? 6 : 12));
    setValidUntil(formatDateToIsoDate(date));
    return () => { generation.current += 1; };
  }, [open, id, status, revision, role]);

  if (!verification) return null;
  const actionable = canWrite && ['pending', 'approved'].includes(verification.status);

  const submit = async () => {
    if (!actionable || submitting) return;
    setError('');
    const current = generation.current;
    try {
      const payload = verificationDecision({ verification, decision, reason, sourceUrl, validUntil });
      const fingerprint = JSON.stringify(payload);
      if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, nonce: crypto.randomUUID() };
      setSubmitting(true);
      const result = await decideAdminVerification({ ...payload, nonce: intent.current.nonce });
      if (current !== generation.current) return;
      if (result.error) throw result.error;
      onOpenChange(false);
      onCompleted?.();
    } catch (failure) {
      if (current === generation.current) setError(failure.code === 'PT409' ? 'A verificação mudou. Atualize a fila e revise a decisão novamente.' : failure.code === '42501' ? 'Sua permissão de escrita não está disponível. Atualize a fila.' : 'code' in failure ? 'A decisão não foi confirmada. Você pode tentar novamente; a mesma intenção não será duplicada.' : failure.message || 'Não foi possível registrar a decisão.');
    } finally {
      if (current === generation.current) setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Analisar verificação profissional</DialogTitle>
          <DialogDescription>{verification.name} · {verification.professional_role === 'student' ? 'Estudante' : `CRN ${verification.crn_region || ''} ${verification.crn_number || ''}`}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {!actionable ? <p role="status" className="text-sm text-muted-foreground">{canWrite ? 'Consulta somente. Uma nova decisão requer um novo envio do profissional.' : 'Seu perfil permite consultar a solicitação. As decisões exigem permissão de escrita.'}</p> : <>
          <div className="flex flex-col gap-2"><Label htmlFor="verification-decision">Decisão</Label><Select value={decision} onValueChange={setDecision} disabled={submitting}><SelectTrigger id="verification-decision"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{verification.status === 'approved' ? <SelectItem value="suspended">Suspender</SelectItem> : <><SelectItem value="approved">Aprovar</SelectItem><SelectItem value="needs_information">Solicitar complementação</SelectItem><SelectItem value="rejected">Reprovar</SelectItem></>}</SelectGroup></SelectContent></Select></div>
          {decision === 'approved' ? <><div className="flex flex-col gap-2"><Label htmlFor="source-url">Fonte oficial consultada</Label><Input id="source-url" required disabled={submitting} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></div><div className="flex flex-col gap-2"><Label htmlFor="valid-until">Validade</Label><Input id="valid-until" type="date" required disabled={submitting} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></div></> : null}
          <div className="flex flex-col gap-2"><Label htmlFor="decision-reason">Justificativa</Label><Textarea id="decision-reason" required maxLength={500} disabled={submitting} value={reason} onChange={(event) => setReason(event.target.value)} /></div>
          <p className="text-xs text-muted-foreground">{decision === 'suspended' ? 'Suspender remove a capacidade clínica desta verificação. Confira o impacto antes de registrar.' : 'A decisão altera a verificação profissional e fica registrada no histórico.'}</p>
          </>}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{actionable ? 'Cancelar' : 'Fechar'}</Button>{actionable && <Button onClick={submit} disabled={submitting}>{submitting ? <Loader2 className="animate-spin" /> : null} Registrar decisão</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
