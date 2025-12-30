import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, parseISO, addDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLORS = {
    income: '#22c55e', // green-500
    expense: '#ef4444', // red-500
    pie: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#f97316']
};

export default function FinancialCharts({ cashFlowData, expenseDistribution, projectedCashFlow, loading }) {
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
            <Card>
                <CardHeader>
                    <CardTitle>Fluxo de Caixa</CardTitle>
                    <CardDescription>Receitas vs Despesas por período</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-[300px] flex items-center justify-center">
                            <div className="text-muted-foreground">Carregando...</div>
                        </div>
                    ) : formattedCashFlow.length === 0 ? (
                        <div className="h-[300px] flex items-center justify-center">
                            <div className="text-muted-foreground">Nenhum dado disponível</div>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={formattedCashFlow}>
                                <XAxis 
                                    dataKey="date" 
                                    tick={{ fontSize: 12 }}
                                    angle={-45}
                                    textAnchor="end"
                                    height={80}
                                />
                                <YAxis 
                                    tick={{ fontSize: 12 }}
                                    tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                                />
                                <Tooltip 
                                    formatter={(value) => `R$ ${value.toFixed(2)}`}
                                    contentStyle={{ 
                                        backgroundColor: 'hsl(var(--card))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '6px'
                                    }}
                                />
                                <Legend />
                                <Bar 
                                    dataKey="income" 
                                    name="Receitas" 
                                    fill={COLORS.income}
                                    radius={[4, 4, 0, 0]}
                                />
                                <Bar 
                                    dataKey="expenses" 
                                    name="Despesas" 
                                    fill={COLORS.expense}
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {/* Expense Distribution & Projected Cash Flow */}
            <Card>
                <CardHeader>
                    <CardTitle>Análise Financeira</CardTitle>
                    <CardDescription>Distribuição de despesas e projeção de caixa</CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="expenses" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="expenses">Despesas</TabsTrigger>
                            <TabsTrigger value="projection">Projeção (30 dias)</TabsTrigger>
                        </TabsList>
                        <TabsContent value="expenses" className="mt-4">
                            {loading ? (
                                <div className="h-[300px] flex items-center justify-center">
                                    <div className="text-muted-foreground">Carregando...</div>
                                </div>
                            ) : formattedExpenses.length === 0 ? (
                                <div className="h-[300px] flex items-center justify-center">
                                    <div className="text-muted-foreground">Nenhuma despesa registrada</div>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={formattedExpenses}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                            outerRadius={100}
                                            fill="#8884d8"
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
                                            formatter={(value) => `R$ ${value.toFixed(2)}`}
                                            contentStyle={{ 
                                                backgroundColor: 'hsl(var(--card))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '6px'
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </TabsContent>
                        <TabsContent value="projection" className="mt-4">
                            {loading ? (
                                <div className="h-[300px] flex items-center justify-center">
                                    <div className="text-muted-foreground">Carregando...</div>
                                </div>
                            ) : formattedProjection.length === 0 ? (
                                <div className="h-[300px] flex items-center justify-center">
                                    <div className="text-muted-foreground">Nenhuma projeção disponível</div>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={formattedProjection}>
                                        <XAxis 
                                            dataKey="date" 
                                            tick={{ fontSize: 12 }}
                                            angle={-45}
                                            textAnchor="end"
                                            height={80}
                                        />
                                        <YAxis 
                                            tick={{ fontSize: 12 }}
                                            tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                                        />
                                        <Tooltip 
                                            formatter={(value) => `R$ ${value.toFixed(2)}`}
                                            contentStyle={{ 
                                                backgroundColor: 'hsl(var(--card))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '6px'
                                            }}
                                        />
                                        <Legend />
                                        <Line 
                                            type="monotone" 
                                            dataKey="balance" 
                                            name="Saldo Projetado" 
                                            stroke="#3b82f6" 
                                            strokeWidth={2}
                                            dot={{ r: 3 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </>
    );
}

