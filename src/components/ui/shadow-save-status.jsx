import React from 'react';
import { AlertCircle, Cloud, CloudOff, Loader2, Monitor, RefreshCw } from 'lucide-react';

const labels = {
  loading: 'Verificando rascunho',
  local: 'Salvo neste dispositivo; enviando...',
  recoverable: 'Rascunho disponível para recuperação',
  saving: 'Salvando...',
  saved: 'Rascunho salvo',
  error: 'Erro ao salvar; tente novamente',
  conflict: 'Conflito entre versões; revise antes de continuar',
};

export function ShadowSaveStatus({ status, onRetry }) {
  if (!labels[status]) return null;
  const Icon = status === 'saving' ? Loader2 : status === 'saved' ? Cloud
    : status === 'local' || status === 'recoverable' ? Monitor : status === 'loading' ? RefreshCw
      : status === 'error' ? CloudOff : AlertCircle;
  return <span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 text-xs ${status === 'error' || status === 'conflict' ? 'text-destructive' : 'text-muted-foreground'}`}>
    <Icon className={`h-3.5 w-3.5 ${status === 'saving' || status === 'loading' ? 'animate-spin' : ''}`} />
    {labels[status]}
    {status === 'error' && onRetry && <button type="button" className="underline" onClick={onRetry}>Tentar novamente</button>}
  </span>;
}

export function ShadowRecovery({ recovery, onRestore, onDiscard }) {
  if (!recovery) return null;
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
    <span className="flex-1">Há um rascunho {recovery.source === 'device' ? 'neste dispositivo' : 'salvo na nuvem'}. {recovery.conflict ? 'Ele diverge da versão na nuvem; revise antes de substituir.' : 'Deseja retomar o trabalho?'}</span>
    <button type="button" className="rounded bg-primary px-3 py-1.5 text-primary-foreground" onClick={onRestore}>{recovery.conflict ? 'Usar meu rascunho' : 'Retomar'}</button>
    <button type="button" className="rounded border px-3 py-1.5" onClick={onDiscard}>{recovery.conflict ? 'Ver versão na nuvem' : 'Descartar rascunho'}</button>
  </div>;
}
