import React from 'react';
import { Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatCurrency } from '@/lib/utils';

export default function FinancialGoal({ goal, state, income, loading, incomeUnavailable, onSettings, onRetry }) {
    const ready = state === 'ready' && !loading;
    const hasGoal = ready && goal > 0;
    const progress = hasGoal ? Math.max(0, Math.min(100, income / goal * 100)) : 0;
    return (
        <section aria-label="Meta financeira mensal" className="mb-5 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" aria-hidden="true" />Meta Financeira Mensal</h2>
                <Button variant="ghost" size="sm" onClick={onSettings}>Editar meta</Button>
            </div>
            {state === 'error' ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">Meta indisponível. <Button variant="outline" size="sm" onClick={onRetry}>Tentar carregar meta</Button></div>
                : incomeUnavailable ? <p className="text-sm text-muted-foreground">Progresso indisponível. Tente carregar os lançamentos novamente.</p>
                    : !ready ? <p role="status" className="text-sm text-muted-foreground">Carregando meta e recebimentos…</p>
                    : !hasGoal ? <p className="text-sm text-muted-foreground">Sem meta definida. Configure uma meta para acompanhar seu progresso.</p>
                        : <div className="mt-2 grid gap-3 md:grid-cols-2 md:items-center">
                            <p className="text-sm tabular-nums break-words">Recebido: <strong>{formatCurrency(income)}</strong> · Meta: <strong>{formatCurrency(goal)}</strong><span className="block text-muted-foreground">{income < goal ? `Faltam ${formatCurrency(goal - income)}` : income === goal ? 'Meta atingida' : `Superou em ${formatCurrency(income - goal)}`}</span></p>
                            <div><p className="mb-1 text-xs text-muted-foreground">Progresso <span className="float-right tabular-nums">{progress.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span></p><Progress aria-label="Progresso da meta financeira mensal" value={progress} className="h-2" /></div>
                        </div>}
        </section>
    );
}
