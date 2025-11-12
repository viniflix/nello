import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

const WeightChart = ({ data = [], goalWeight = null }) => {
    if (data.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Evolução de Peso</CardTitle>
                    <CardDescription>Acompanhamento do peso ao longo do tempo</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        Sem dados para exibir o gráfico
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Preparar dados para o gráfico
    const chartData = data.map(record => ({
        date: format(new Date(record.record_date), 'dd/MM/yy'),
        fullDate: format(new Date(record.record_date), "dd 'de' MMM", { locale: ptBR }),
        weight: parseFloat(record.weight),
        originalDate: record.record_date
    }));

    // Calcular estatísticas
    const firstWeight = chartData[0]?.weight;
    const lastWeight = chartData[chartData.length - 1]?.weight;
    const weightChange = lastWeight - firstWeight;
    const minWeight = Math.min(...chartData.map(d => d.weight));
    const maxWeight = Math.max(...chartData.map(d => d.weight));

    // Determinar tendência
    const getTrendInfo = () => {
        if (Math.abs(weightChange) < 0.5) {
            return {
                icon: Minus,
                color: 'text-gray-600',
                label: 'Estável',
                value: weightChange.toFixed(1)
            };
        }
        if (weightChange > 0) {
            return {
                icon: TrendingUp,
                color: 'text-red-600',
                label: 'Aumento',
                value: `+${weightChange.toFixed(1)}`
            };
        }
        return {
            icon: TrendingDown,
            color: 'text-green-600',
            label: 'Redução',
            value: weightChange.toFixed(1)
        };
    };

    const trend = getTrendInfo();
    const TrendIcon = trend.icon;

    // Custom tooltip
    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
                    <p className="text-sm font-semibold">{payload[0].payload.fullDate}</p>
                    <p className="text-sm text-muted-foreground">
                        Peso: <span className="font-bold text-foreground">{payload[0].value} kg</span>
                    </p>
                    {goalWeight && (
                        <p className="text-xs text-muted-foreground mt-1">
                            Meta: {goalWeight} kg
                        </p>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div>
                        <CardTitle>Evolução de Peso</CardTitle>
                        <CardDescription>Acompanhamento do peso ao longo do tempo</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <TrendIcon className={`w-5 h-5 ${trend.color}`} />
                        <div className="text-right">
                            <p className="text-sm text-muted-foreground">{trend.label}</p>
                            <p className={`text-lg font-bold ${trend.color}`}>
                                {trend.value} kg
                            </p>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            className="text-muted-foreground"
                        />
                        <YAxis
                            domain={[minWeight - 2, maxWeight + 2]}
                            tick={{ fontSize: 12 }}
                            className="text-muted-foreground"
                            label={{ value: 'Peso (kg)', angle: -90, position: 'insideLeft', fontSize: 12 }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />

                        {/* Linha de meta (se definida) */}
                        {goalWeight && (
                            <ReferenceLine
                                y={goalWeight}
                                stroke="#10b981"
                                strokeDasharray="5 5"
                                label={{
                                    value: `Meta: ${goalWeight} kg`,
                                    position: 'right',
                                    fontSize: 12,
                                    fill: '#10b981'
                                }}
                            />
                        )}

                        {/* Linha principal de peso */}
                        <Line
                            type="monotone"
                            dataKey="weight"
                            name="Peso"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={{ fill: '#3b82f6', r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                    </LineChart>
                </ResponsiveContainer>

                {/* Estatísticas resumidas */}
                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
                    <div className="text-center">
                        <p className="text-xs text-muted-foreground">Primeiro</p>
                        <p className="text-lg font-semibold">{firstWeight} kg</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-muted-foreground">Atual</p>
                        <p className="text-lg font-semibold">{lastWeight} kg</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-muted-foreground">Variação</p>
                        <p className={`text-lg font-semibold ${trend.color}`}>
                            {trend.value} kg
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default WeightChart;
