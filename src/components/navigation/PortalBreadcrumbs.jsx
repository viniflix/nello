import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { getPortalBreadcrumbs } from '@/app/router/portalBreadcrumbs';
import { cn } from '@/lib/utils';

export default function PortalBreadcrumbs({ className, embedded = false, extraLabel, onBack, busy = false }) {
  const { pathname, search } = useLocation();
  // The plan headers own their breadcrumb so returning from its editor can flush the draft.
  if (!embedded && /^\/nutritionist\/patients\/[^/]+\/meal-plan\/?$/.test(pathname)) return null;
  const items = getPortalBreadcrumbs(pathname, search);
  if (!items.length) return null;
  if (extraLabel) {
    items[items.length - 1] = { ...items.at(-1), onClick: onBack };
    items.push({ label: extraLabel });
  }
  const focus = 'rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
  return <nav aria-label="Navegação estrutural" className={cn('min-w-0 shrink-0 text-xs leading-relaxed text-muted-foreground', embedded ? '' : 'px-4 pt-4 pb-2 md:px-8', className)}>
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 [overflow-wrap:anywhere]">
      {items.map((crumb, index) => <li key={`${index}-${crumb.label}`} className="inline-flex min-w-0 max-w-full items-center gap-1.5">
        {index > 0 && <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0" />}
        {index === items.length - 1 ? <span aria-current="page" className="font-semibold text-foreground">{crumb.label}</span>
          : crumb.onClick ? <button type="button" disabled={busy} className={focus} onClick={crumb.onClick}>{crumb.label}</button>
            : <Link className={focus} to={crumb.to}>{crumb.label}</Link>}
      </li>)}
    </ol>
  </nav>;
}
