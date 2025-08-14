
import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { subDays, format, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PatientAdherenceChart = () => {
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            setLoading(true);

            const today = startOfDay(new Date());
            const sevenDaysAgo = format(subDays(today, 6), 'yyyy-MM-dd');
            
            const { data: patients, error: patientsError } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('nutritionist_id', user.id);

            if (patientsError || !patients || patients.length === 0) {
                setLoading(false);
                return;
            }

            const patientIds = patients.map(p => p.id);
            
            const { data: meals, error: mealsError } = await supabase
                .from('meals')
                .select('patient_id, meal_date, total_calories')
                .in('patient_id', patientIds)
                .gte('meal_date', sevenDaysAgo);

            const { data: prescriptions, error: prescriptionsError } = await supabase
                .from('prescriptions')
                .select('patient_id, calories, start_date, end_date')
                .in('patient_id', patientIds)
                .lte('start_date', format(today, 'yyyy-MM-dd'))
                .gte('end_date', sevenDaysAgo);

            if (mealsError || prescriptionsError) {
                console.error("Error fetching data:", mealsError || prescriptionsError);
                setLoading(false);
                return;
            }
            
            const dailyData = Array.from({ length: 7 }).map((_, i) => {
                const date = subDays(today, 6 - i);
                const dateString = format(date, 'yyyy-MM-dd');
                
                const mealsOnDay = meals.filter(m => m.meal_date === dateString);
                
                let totalConsumed = 0;
                let totalPrescribed = 0;

                const patientsWithMealsOnDay = [...new Set(mealsOnDay.map(m => m.patient_id))];

                patientsWithMealsOnDay.forEach(patientId => {
                    const patientMeals = mealsOnDay.filter(m => m.patient_id === patientId);
                    totalConsumed += patientMeals.reduce((sum, meal) => sum + meal.total_calories, 0);

                    const activePrescription = prescriptions.find(p => 
                        p.patient_id === patientId &&
                        new Date(p.start_date) <= date &&
                        new Date(p.end_date) >= date
                    );

                    if (activePrescription) {
                        totalPrescribed += activePrescription.calories;
                    }
                });

                const adherence = totalPrescribed > 0 ? (totalConsumed / totalPrescribed) * 100 : 0;
                
                return {
                    name: format(date, 'eee', { locale: ptBR }),
                    Adesão: Math.min(Math.round(adherence), 150), // Cap at 150 for better visualization
                };
            });

            setChartData(dailyData);
            setLoading(false);
        };

        fetchData();
    }, [user]);

    if (loading) {
        return <Card className="glass-card mb-8"><CardHeader><CardTitle>Adesão Média dos Pacientes</CardTitle></CardHeader><CardContent><div className="h-64 flex items-center justify-center">Carregando dados...</div></CardContent></Card>;
    }
    
    return (
        <Card className="glass-card mb-8">
            <CardHeader>
                <CardTitle>Adesão Média dos Pacientes (Últimos 7 Dias)</CardTitle>
                <CardDescription>Média da adesão calórica de todos os pacientes ativos.</CardDescription>
            </CardHeader>
            <CardContent>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                            <YAxis unit="%" stroke="hsl(var(--muted-foreground))" />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--background))',
                                    borderColor: 'hsl(var(--border))'
                                }}
                            />
                            <Legend />
                            <Bar dataKey="Adesão" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
};

export default PatientAdherenceChart;
