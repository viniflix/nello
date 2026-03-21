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
import { classifyBMI, getBMICuts } from '@/lib/utils/bmi-classification';

const IMCChart = ({ data = [], patientAge = null, patientSex = null, patientEthnicity = null }) => {
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

    // Cortes dinâmicos baseados no perfil do paciente
    const cuts = getBMICuts({ age: patientAge, ethnicity: patientEthnicity });

    // Função para obter categoria do IMC usando motor OMS completo
    const getIMCCategory = (bmi) =>
        classifyBMI({ bmi, age: patientAge, sex: patientSex, ethnicity: patientEthnicity });

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

                        {/* Faixas de IMC como referência — dinâmicas por perfil */}
                        <ReferenceLine
                            y={cuts.underweight}
                            stroke="#3b82f6"
                            strokeDasharray="3 3"
                            label={{ value: `Abaixo (${cuts.underweight})`, position: 'insideTopLeft', fontSize: 10 }}
                        />
                        <ReferenceLine
                            y={cuts.normal_high}
                            stroke="#10b981"
                            strokeDasharray="3 3"
                            label={{ value: `Normal (${cuts.normal_high})`, position: 'insideTopLeft', fontSize: 10 }}
                        />
                        <ReferenceLine
                            y={cuts.overweight_high}
                            stroke="#f59e0b"
                            strokeDasharray="3 3"
                            label={{ value: `Sobrepeso (${cuts.overweight_high})`, position: 'insideTopLeft', fontSize: 10 }}
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

                {/* Legenda de faixas — dinâmica */}
                <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground mb-2 font-semibold">Classificação IMC:</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-blue-500"></div>
                            <span>{'< '}{cuts.underweight} Abaixo</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-green-500"></div>
                            <span>{cuts.underweight}–{cuts.normal_high} Normal</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-yellow-500"></div>
                            <span>{cuts.normal_high}–{cuts.overweight_high} Sobrepeso</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-red-500"></div>
                            <span>{'> '}{cuts.overweight_high} Obesidade</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default IMCChart;
