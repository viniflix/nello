import React, { lazy, Suspense, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { getPortalBreadcrumbs, getPortalBreadcrumbPolicy, getPortalBreadcrumbContainer } from '@/app/router/portalBreadcrumbs';
import { cn } from '@/lib/utils';

const BreadcrumbAncestorMenu = lazy(() => import('./BreadcrumbAncestorMenu'));

export default function PortalBreadcrumbs({ className, embedded = false, extraLabel, onBack, busy = false }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const lock = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState(false);
  const policy = getPortalBreadcrumbPolicy(pathname);
  const items = getPortalBreadcrumbs(pathname, search);
  if (!policy.visible || (!embedded && policy.owner === 'header') || !items.length) return null;
  if (extraLabel) {
    items[items.length - 1] = { ...items.at(-1), closeEditor: true };
    items.push({ label: extraLabel });
  }
  const disabled = busy || leaving;
  const focus = 'inline-flex min-h-11 min-w-11 items-center rounded-lg px-2 transition-colors duration-150 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none';
  const go = async crumb => {
    if (disabled || lock.current) return;
    lock.current = true;
    setLeaving(true);
    setError(false);
    try {
      if (onBack && await onBack() === false) { setError(true); return; }
      if (!crumb.closeEditor) navigate(crumb.to);
    } catch { setError(true); }
    finally { lock.current = false; setLeaving(false); }
  };
  const ancestor = crumb => onBack
    ? <button type="button" disabled={disabled} className={focus} onClick={() => go(crumb)}>{crumb.label}</button>
    : <Link className={focus} to={crumb.to}>{crumb.label}</Link>;
  const deep = items.length > 2;
  return <nav aria-label="Navegação estrutural" aria-busy={leaving || undefined} className={cn('min-w-0 shrink-0 text-sm leading-relaxed text-muted-foreground', !embedded && ['mx-auto w-full pt-2', getPortalBreadcrumbContainer(pathname)], className)}>
    <ol className="flex min-w-0 flex-wrap items-center gap-x-1 [overflow-wrap:anywhere]">
      {deep && <li className="inline-flex items-center gap-1">
        <span className="hidden items-center gap-1 sm:inline-flex">{ancestor(items[0])}<ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /></span>
        <Suspense fallback={<button type="button" disabled className={cn(focus, items.length === 3 && 'sm:hidden')} aria-label="Ver níveis anteriores"><MoreHorizontal aria-hidden="true" className="h-4 w-4" /></button>}>
          <BreadcrumbAncestorMenu ancestors={items.slice(0, -2)} onSelect={onBack ? go : undefined} disabled={disabled} focusClass={focus} compact={items.length === 3} />
        </Suspense>
      </li>}
      {(deep ? items.slice(-2) : items).map((crumb, index, visible) => <li key={`${index}-${crumb.label}`} className="inline-flex min-w-0 max-w-full items-center gap-1">
        {(deep || index > 0) && <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
        {index === visible.length - 1 ? <span aria-current="page" className="px-2 py-2 font-medium text-foreground">{crumb.label}</span> : ancestor(crumb)}
      </li>)}
    </ol>
    {error && <p role="alert" className="pb-2 text-sm text-destructive">Não foi possível salvar a edição antes de sair. Revise o salvamento e tente novamente.</p>}
  </nav>;
}
