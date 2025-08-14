
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { Utensils, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';

const MealCard = ({ meal, onDelete }) => {
    const navigate = useNavigate();

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>{meal.meal_type}</CardTitle>
                        <CardDescription>{meal.meal_time}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                         <Button variant="ghost" size="icon" onClick={() => navigate(`/patient/add-food/${meal.id}`)}>
                            <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(meal.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {meal.meal_items.map(item => (
                        <div key={item.id} className="text-sm flex justify-between p-2 bg-muted/50 rounded-md">
                            <span>{item.quantity}g de {item.name}</span>
                            <span className="text-muted-foreground">{Math.round(item.calories)} kcal</span>
                        </div>
                    ))}
                </div>
                {meal.notes && (
                    <div className="mt-4">
                        <h4 className="font-semibold text-sm">Observações</h4>
                        <p className="text-sm text-muted-foreground p-2 bg-muted/50 rounded-md">{meal.notes}</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

const PatientRecords = () => {
    const { user } = useAuth();
    const { toast } = useToast();
    const [meals, setMeals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('day');
    const [currentDate, setCurrentDate] = useState(new Date());

    const dateRange = useCallback(() => {
        switch (view) {
            case 'week':
                return { start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) };
            case 'month':
                return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
            default: // day
                return { start: currentDate, end: currentDate };
        }
    }, [view, currentDate]);

    const loadData = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        const { start, end } = dateRange();
        
        const { data, error } = await supabase
            .from('meals')
            .select('*, meal_items(*)')
            .eq('patient_id', user.id)
            .gte('meal_date', format(start, 'yyyy-MM-dd'))
            .lte('meal_date', format(end, 'yyyy-MM-dd'))
            .order('meal_date', { ascending: false })
            .order('meal_time', { ascending: false });

        if (error) {
            console.error("Error fetching records", error);
            toast({ title: "Erro", description: "Não foi possível carregar os registros.", variant: "destructive" });
        } else {
            setMeals(data);
        }
        setLoading(false);
    }, [user, dateRange, toast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleDeleteMeal = async (mealId) => {
        await supabase.from('meal_items').delete().eq('meal_id', mealId);
        const { error } = await supabase.from('meals').delete().eq('id', mealId);

        if (error) {
            toast({ title: "Erro", description: "Não foi possível excluir a refeição.", variant: "destructive" });
        } else {
            toast({ title: "Sucesso!", description: "Refeição excluída." });
            loadData();
        }
    };
    
    const chartData = useMemo(() => {
        const { start, end } = dateRange();
        const allDays = eachDayOfInterval({ start, end });
        const dataMap = new Map(allDays.map(day => [format(day, 'yyyy-MM-dd'), { calories: 0, protein: 0, fat: 0, carbs: 0 }]));

        meals.forEach(meal => {
            const dayData = dataMap.get(meal.meal_date);
            if(dayData) {
                dayData.calories += meal.total_calories;
                dayData.protein += meal.total_protein;
                dayData.fat += meal.total_fat;
                dayData.carbs += meal.total_carbs;
            }
        });
        
        return Array.from(dataMap.entries()).map(([date, macros]) => ({
            name: format(new Date(date), 'dd/MM'),
            Calorias: Math.round(macros.calories),
            Proteína: Math.round(macros.protein),
            Gordura: Math.round(macros.fat),
            Carboidrato: Math.round(macros.carbs)
        }));
    }, [meals, dateRange]);


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
                        <CardTitle>Histórico de Consumo</CardTitle>
                        <Tabs value={view} onValueChange={setView} className="w-full pt-2">
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="day">Dia</TabsTrigger>
                                <TabsTrigger value="week">Semana</TabsTrigger>
                                <TabsTrigger value="month">Mês</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </CardHeader>
                    <CardContent>
                        {view !== 'day' && chartData.length > 0 && (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    <Bar dataKey="Calorias" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                        {view === 'day' && (
                           <input 
                             type="date" 
                             value={format(currentDate, 'yyyy-MM-dd')} 
                             onChange={(e) => setCurrentDate(new Date(e.target.value))} 
                             className="w-full p-2 bg-muted rounded-md"
                           />
                        )}
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    <h3 className="text-xl font-bold text-foreground">Refeições Registradas</h3>
                    {meals.length > 0 ? (
                        meals.map(meal => <MealCard key={meal.id} meal={meal} onDelete={handleDeleteMeal} />)
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            <Utensils className="w-12 h-12 mx-auto mb-4" />
                            <p>Nenhuma refeição registrada para o período.</p>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    )
}

export default PatientRecords;
