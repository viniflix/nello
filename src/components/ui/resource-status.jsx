import { Button } from '@/components/ui/button';

export function ResourceStatus({ resource, onRetry }) {
  const error = resource?.error;
  // A background read must not insert a row or announce routine revalidation.
  if (!error) return null;
  return <div className="min-h-8 text-sm" aria-busy={resource?.pending || undefined}>
    <div role="alert" className="flex flex-wrap items-center gap-2 text-destructive">
      <span>{error.message}{resource.hasSnapshot ? ' A última consulta confirmada continua visível.' : ''}</span>
      {onRetry && error.retryable && <Button variant="ghost" size="sm" disabled={resource.pending} onClick={onRetry}>Tentar novamente</Button>}
    </div>
  </div>;
}

export function ResourceSection({ resource, label, onRetry, children }) {
  return <section aria-busy={resource?.pending || undefined}>
    <ResourceStatus resource={resource} label={label} onRetry={onRetry} />
    {!resource || resource.hasSnapshot ? children : resource.initialLoading
      ? <p role="status" className="text-sm text-muted-foreground">Carregando {label}…</p> : null}
  </section>;
}
