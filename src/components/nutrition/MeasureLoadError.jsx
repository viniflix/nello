import React from 'react';
import {Button} from '@/components/ui/button';
import {failurePresentation} from '@/lib/utils/failure';

export default function MeasureLoadError({error, onRetry, loading}) {
  if (!error) return null;
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
    <p className="flex-1">Não foi possível carregar suas medidas. {failurePresentation(error).message}</p>
    <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={loading}>Tentar carregar novamente</Button>
  </div>;
}
