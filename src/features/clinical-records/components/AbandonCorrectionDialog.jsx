import React, { useEffect, useRef, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const unicodeLength = (value) => Array.from(value).length;

const AbandonCorrectionDialog = ({ open, onOpenChange, onConfirm, pending = false, error = null }) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const reasonRef = useRef(null);
  const normalizedReason = reason.trim();
  const reasonLength = unicodeLength(normalizedReason);
  const reasonValid = reasonLength >= 20 && reasonLength <= 2000;
  const isPending = pending || submitting;

  useEffect(() => {
    if (!open) {
      setReason('');
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!reasonValid || isPending) return;
    setSubmitting(true);
    try {
      await onConfirm(normalizedReason);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          reasonRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Abandonar correção</AlertDialogTitle>
          <AlertDialogDescription>
            O rascunho será preservado como abandonado e o registro assinado continuará vigente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="abandon-correction-reason">Motivo do abandono</Label>
          <Textarea
            id="abandon-correction-reason"
            ref={reasonRef}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={4000}
            aria-describedby="abandon-correction-reason-help"
            aria-invalid={reason.length > 0 && !reasonValid}
            disabled={isPending}
          />
          <p id="abandon-correction-reason-help" className="text-xs text-muted-foreground">
            Informe entre 20 e 2.000 caracteres ({reasonLength}/2.000).
          </p>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={!reasonValid || isPending}
            onClick={(event) => void handleSubmit(event)}
          >
            {isPending ? 'Abandonando...' : 'Confirmar abandono'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default AbandonCorrectionDialog;
