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
            color: 'text-green-600',
            bgColor: 'bg-green-50 dark:bg-green-950',
            borderColor: 'border-green-200 dark:border-green-800',
            showNet: true
        },
        {
            title: 'Despesas',
            value: summary?.expenses || 0,
            icon: ArrowDown,
            color: 'text-red-600',
            bgColor: 'bg-red-50 dark:bg-red-950',
            borderColor: 'border-red-200 dark:border-red-800'
        },
        {
            title: 'Resultado Líquido',
            value: summary?.netResult || 0,
            icon: TrendingUp,
            color: summary?.netResult >= 0 ? 'text-blue-600' : 'text-red-600',
            bgColor: summary?.netResult >= 0 ? 'bg-blue-50 dark:bg-blue-950' : 'bg-red-50 dark:bg-red-950',
            borderColor: summary?.netResult >= 0 ? 'border-blue-200 dark:border-blue-800' : 'border-red-200 dark:border-red-800'
        },
        {
            title: 'A Receber (Pendente)',
            value: summary?.overdue || 0,
            icon: AlertCircle,
            color: 'text-orange-600',
            bgColor: 'bg-orange-50 dark:bg-orange-950',
            borderColor: 'border-orange-200 dark:border-orange-800'
        }
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi, index) => {
                const Icon = kpi.icon;
                return (
                    <Card 
                        key={index} 
                        className={`${kpi.bgColor} ${kpi.borderColor} border-2 transition-all hover:shadow-md`}
                    >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                {kpi.title}
                            </CardTitle>
                            <Icon className={`h-4 w-4 ${kpi.color}`} />
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                            ) : (
                                <div>
                                    <div className={`text-2xl font-bold ${kpi.color}`}>
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

