
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bar, BarChart as RechartsBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { useToast } from '@/components/ui/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Check, X } from 'lucide-react';

const WeeklySummary = ({ patientId, nutritionistId, prescription }) => {
    const { toast } = useToast();
    const [weeklyMeals, setWeeklyMeals] = useState([]);
    const [summary, setSummary] = useState(null);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);

    const goalLabels = {
        calories: 'Calorias',
        protein: 'Proteína',
        fat: 'Gordura',
        carbs: 'Carboidratos'
    };

    const weekStartDate = useMemo(() => {
        const date = new Date();
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff)).toISOString().split('T')[0];
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data: mealsData } = await supabase
            .from('meals')
            .select('*')
            .eq('patient_id', patientId)
            .gte('meal_date', weekStartDate);
        setWeeklyMeals(mealsData || []);

        const { data: summaryData } = await supabase
            .from('weekly_summaries')
            .select('*')
            .eq('patient_id', patientId)
            .eq('week_start_date', weekStartDate)
            .maybeSingle();
        setSummary(summaryData);
        setNotes(summaryData?.notes || '');
        setLoading(false);
    }, [patientId, weekStartDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const weeklyData = useMemo(() => {
        const dataByDay = {};
        for (let i = 0; i < 7; i++) {
            const date = new Date(weekStartDate);
            date.setDate(date.getDate() + i);
            const dateString = date.toISOString().split('T')[0];
            dataByDay[dateString] = {
                name: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
                Proteína: 0, Gordura: 0, Carboidrato: 0,
            };
        }
        weeklyMeals.forEach(meal => {
            if (dataByDay[meal.meal_date]) {
                dataByDay[meal.meal_date].Proteína += meal.total_protein;
                dataByDay[meal.meal_date].Gordura += meal.total_fat;
                dataByDay[meal.meal_date].Carboidrato += meal.total_carbs;
            }
        });
        return Object.values(dataByDay).map(d => ({...d, Proteína: Math.round(d.Proteína), Gordura: Math.round(d.Gordura), Carboidrato: Math.round(d.Carboidrato)}));
    }, [weeklyMeals, weekStartDate]);

    const goalsMet = useMemo(() => {
        if (!prescription) return null;
        const totals = weeklyMeals.reduce((acc, meal) => {
            const day = meal.meal_date;
            if (!acc[day]) acc[day] = { calories: 0, protein: 0, fat: 0, carbs: 0 };
            acc[day].calories += meal.total_calories;
            acc[day].protein += meal.total_protein;
            acc[day].fat += meal.total_fat;
            acc[day].carbs += meal.total_carbs;
            return acc;
        }, {});

        const daysWithEntries = Object.keys(totals).length;
        if (daysWithEntries === 0) return { calories: false, protein: false, fat: false, carbs: false };

        const avgTotals = Object.values(totals).reduce((acc, day) => ({
            calories: acc.calories + day.calories,
            protein: acc.protein + day.protein,
            fat: acc.fat + day.fat,
            carbs: acc.carbs + day.carbs,
        }), { calories: 0, protein: 0, fat: 0, carbs: 0 });

        Object.keys(avgTotals).forEach(key => avgTotals[key] /= daysWithEntries);

        return {
            calories: avgTotals.calories >= prescription.calories * 0.9 && avgTotals.calories <= prescription.calories * 1.1,
            protein: avgTotals.protein >= prescription.protein * 0.9 && avgTotals.protein <= prescription.protein * 1.1,
            fat: avgTotals.fat >= prescription.fat * 0.9 && avgTotals.fat <= prescription.fat * 1.1,
            carbs: avgTotals.carbs >= prescription.carbs * 0.9 && avgTotals.carbs <= prescription.carbs * 1.1,
        };
    }, [weeklyMeals, prescription]);

    const handleSaveSummary = async () => {
        setLoading(true);
        const payload = {
            patient_id: patientId,
            nutritionist_id: nutritionistId,
            week_start_date: weekStartDate,
            notes: notes,
            goals_met: goalsMet
        };
        const { error } = await supabase
            .from('weekly_summaries')
            .upsert(payload, { onConflict: 'patient_id, week_start_date' });

        if (error) {
            toast({ title: "Erro", description: `Não foi possível salvar o resumo. ${error.message}`, variant: "destructive" });
        } else {
            toast({ title: "Sucesso!", description: "Resumo semanal salvo." });
            fetchData();
        }
        setLoading(false);
    };

    if (loading) return <p>Carregando resumo...</p>;

    return (
        <Card className="glass-card">
            <CardHeader>
                <CardTitle>Resumo Semanal Automático</CardTitle>
                <CardDescription>Evolução e observações da semana.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <ResponsiveContainer width="100%" height={300}>
                    <RechartsBarChart data={weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                        <Legend />
                        <Bar dataKey="Proteína" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Gordura" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Carboidrato" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    </RechartsBarChart>
                </ResponsiveContainer>
                {goalsMet && (
                    <div>
                        <h4 className="font-semibold mb-2">Metas da Semana</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                            {Object.entries(goalsMet).map(([key, value]) => (
                                <div key={key} className={`flex items-center gap-2 p-2 rounded-md ${value ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                                    {value ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                    <span className="capitalize">{goalLabels[key]}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div>
                    <h4 className="font-semibold mb-2">Observações da Semana</h4>
                    <Textarea
                        placeholder="Adicione suas observações sobre o progresso do paciente..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                    <Button onClick={handleSaveSummary} disabled={loading} className="mt-2">
                        {loading ? 'Salvando...' : 'Salvar Observações'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default WeeklySummary;
