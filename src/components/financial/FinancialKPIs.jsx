import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUp, ArrowDown, TrendingUp, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export default function FinancialKPIs({ summary, loading }) {
    const kpis = [
        {
            title: 'Receita Mensal',
            value: summary?.income || 0,
            netValue: summary?.netIncome || 0,
            icon: ArrowUp,
            color: 'text-primary',
            bgColor: 'bg-primary/10',
            showNet: true
        },
        {
            title: 'Despesas',
            value: summary?.expenses || 0,
            icon: ArrowDown,
            color: 'text-destructive',
            bgColor: 'bg-destructive/10'
        },
        {
            title: 'Resultado Líquido',
            value: summary?.netResult || 0,
            icon: TrendingUp,
            color: summary?.netResult >= 0 ? 'text-primary' : 'text-destructive',
            bgColor: summary?.netResult >= 0 ? 'bg-primary/10' : 'bg-destructive/10'
        },
        {
            title: 'A Receber (Pendente)',
            value: summary?.overdue || 0,
            icon: AlertCircle,
            color: 'text-secondary',
            bgColor: 'bg-secondary/10'
        }
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0">
            {kpis.map((kpi, index) => {
                const Icon = kpi.icon;
                return (
                    <Card key={index} className="min-w-0 overflow-hidden bg-card shadow-card-dark">
                        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                            <CardTitle className="text-xs md:text-sm font-semibold font-heading uppercase tracking-wide text-primary break-words">
                                {kpi.title}
                            </CardTitle>
                            <span className={`shrink-0 rounded-lg p-2 ${kpi.bgColor}`}>
                                <Icon className={`h-4 w-4 ${kpi.color}`} />
                            </span>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                            ) : (
                                <div className="min-w-0">
                                    <div className={`text-xl md:text-2xl font-bold break-words ${kpi.color}`}>
                                        {formatCurrency(kpi.value)}
                                    </div>
                                    {kpi.showNet && kpi.netValue !== kpi.value && (
                                        <div className="text-xs text-muted-foreground mt-1">
                                            Líquido: <span className="font-semibold">{formatCurrency(kpi.netValue)}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

