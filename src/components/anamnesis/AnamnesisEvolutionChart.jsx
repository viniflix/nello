import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';
import { TrendingUp, Loader2, Info } from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Sprint H: Timeline de Evolução de Anamnese.
 *
 * Compara respostas do tipo scale_1_10 ao longo do tempo,
 * mostrando a evolução do paciente em indicadores subjetivos
 * (qualidade do sono, dor, energia, etc.)
 */
export function AnamnesisEvolutionChart({ patientId }) {
    const { data: records = [], isLoading } = useQuery({
        queryKey: ['anamnesis_evolution', patientId],
        queryFn: async () => {
            if (!patientId) return [];
            const { data, error } = await supabase
                .from('anamnesis_records')
                .select('id, date, content, template_snapshot, template:template_id(sections)')
                .eq('patient_id', patientId)
                .in('status', ['completed', 'validated'])
                .order('date', { ascending: true });
            if (error) throw error;
            return data || [];
        },
        enabled: !!patientId,
    });

    // Extrair todos os campos scale_1_10 presentes nos registros
    const { chartData, scaleFields } = useMemo(() => {
        const fieldMap = {}; // { fieldId: fieldLabel }

        // 1. Mapear todos os campos scale_1_10 encontrados em qualquer anamnese
        records.forEach(record => {
            const sections = record.template_snapshot?.sections || record.template?.sections || [];
            sections.forEach(section => {
                section.fields?.forEach(field => {
                    if (field.type === 'scale_1_10' && field.id && field.label) {
                        fieldMap[field.id] = field.label;
                    }
                });
            });
        });

        // 2. Montar série temporal
        const data = records.map(record => {
            const point = {
                date: record.date
                    ? format(new Date(record.date), 'dd/MM', { locale: ptBR })
                    : '—',
                fullDate: record.date,
            };
            Object.keys(fieldMap).forEach(fieldId => {
                const val = record.content?.[fieldId];
                if (val !== undefined && val !== null && val !== '') {
                    point[fieldId] = Number(val);
                }
            });
            return point;
        });

        return { chartData: data, scaleFields: fieldMap };
    }, [records]);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16'];
    const fieldIds = Object.keys(scaleFields);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
        );
    }

    if (records.length < 2) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                <TrendingUp className="w-10 h-10 opacity-30" />
                <p className="text-sm font-medium text-center">
                    São necessárias pelo menos 2 anamneses concluídas para exibir a evolução.
                </p>
            </div>
        );
    }

    if (fieldIds.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                <Info className="w-8 h-8 opacity-30" />
                <p className="text-sm font-medium text-center">
                    Nenhum campo de escala (1-10) encontrado nas anamneses.
                </p>
                <p className="text-xs text-center max-w-xs">
                    Adicione campos do tipo "Escala (1 a 10)" nos templates para monitorar a evolução.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Campos de escala 1-10 comparados entre anamneses concluídas, em ordem cronológica.</span>
            </div>

            <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        domain={[0, 10]}
                        ticks={[0, 2, 4, 6, 8, 10]}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #e2e8f0',
                            borderRadius: '12px',
                            fontSize: 12,
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                        formatter={(value, name) => [value, scaleFields[name] || name]}
                    />
                    <Legend
                        formatter={(value) => scaleFields[value] || value}
                        wrapperStyle={{ fontSize: 11, color: '#64748b' }}
                    />
                    {fieldIds.map((fieldId, idx) => (
                        <Line
                            key={fieldId}
                            type="monotone"
                            dataKey={fieldId}
                            stroke={COLORS[idx % COLORS.length]}
                            strokeWidth={2.5}
                            dot={{ r: 5, strokeWidth: 2, fill: 'white' }}
                            activeDot={{ r: 7 }}
                            connectNulls
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
