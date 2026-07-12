import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  requestProfessionalVerificationInformation,
  reviewProfessionalVerification,
  suspendProfessionalVerification
} from '@/services/adminService';

export default function VerificationReviewDialog({ verification, open, onOpenChange, onCompleted }) {
  const [decision, setDecision] = useState('approved');
  const [reason, setReason] = useState('');
  const [sourceUrl, setSourceUrl] = useState('https://cfn.org.br/');
  const [validUntil, setValidUntil] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !verification) return;
    setDecision(verification.status === 'approved' ? 'suspended' : 'approved');
    setReason('');
    setError('');
    const date = new Date();
    date.setMonth(date.getMonth() + (verification.professional_role === 'student' ? 6 : 12));
    setValidUntil(date.toISOString().slice(0, 10));
  }, [open, verification]);

  if (!verification) return null;

  const submit = async () => {
    setSubmitting(true);
    setError('');
    let result;
    if (decision === 'needs_information') {
      result = await requestProfessionalVerificationInformation(verification.id, reason);
    } else if (decision === 'suspended') {
      result = await suspendProfessionalVerification(verification.id, reason);
    } else {
      result = await reviewProfessionalVerification({
        verificationId: verification.id,
        decision,
        reason,
        sourceUrl: decision === 'approved' ? sourceUrl : null,
        validUntil: decision === 'approved' ? new Date(`${validUntil}T23:59:59`).toISOString() : null
      });
    }
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message || 'Não foi possível registrar a decisão.');
      return;
    }
    onOpenChange(false);
    onCompleted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Analisar verificação profissional</DialogTitle>
          <DialogDescription>{verification.name} · {verification.professional_role === 'student' ? 'Estudante' : `CRN ${verification.crn_region || ''} ${verification.crn_number || ''}`}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2"><Label>Decisão</Label><Select value={decision} onValueChange={setDecision}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{verification.status === 'approved' ? <SelectItem value="suspended">Suspender</SelectItem> : <><SelectItem value="approved">Aprovar</SelectItem><SelectItem value="needs_information">Solicitar complementação</SelectItem><SelectItem value="rejected">Reprovar</SelectItem></>}</SelectGroup></SelectContent></Select></div>
          {decision === 'approved' ? <><div className="flex flex-col gap-2"><Label htmlFor="source-url">Fonte oficial consultada</Label><Input id="source-url" required value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></div><div className="flex flex-col gap-2"><Label htmlFor="valid-until">Validade</Label><Input id="valid-until" type="date" required value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></div></> : null}
          <div className="flex flex-col gap-2"><Label htmlFor="decision-reason">Justificativa</Label><Textarea id="decision-reason" required value={reason} onChange={(event) => setReason(event.target.value)} /></div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={submitting}>{submitting ? <Loader2 className="animate-spin" /> : null} Registrar decisão</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
