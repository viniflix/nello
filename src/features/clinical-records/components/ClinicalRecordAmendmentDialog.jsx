import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const unicodeLength = (value) => Array.from(value).length;

const DialogBody = ({
  mode,
  impact,
  reason,
  setReason,
  acknowledged,
  setAcknowledged,
  password,
  setPassword,
  reauthenticationAvailable,
  reauthenticationError,
  reasonRef,
}) => {
  const invalidReason = reason.length > 0
    && (unicodeLength(reason.trim()) < 20 || unicodeLength(reason.trim()) > 2000);
  const isInvalidation = mode === 'invalidation';

  return (
    <div className="space-y-4">
      {(impact?.visibility === 'shared_with_patient' || impact?.hasPatientNotice) ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            Este registro foi compartilhado. O motivo da correção ou invalidação poderá ser
            exibido ao paciente. Use texto objetivo, respeitoso e sem conteúdo interno desnecessário.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`amendment-reason-${mode}`}>
          Motivo da {isInvalidation ? 'invalidação' : 'correção'}
        </Label>
        <Textarea
          id={`amendment-reason-${mode}`}
          ref={reasonRef}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={4000}
          aria-describedby={`amendment-reason-help-${mode}`}
          aria-invalid={invalidReason}
        />
        <p id={`amendment-reason-help-${mode}`} className="text-xs text-muted-foreground">
          Informe entre 20 e 2.000 caracteres ({unicodeLength(reason.trim())}/2.000).
        </p>
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id={`amendment-impact-${mode}`}
          checked={acknowledged}
          onCheckedChange={(checked) => setAcknowledged(checked === true)}
        />
        <Label htmlFor={`amendment-impact-${mode}`} className="font-normal leading-5">
          Confirmo que revisei o impacto desta alteração e suas referências conhecidas.
        </Label>
      </div>

      {isInvalidation ? (
        <div className="space-y-2">
          <Label htmlFor="clinical-invalidation-password">Senha da conta atual</Label>
          <Input
            id="clinical-invalidation-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={!reauthenticationAvailable}
          />
          {!reauthenticationAvailable ? (
            <p role="alert" className="text-sm text-destructive">
              A reautenticação por e-mail e senha não está disponível. A invalidação permanece bloqueada.
            </p>
          ) : null}
          {reauthenticationError ? (
            <p role="alert" className="text-sm text-destructive">
              Não foi possível confirmar sua identidade. Verifique sua senha e tente novamente.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const ClinicalRecordAmendmentDialog = ({
  open,
  mode = 'correction',
  impact,
  onOpenChange,
  onConfirm,
  onReauthenticate,
  pending = false,
}) => {
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reauthenticationError, setReauthenticationError] = useState(false);
  const reasonRef = useRef(null);
  const isInvalidation = mode === 'invalidation';
  const normalizedReason = reason.trim();
  const reasonLength = unicodeLength(normalizedReason);
  const reasonValid = reasonLength >= 20 && reasonLength <= 2000;
  const reauthenticationAvailable = typeof onReauthenticate === 'function';
  const isPending = pending || submitting;
  const canSubmit = reasonValid
    && acknowledged
    && !isPending
    && (!isInvalidation || (reauthenticationAvailable && password.length > 0));

  useEffect(() => {
    if (open) return;
    setReason('');
    setAcknowledged(false);
    setPassword('');
    setSubmitting(false);
    setReauthenticationError(false);
  }, [open]);

  const focusReason = (event) => {
    event.preventDefault();
    reasonRef.current?.focus();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setReauthenticationError(false);
    try {
      if (isInvalidation) {
        const reauthenticated = await onReauthenticate(password);
        if (!reauthenticated) {
          setReauthenticationError(true);
          return;
        }
      }
      await onConfirm(normalizedReason, {
        impact_hash: impact?.impactHash || impact?.impact_hash || null,
        confirmed: true,
      });
    } catch {
      if (isInvalidation) setReauthenticationError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const body = (
    <DialogBody
      mode={mode}
      impact={impact}
      reason={reason}
      setReason={setReason}
      acknowledged={acknowledged}
      setAcknowledged={setAcknowledged}
      password={password}
      setPassword={setPassword}
      reauthenticationAvailable={reauthenticationAvailable}
      reauthenticationError={reauthenticationError}
      reasonRef={reasonRef}
    />
  );

  if (isInvalidation) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent onOpenAutoFocus={focusReason}>
          <AlertDialogHeader>
            <AlertDialogTitle>Invalidar registro clínico</AlertDialogTitle>
            <AlertDialogDescription>
              A invalidação preserva o registro no histórico e exige confirmação de identidade.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {body}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={!canSubmit}
              onClick={(event) => void handleSubmit(event)}
            >
              {isPending ? 'Invalidando...' : 'Invalidar registro'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={focusReason}>
        <DialogHeader>
          <DialogTitle>Corrigir registro clínico</DialogTitle>
          <DialogDescription>
            Uma nova versão será criada sem apagar o registro assinado original.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={(event) => void handleSubmit(event)}>
            {isPending ? 'Iniciando...' : 'Iniciar correção'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ClinicalRecordAmendmentDialog;
