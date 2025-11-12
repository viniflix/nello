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
    ReferenceLine,
    Area,
    ComposedChart
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const IMCChart = ({ data = [] }) => {
    if (data.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Evolução de IMC</CardTitle>
                    <CardDescription>Acompanhamento do Índice de Massa Corporal</CardDescription>
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
    const chartData = data
        .filter(record => record.bmi || record.calculatedBmi) // Só registros com IMC
        .map(record => ({
            date: format(new Date(record.record_date), 'dd/MM/yy'),
            fullDate: format(new Date(record.record_date), "dd 'de' MMM", { locale: ptBR }),
            bmi: parseFloat((record.bmi || record.calculatedBmi).toFixed(1)),
            originalDate: record.record_date
        }));

    if (chartData.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Evolução de IMC</CardTitle>
                    <CardDescription>Acompanhamento do Índice de Massa Corporal</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        Sem dados suficientes para calcular IMC
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Calcular estatísticas
    const firstBMI = chartData[0]?.bmi;
    const lastBMI = chartData[chartData.length - 1]?.bmi;
    const bmiChange = lastBMI - firstBMI;

    // Função para obter categoria do IMC
    const getIMCCategory = (bmi) => {
        if (bmi < 18.5) return { label: 'Abaixo do peso', variant: 'secondary', color: '#3b82f6' };
        if (bmi < 25) return { label: 'Peso normal', variant: 'success', color: '#10b981' };
        if (bmi < 30) return { label: 'Sobrepeso', variant: 'warning', color: '#f59e0b' };
        return { label: 'Obesidade', variant: 'destructive', color: '#ef4444' };
    };

    const currentCategory = getIMCCategory(lastBMI);

    // Custom tooltip
    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const bmiValue = payload[0].value;
            const category = getIMCCategory(bmiValue);

            return (
                <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
                    <p className="text-sm font-semibold">{payload[0].payload.fullDate}</p>
                    <p className="text-sm text-muted-foreground">
                        IMC: <span className="font-bold text-foreground">{bmiValue}</span>
                    </p>
                    <Badge variant={category.variant} className="mt-1">
                        {category.label}
                    </Badge>
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
                        <CardTitle>Evolução de IMC</CardTitle>
                        <CardDescription>Índice de Massa Corporal ao longo do tempo</CardDescription>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-muted-foreground">IMC Atual</p>
                        <p className="text-2xl font-bold">{lastBMI}</p>
                        <Badge variant={currentCategory.variant} className="mt-1">
                            {currentCategory.label}
                        </Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            className="text-muted-foreground"
                        />
                        <YAxis
                            domain={[16, 35]}
                            tick={{ fontSize: 12 }}
                            className="text-muted-foreground"
                            label={{ value: 'IMC', angle: -90, position: 'insideLeft', fontSize: 12 }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />

                        {/* Faixas de IMC como referência */}
                        <ReferenceLine
                            y={18.5}
                            stroke="#3b82f6"
                            strokeDasharray="3 3"
                            label={{ value: 'Abaixo', position: 'insideTopLeft', fontSize: 10 }}
                        />
                        <ReferenceLine
                            y={25}
                            stroke="#10b981"
                            strokeDasharray="3 3"
                            label={{ value: 'Normal', position: 'insideTopLeft', fontSize: 10 }}
                        />
                        <ReferenceLine
                            y={30}
                            stroke="#f59e0b"
                            strokeDasharray="3 3"
                            label={{ value: 'Sobrepeso', position: 'insideTopLeft', fontSize: 10 }}
                        />

                        {/* Área colorida baseada no IMC */}
                        <Area
                            type="monotone"
                            dataKey="bmi"
                            fill={currentCategory.color}
                            fillOpacity={0.1}
                            stroke="none"
                        />

                        {/* Linha principal de IMC */}
                        <Line
                            type="monotone"
                            dataKey="bmi"
                            name="IMC"
                            stroke={currentCategory.color}
                            strokeWidth={2}
                            dot={{ fill: currentCategory.color, r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                    </ComposedChart>
                </ResponsiveContainer>

                {/* Estatísticas resumidas */}
                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
                    <div className="text-center">
                        <p className="text-xs text-muted-foreground">Primeiro</p>
                        <p className="text-lg font-semibold">{firstBMI}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-muted-foreground">Atual</p>
                        <p className="text-lg font-semibold">{lastBMI}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-muted-foreground">Variação</p>
                        <p className={`text-lg font-semibold ${bmiChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {bmiChange >= 0 ? '+' : ''}{bmiChange.toFixed(1)}
                        </p>
                    </div>
                </div>

                {/* Legenda de faixas */}
                <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground mb-2 font-semibold">Classificação IMC:</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-blue-500"></div>
                            <span>{'< 18.5'} Abaixo</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-green-500"></div>
                            <span>18.5-25 Normal</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-yellow-500"></div>
                            <span>25-30 Sobrepeso</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-red-500"></div>
                            <span>{'> 30'} Obesidade</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default IMCChart;
