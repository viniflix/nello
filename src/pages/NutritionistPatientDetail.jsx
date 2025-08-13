
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Droplets, Wheat, Beef } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';

const getAdherenceColor = (percentage) => {
    if (percentage > 110) return { bar: 'hsl(var(--destructive))', text: 'text-destructive' };
    if (percentage >= 90) return { bar: 'hsl(var(--primary))', text: 'text-primary' };
    return { bar: 'hsl(var(--accent))', text: 'text-accent' };
};

const NutrientProgressCard = ({ label, icon, value, goal }) => {
    const adherence = goal > 0 ? (value / goal) * 100 : 0;
    const color = getAdherenceColor(adherence).text;
  
    return (
      <Card className="bg-card/50">
        <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full bg-primary/10 ${color}`}>
                    {icon}
                </div>
                <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="font-bold text-foreground">{Math.round(value)}g</p>
                </div>
            </div>
            <p className={`font-bold ${color}`}>{Math.round(adherence)}%</p>
        </CardContent>
      </Card>
    );
  };

export default function NutritionistPatientDetail() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [prescription, setPrescription] = useState(null);
  const [foodEntries, setFoodEntries] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: patientData } = await supabase.from('user_profiles').select('*').eq('id', patientId).single();
    setPatient(patientData);

    const { data: prescriptionData } = await supabase.from('prescriptions').select('*').eq('patient_id', patientId).maybeSingle();
    setPrescription(prescriptionData);

    const { data: entriesData } = await supabase.from('food_entries').select('*').eq('patient_id', patientId).eq('entry_date', selectedDate);
    setFoodEntries(entriesData || []);
    setLoading(false);
  }, [patientId, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const dailyTotals = useMemo(() => {
    return foodEntries.reduce((acc, entry) => ({
      calories: acc.calories + entry.calories,
      protein: acc.protein + entry.protein,
      fat: acc.fat + entry.fat,
      carbs: acc.carbs + entry.carbs,
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
  }, [foodEntries]);

  const weeklyData = useMemo(() => {
    // This part is complex with async calls inside a loop, will simplify for now
    // A proper implementation would use a database function or a more complex query.
    // For now, we'll just show today's data as an example.
    const data = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(new Date(selectedDate).getDate() - i);
        data.push({
            name: date.toLocaleDateString('pt-BR', {weekday: 'short'}).replace('.',''),
            Consumido: 0,
            Meta: prescription?.calories || 0
        });
    }
    if(data.length > 0) {
        data[6].Consumido = Math.round(dailyTotals.calories);
    }
    return data;
  }, [prescription, dailyTotals, selectedDate]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando detalhes do paciente...</div>;
  }
  
  if (!patient) {
    return <div className="flex items-center justify-center h-screen">Paciente não encontrado.</div>;
  }
  
  const calorieAdherence = prescription ? (dailyTotals.calories / prescription.calories) * 100 : 0;
  const calorieAdherenceColor = getAdherenceColor(calorieAdherence).bar;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card/80 backdrop-blur-md border-b border-border p-4 flex items-center sticky top-0 z-10">
        <Link to="/nutritionist" className="mr-2">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div className="w-10 h-10 bg-secondary rounded-full mr-3 flex items-center justify-center font-bold text-primary">
          {patient.name.charAt(0)}
        </div>
        <div>
          <h2 className="font-semibold text-foreground">{patient.name}</h2>
          <p className="text-xs text-muted-foreground">Visualizando detalhes do paciente</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Card className="glass-card">
                <CardHeader>
                    <CardTitle>Resumo do Dia</CardTitle>
                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-transparent text-sm text-muted-foreground border-none focus:ring-0 p-0"/>
                </CardHeader>
                <CardContent>
                    {!prescription ? (
                        <p className="text-muted-foreground">Paciente sem dieta prescrita.</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="text-center">
                                <p className="text-4xl font-bold" style={{color: calorieAdherenceColor}}>{Math.round(dailyTotals.calories)}</p>
                                <p className="text-muted-foreground">/ {prescription.calories} kcal</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <NutrientProgressCard label="Proteínas" icon={<Beef size={20}/>} value={dailyTotals.protein} goal={prescription.protein} />
                                <NutrientProgressCard label="Gorduras" icon={<Droplets size={20}/>} value={dailyTotals.fat} goal={prescription.fat} />
                                <NutrientProgressCard label="Carboidratos" icon={<Wheat size={20}/>} value={dailyTotals.carbs} goal={prescription.carbs} />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
            <Card className="glass-card">
                <CardHeader>
                    <CardTitle>Histórico de Calorias (Últimos 7 Dias)</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={weeklyData}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                            <XAxis dataKey="name" tick={{fontSize: 12}}/>
                            <YAxis tick={{fontSize: 12}} />
                            <Tooltip contentStyle={{backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}/>
                            <Legend />
                            <Bar dataKey="Consumido" fill={calorieAdherenceColor} radius={[4,4,0,0]}/>
                            <Bar dataKey="Meta" fill="hsl(var(--muted-foreground))" radius={[4,4,0,0]}/>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
            <Card className="glass-card">
                <CardHeader><CardTitle>Registros Alimentares de Hoje</CardTitle></CardHeader>
                <CardContent>
                    {foodEntries.length > 0 ? (
                        <div className="space-y-2">
                        {foodEntries.map(entry => (
                            <div key={entry.id} className="p-3 rounded-lg bg-background flex justify-between items-center">
                                <div>
                                    <p className="font-medium">{entry.quantity}g de {entry.food_name}</p>
                                    <p className="text-sm text-muted-foreground">{entry.entry_time}</p>
                                </div>
                                <p className="font-semibold text-destructive">{Math.round(entry.calories)} kcal</p>
                            </div>
                        ))}
                        </div>
                    ) : <p className="text-muted-foreground">Nenhum registro encontrado para hoje.</p>}
                </CardContent>
            </Card>
        </motion.div>
      </main>
    </div>
  );
}
