
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';

const GrowthChart = ({ patientId }) => {
    const [records, setRecords] = useState([]);
    useEffect(() => {
        const fetchRecords = async () => {
            const { data } = await supabase.from('growth_records').select('*').eq('patient_id', patientId).order('record_date');
            setRecords(data.map(r => ({...r, record_date: new Date(r.record_date).toLocaleDateString('pt-BR')})));
        };
        fetchRecords();
    }, [patientId]);

    return (
        <Card>
            <CardHeader><CardTitle>Curva de Crescimento</CardTitle></CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={records}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="record_date" />
                        <YAxis yAxisId="left" label={{ value: 'Peso (kg)', angle: -90, position: 'insideLeft' }} />
                        <YAxis yAxisId="right" orientation="right" label={{ value: 'Altura (cm)', angle: -90, position: 'insideRight' }} />
                        <Tooltip />
                        <Legend />
                        <Line yAxisId="left" type="monotone" dataKey="weight" name="Peso" stroke="hsl(var(--primary))" />
                        <Line yAxisId="right" type="monotone" dataKey="height" name="Altura" stroke="hsl(var(--accent))" />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}

export default GrowthChart;
