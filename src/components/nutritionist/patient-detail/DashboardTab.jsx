import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Droplets, Wheat, Beef, Utensils } from 'lucide-react';

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

const DashboardTab = ({ meals, prescription, selectedDate, setSelectedDate }) => {
    const dailyTotals = useMemo(() => {
        if (!meals) return { calories: 0, protein: 0, fat: 0, carbs: 0 };
        return meals.reduce((acc, entry) => ({
          calories: acc.calories + entry.total_calories,
          protein: acc.protein + entry.total_protein,
          fat: acc.fat + entry.total_fat,
          carbs: acc.carbs + entry.total_carbs,
        }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
    }, [meals]);

    const calorieAdherence = prescription ? (dailyTotals.calories / prescription.calories) * 100 : 0;
    const calorieAdherenceColor = getAdherenceColor(calorieAdherence).bar;

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-6">
            <Card className="glass-card">
                <CardHeader>
                    <CardTitle>Resumo do Dia</CardTitle>
                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-transparent text-sm text-muted-foreground border-none focus:ring-0 p-0"/>
                </CardHeader>
                <CardContent>
                    {!prescription ? (
                        <p className="text-muted-foreground">Paciente sem dieta prescrita para esta data.</p>
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
            <Card className="glass-card">
                <CardHeader><CardTitle>Registros Alimentares do Dia</CardTitle></CardHeader>
                <CardContent>
                    {meals && meals.length > 0 ? (
                        <div className="space-y-2">
                        {meals.map(entry => (
                            <div key={entry.id} className="p-3 rounded-lg bg-background flex justify-between items-center">
                                <div>
                                    <p className="font-medium">{entry.meal_type}</p>
                                    <p className="text-sm text-muted-foreground">{entry.meal_time}</p>
                                </div>
                                <p className="font-semibold text-destructive">{Math.round(entry.total_calories)} kcal</p>
                            </div>
                        ))}
                        </div>
                    ) : <div className="text-center py-8 text-muted-foreground"><Utensils className="w-12 h-12 mx-auto mb-4" /><p>Nenhum registro encontrado para esta data.</p></div>}
                </CardContent>
            </Card>
        </motion.div>
    );
};

export default DashboardTab;