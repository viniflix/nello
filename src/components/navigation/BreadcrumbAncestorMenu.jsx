import React from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export default function BreadcrumbAncestorMenu({ ancestors, onSelect, disabled, focusClass, compact }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><button type="button" disabled={disabled} className={cn(focusClass, compact && 'sm:hidden')} aria-label="Ver níveis anteriores"><MoreHorizontal aria-hidden="true" className="h-4 w-4" /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="max-w-[calc(100vw-2rem)] motion-reduce:animate-none">
      {ancestors.map((crumb, index) => <DropdownMenuItem key={index} disabled={disabled} className="min-h-11" {...(onSelect ? { onSelect: () => onSelect(crumb) } : { asChild: true })}>{onSelect ? crumb.label : <Link to={crumb.to}>{crumb.label}</Link>}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
