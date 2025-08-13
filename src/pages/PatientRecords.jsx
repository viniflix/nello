import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const PatientRecords = () => {
    const { user } = useAuth();
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadChartData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('food_entries')
            .select('entry_date, protein, fat, carbs')
            .eq('patient_id', user.id)
            .order('entry_date', { ascending: false })
            .limit(30); // Fetch last 30 days of entries

        if (error) {
            console.error("Error fetching records", error);
            setLoading(false);
            return;
        }

        const dataMap = new Map();
        data.forEach(entry => {
            const date = entry.entry_date;
            if (!dataMap.has(date)) {
                dataMap.set(date, { protein: 0, fat: 0, carbs: 0 });
            }
            const dayData = dataMap.get(date);
            dayData.protein += entry.protein;
            dayData.fat += entry.fat;
            dayData.carbs += entry.carbs;
        });

        const sortedEntries = Array.from(dataMap.entries()).sort((a,b) => new Date(a[0]) - new Date(b[0]));
        
        const last7Days = sortedEntries.slice(-7);

        setChartData(last7Days.map(([date, macros]) => ({
            name: new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
            Proteína: Math.round(macros.protein),
            Gordura: Math.round(macros.fat),
            Carboidrato: Math.round(macros.carbs)
        })));
        setLoading(false);
    }, [user]);

    useEffect(() => {
        loadChartData();
    }, [loadChartData]);

    if (loading) {
        return <div className="flex items-center justify-center h-screen">Carregando histórico...</div>;
    }

  return (
    <div className="pb-24 p-4">
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
        >
            <Card className="glass-card">
                <CardHeader>
                    <CardTitle>Histórico de Macros (Últimos 7 dias)</CardTitle>
                </CardHeader>
                <CardContent>
                    {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2}/>
                                <XAxis dataKey="name" tick={{fontSize: 12}} />
                                <YAxis tick={{fontSize: 12}}/>
                                <Tooltip contentStyle={{backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}/>
                                <Legend wrapperStyle={{fontSize: '12px'}}/>
                                <Bar dataKey="Proteína" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                                <Bar dataKey="Gordura" fill="hsl(var(--accent))" radius={[4,4,0,0]} />
                                <Bar dataKey="Carboidrato" fill="hsl(var(--destructive))" radius={[4,4,0,0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">Nenhum registro encontrado.</p>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    </div>
  )
}

export default PatientRecords;
