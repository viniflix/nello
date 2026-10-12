import { VisibleChart } from '@/components/ui/visible-chart';
import React, { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { formatCurrency } from '@/lib/utils';
import { formatFinancialAxis } from '@/lib/utils/financial-presentation';
import FinancialChartData from './FinancialChartData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLORS = {
    income: 'hsl(var(--primary))',
    expense: 'hsl(var(--destructive))',
    pie: ['#527b42', '#ed7204', '#7a8c6a', '#a97c54', '#55646a', '#a6b89a', '#bd9f83']
};

export default function FinancialCharts({ cashFlowData, expenseDistribution, projectedCashFlow, loading, loadError, projectionState, onRetry, onProjectionRetry }) {
    const reducedMotion = useReducedMotion();
    const formattedCashFlow = useMemo(() => {
        if (!cashFlowData || cashFlowData.length === 0) return [];

        return cashFlowData.map(item => ({
            ...item,
            date: format(parseISO(item.date), 'dd/MM', { locale: ptBR })
        }));
    }, [cashFlowData]);

    const formattedExpenses = useMemo(() => {
        if (!expenseDistribution || expenseDistribution.length === 0) return [];
        return expenseDistribution;
    }, [expenseDistribution]);

    const formattedProjection = useMemo(() => {
        if (!projectedCashFlow || projectedCashFlow.length === 0) return [];

        return projectedCashFlow.map(item => ({
            ...item,
            date: format(parseISO(item.date), 'dd/MM', { locale: ptBR })
        }));
    }, [projectedCashFlow]);

    return (
        <>
            {/* Cash Flow Chart */}
            <Card className="min-w-0 overflow-hidden bg-card rounded-2xl shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="font-sans text-base font-semibold tracking-normal text-foreground">Fluxo de Caixa</CardTitle>
                    <CardDescription>Pagamentos e despesas efetivos por data; estornos são deduzidos.</CardDescription>
                </CardHeader>
                <CardContent className="min-w-0">
                    {loading ? (
                        <div className="h-[300px] flex items-center justify-center">
                            <div className="text-muted-foreground">Carregando...</div>
                        </div>
                    ) : loadError ? (<ChartMessage onAction={onRetry} action="Tentar novamente">Fluxo de caixa indisponível.</ChartMessage>) : formattedCashFlow.length === 0 ? (
                        <ChartMessage >Nenhum pagamento ou estorno neste mês.</ChartMessage>
                    ) : (
                        <div aria-hidden="true"><VisibleChart width="100%" height={280}>
                            <BarChart data={formattedCashFlow}>
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 12 }}
                                    angle={-45}
                                    textAnchor="end"
                                    height={80}
                                />
                                <YAxis width={86}
                                    tick={{ fontSize: 12 }}
                                    tickFormatter={formatFinancialAxis}
                                />
                                <Tooltip
                                    formatter={value => formatCurrency(Number(value))}
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--card))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '6px'
                                    }}
                                />
                                <Legend />
                                <Bar isAnimationActive={!reducedMotion} animationDuration={180}
                                    dataKey="income"
                                    name="Recebimentos"
                                    fill={COLORS.income}
                                    radius={[4, 4, 0, 0]}
                                />
                                <Bar isAnimationActive={!reducedMotion} animationDuration={180}
                                    dataKey="expenses"
                                    name="Despesas pagas"
                                    fill={COLORS.expense}
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </VisibleChart></div>
                    )}
                    {!loading && !loadError && formattedCashFlow.length > 0 && <FinancialChartData label="Dados do fluxo de caixa" columns={['Data', 'Recebimentos', 'Despesas pagas']} rows={formattedCashFlow.map(row => [row.date, formatCurrency(row.income), formatCurrency(row.expenses)])} />}
                </CardContent>
            </Card>

            {/* Expense Distribution & Projected Cash Flow */}
            <Card className="min-w-0 overflow-hidden bg-card rounded-2xl shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="font-sans text-base font-semibold tracking-normal text-foreground">Análise Financeira</CardTitle>
                    <CardDescription>Despesas do mês. Projeção independente: hoje e os próximos 30 dias, condicionada aos recebimentos e pagamentos.</CardDescription>
                </CardHeader>
                <CardContent className="min-w-0">
                    <Tabs defaultValue="expenses" className="w-full">
                        <TabsList className="grid h-auto min-h-11 w-full grid-cols-2">
                            <TabsTrigger className="min-h-11 whitespace-normal py-2 leading-tight" value="expenses">Despesas</TabsTrigger>
                            <TabsTrigger className="min-h-11 whitespace-normal py-2 leading-tight" value="projection">Projeção (30 dias)</TabsTrigger>
                        </TabsList>
                        <TabsContent value="expenses" className="mt-4">
                            {loading ? (
                                <div className="h-[300px] flex items-center justify-center">
                                    <div className="text-muted-foreground">Carregando...</div>
                                </div>
                            ) : loadError ? (<ChartMessage onAction={onRetry} action="Tentar novamente">Despesas indisponíveis.</ChartMessage>) : formattedExpenses.length === 0 ? (
                                <ChartMessage >Nenhuma despesa paga neste mês.</ChartMessage>
                            ) : (
                                <div aria-hidden="true"><VisibleChart width="100%" height={280}>
                                    <PieChart>
                                        <Pie isAnimationActive={!reducedMotion} animationDuration={180}
                                            data={formattedExpenses}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                                            outerRadius={80}
                                            fill={COLORS.income}
                                            dataKey="value"
                                        >
                                            {formattedExpenses.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={COLORS.pie[index % COLORS.pie.length]}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={value => formatCurrency(Number(value))}
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--card))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </PieChart>
                                </VisibleChart></div>
                            )}
                            {!loading && !loadError && formattedExpenses.length > 0 && <FinancialChartData label="Dados das despesas por categoria" columns={['Categoria', 'Valor']} rows={formattedExpenses.map(row => [row.name, formatCurrency(row.value)])} />}
                        </TabsContent>
                        <TabsContent value="projection" className="mt-4">
                            {projectionState === 'loading' ? (
                                <ChartMessage>Carregando projeção...</ChartMessage>
                            ) : projectionState === 'error' ? (<ChartMessage onAction={onProjectionRetry} action="Tentar novamente">Projeção indisponível.</ChartMessage>) : formattedProjection.length === 0 ? (
                                <ChartMessage >Nenhuma pendência prevista nos próximos 30 dias.</ChartMessage>
                            ) : (
                                <div aria-hidden="true"><VisibleChart width="100%" height={280}>
                                    <LineChart data={formattedProjection}>
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 12 }}
                                            angle={-45}
                                            textAnchor="end"
                                            height={80}
                                        />
                                        <YAxis width={86}
                                            tick={{ fontSize: 12 }}
                                            tickFormatter={formatFinancialAxis}
                                        />
                                        <Tooltip
                                            formatter={value => formatCurrency(Number(value))}
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--card))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '6px'
                                            }}
                                        />
                                        <Legend />
                                        <Line isAnimationActive={!reducedMotion} animationDuration={180}
                                            type="monotone"
                                            dataKey="balance"
                                            name="Saldo Projetado"
                                            stroke={COLORS.income}
                                            strokeWidth={2}
                                            dot={{ r: 3 }}
                                        />
                                    </LineChart>
                                </VisibleChart></div>
                            )}
                            {projectionState === 'ready' && formattedProjection.length > 0 && <FinancialChartData label="Dados da projeção de caixa" columns={['Data', 'Saldo projetado']} rows={formattedProjection.map(row => [row.date, formatCurrency(row.balance)])} />}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </>
    );
}


function ChartMessage({ children, onAction, action }) { return <div className="flex min-h-28 flex-col items-center justify-center gap-3 py-6 text-center text-sm text-muted-foreground"><p>{children}</p>{onAction && <Button variant="outline" size="sm" onClick={onAction}>{action}</Button>}</div>; }
