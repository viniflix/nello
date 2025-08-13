
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Target, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';

const getAdherenceStatus = (percentage) => {
  if (percentage > 110) return { text: 'Acima da meta', color: 'text-destructive', icon: <AlertTriangle className="w-4 h-4 mr-2" /> };
  if (percentage >= 90) return { text: 'Meta atingida', color: 'text-primary', icon: <CheckCircle className="w-4 h-4 mr-2" /> };
  return { text: 'Abaixo da meta', color: 'text-accent', icon: <TrendingUp className="w-4 h-4 mr-2" /> };
};

const DietPlanCard = ({ prescription, foods }) => {
    const [template, setTemplate] = useState(null);

    useEffect(() => {
        const fetchTemplate = async () => {
            if (!prescription || !prescription.template_id) return;
            const { data } = await supabase.from('diet_templates').select('*').eq('id', prescription.template_id).maybeSingle();
            setTemplate(data);
        }
        fetchTemplate();
    }, [prescription]);

    if (!template || !template.meals) return null;

    const getFoodName = (id) => foods.find(f => f.id === id)?.name || 'Alimento não encontrado';

    return (
        <Card className="glass-card">
            <CardHeader>
                <CardTitle>{template.name}</CardTitle>
                <CardDescription>Plano alimentar sugerido para hoje.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {template.meals.map((meal, index) => (
                        <div key={index}>
                            <h4 className="font-semibold text-foreground mb-2">{meal.meal}</h4>
                            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                                {meal.items.map((item, itemIndex) => (
                                    <li key={itemIndex}>{item.quantity}g de {getFoodName(item.foodId)}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}

export default function PatientDashboard() {
  const { user } = useAuth();
  const [prescription, setPrescription] = useState(null);
  const [todayEntries, setTodayEntries] = useState([]);
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const { data: presData } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('patient_id', user.id)
      .lte('start_date', todayStr)
      .gte('end_date', todayStr)
      .maybeSingle();
    setPrescription(presData);

    const { data: entriesData } = await supabase
      .from('food_entries')
      .select('*')
      .eq('patient_id', user.id)
      .eq('entry_date', todayStr);
    setTodayEntries(entriesData || []);

    const { data: foodsData } = await supabase.from('foods').select('*');
    setFoods(foodsData || []);
    
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const todayTotals = useMemo(() => {
    return todayEntries.reduce((acc, entry) => ({
      calories: acc.calories + entry.calories,
      protein: acc.protein + entry.protein,
      fat: acc.fat + entry.fat,
      carbs: acc.carbs + entry.carbs
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
  }, [todayEntries]);

  const pieData = prescription ? [
    { name: 'Proteína', value: todayTotals.protein, color: '#5F6F52', target: prescription.protein },
    { name: 'Gordura', value: todayTotals.fat, color: '#B99470', target: prescription.fat },
    { name: 'Carboidrato', value: todayTotals.carbs, color: '#C4661F', target: prescription.carbs }
  ] : [];

  const COLORS = ['#5F6F52', '#B99470', '#C4661F'];

  const calorieAdherence = prescription ? (todayTotals.calories / prescription.calories) * 100 : 0;
  const calorieStatus = getAdherenceStatus(calorieAdherence);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando...</div>;
  }

  return (
    <div className="pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          {!prescription ? (
            <Card className="glass-card m-4">
              <CardContent className="text-center py-12">
                <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma dieta ativa</h3>
                <p className="text-muted-foreground text-sm">Entre em contato com seu nutricionista.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="glass-card shadow-lg m-4">
                <CardHeader>
                    <CardTitle className="gradient-text">Resumo de Hoje</CardTitle>
                    <div className={`flex items-center text-sm font-medium ${calorieStatus.color}`}>
                        {calorieStatus.icon}
                        <span>{calorieStatus.text}</span>
                    </div>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                    <div className="relative h-48 w-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value, name, props) => [`${Math.round(value)}g de ${Math.round(props.payload.target)}g`, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-bold text-destructive">{Math.round(todayTotals.calories)}</span>
                          <span className="text-sm text-muted-foreground">/{prescription.calories} kcal</span>
                      </div>
                    </div>
                    <div className="w-full grid grid-cols-3 gap-2 text-center">
                        {pieData.map(macro => {
                            const adherence = macro.target > 0 ? (macro.value / macro.target) * 100 : 0;
                            const status = getAdherenceStatus(adherence);
                            return (
                                <div key={macro.name} className="p-2 rounded-lg bg-background/50">
                                    <p className="text-xs text-muted-foreground">{macro.name}</p>
                                    <p className={`font-bold text-sm ${status.color}`}>{Math.round(macro.value)}g</p>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
              </Card>

              <div className="px-4">
                <DietPlanCard prescription={prescription} foods={foods} />
              </div>
            </>
          )}
        </motion.div>
    </div>
  );
}
