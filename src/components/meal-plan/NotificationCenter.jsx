import React from 'react';
import { AlertCircle, Clock, RefreshCw, Trash2, Edit, CheckCircle2, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const NotificationItem = ({
    title,
    description,
    type = 'info',
    actions = [],
    metadata = null
}) => {
    const typeStyles = {
        info: 'border-l-blue-500 bg-blue-50/30',
        warning: 'border-l-amber-500 bg-amber-50/30',
        success: 'border-l-green-500 bg-green-50/30',
        error: 'border-l-red-500 bg-red-50/30',
    };

    const iconStyles = {
        info: 'text-blue-500',
        warning: 'text-amber-600',
        success: 'text-green-500',
        error: 'text-red-500',
    };

    const Icon = type === 'warning' ? AlertCircle : (type === 'success' ? CheckCircle2 : Clock);

    return (
        <div className={cn(
            "grid grid-cols-1 items-start gap-3 p-[min(1rem,12px)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center border rounded-xl border-l-[4px] transition-shadow motion-reduce:transition-none hover:shadow-sm",
            typeStyles[type] || typeStyles.info
        )}>
            <div className={cn("p-2 rounded-lg bg-white shadow-xs shrink-0 justify-self-start", iconStyles[type])}>
                <Icon className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0 [overflow-wrap:anywhere]">
                <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-foreground leading-tight">{title}</h4>
                    {metadata && <span className="text-xs font-medium text-muted-foreground bg-white/60 px-1.5 py-0.5 rounded border border-black/5">{metadata}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
            </div>

            <div className="min-w-0 flex flex-wrap items-center gap-2">
                {actions.map((action, idx) => (
                    <Button
                        key={idx}
                        size="sm"
                        variant={action.variant || "outline"}
                        onClick={action.onClick}
                        disabled={action.disabled}
                        className={cn("min-h-11 h-auto py-2 px-[min(0.75rem,12px)] max-w-full whitespace-normal text-left text-xs font-bold gap-1.5 [&>svg]:shrink-0", action.className)}
                    >
                        {action.icon && <action.icon className="w-3.5 h-3.5" />}
                        {action.label}
                    </Button>
                ))}
            </div>
        </div>
    );
};

const NotificationCenter = ({
    pendingDrafts = [],
    syncFlags = null,
    onDiscardDraft,
    onDiscardAllDrafts,
    onResumeDraft,
    onMarkAsReviewed,
    onReviewNow,
    isDiscarding = false
}) => {
    const hasNotifications = pendingDrafts.length > 0 || syncFlags?.needs_meal_plan_review;

    if (!hasNotifications) return null;

    return (
        <div className="flex flex-col gap-4">
            {/* Rascunho Alert */}
            {pendingDrafts.length > 0 && (
                <NotificationItem
                    type="info"
                    title={pendingDrafts.length === 1 ? "Rascunho em andamento" : `${pendingDrafts.length} rascunhos pendentes`}
                    description={
                        pendingDrafts.length === 1
                            ? `Você tem um plano em criação salvo: "${pendingDrafts[0].name || 'Novo Plano'}".`
                            : `Deseja continuar o rascunho mais recente ("${pendingDrafts[0].name || 'Novo Plano'}") ou gerenciar os outros?`
                    }
                    metadata={pendingDrafts.length > 1 ? `+${pendingDrafts.length - 1} rascunhos` : null}
                    actions={[
                        {
                            label: 'Descartar',
                            variant: 'ghost',
                            icon: Trash2,
                            onClick: () => onDiscardDraft(pendingDrafts[0]),
                            disabled: isDiscarding,
                            className: 'text-muted-foreground hover:text-destructive'
                        },
                        {
                            label: 'Retomar rascunho',
                            variant: 'default',
                            icon: Edit,
                            onClick: () => onResumeDraft(pendingDrafts[0]),
                            disabled: isDiscarding,
                            className: 'bg-blue-600 hover:bg-blue-700 text-white'
                        }
                    ]}
                />
            )}

            {/* Sync Alert */}
            {syncFlags?.needs_meal_plan_review && (
                <NotificationItem
                    type="warning"
                    title="Plano alimentar requer revisão"
                    description="Confira a avaliação clínica e a meta energética antes de manter este plano alimentar."
                    metadata="Ação Necessária"
                    actions={[
                        {
                            label: 'Marcar como revisado',
                            variant: 'ghost',
                            icon: CheckCircle2,
                            onClick: onMarkAsReviewed,
                            className: 'text-amber-800 hover:bg-amber-100/50'
                        },
                        {
                            label: 'Revisar agora',
                            variant: 'default',
                            icon: RefreshCw,
                            onClick: onReviewNow,
                            className: 'bg-amber-700 hover:bg-amber-800 text-white'
                        }
                    ]}
                />
            )}
        </div>
    );
};

export default NotificationCenter;
