import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText, MessageSquare, Baby, BarChart, Utensils, History } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

import AnamneseView from '@/components/nutritionist/patient-detail/AnamneseView';
import WeeklySummary from '@/components/nutritionist/patient-detail/WeeklySummary';
import GrowthChart from '@/components/nutritionist/patient-detail/GrowthChart';
import DashboardTab from '@/components/nutritionist/patient-detail/DashboardTab';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const MealRecordCard = ({ meal }) => (
    <Card>
        <CardHeader>
            <div className='flex justify-between items-start'>
                <div>
                    <CardTitle>{meal.meal_type}</CardTitle>
                    <CardDescription>{meal.meal_time}</CardDescription>
                </div>
                 <div className='text-right'>
                    <p className='font-bold text-destructive'>{Math.round(meal.total_calories)} kcal</p>
                    <p className='text-xs text-muted-foreground'>
                        P:{Math.round(meal.total_protein)}g, G:{Math.round(meal.total_fat)}g, C:{Math.round(meal.total_carbs)}g
                    </p>
                    {meal.is_edited && (
                         <p className='text-xs text-accent mt-1 flex items-center justify-end'><History className="w-3 h-3 mr-1"/> Editado</p>
                    )}
                </div>
            </div>
        </CardHeader>
        <CardContent>
            <div className='space-y-2'>
                {meal.meal_items.map(item => (
                    <div key={item.id} className='text-sm flex justify-between p-2 bg-muted/50 rounded-md'>
                        <span>{item.quantity}g de {item.name}</span>
                        <span className='text-muted-foreground'>{Math.round(item.calories)} kcal</span>
                    </div>
                ))}
            </div>
            {meal.notes && (
                <div className='mt-4'>
                    <h4 className='font-semibold text-sm'>Observações</h4>
                    <p className='text-sm text-muted-foreground p-2 bg-muted/50 rounded-md'>{meal.notes}</p>
                </div>
            )}
        </CardContent>
    </Card>
);

const FoodRecordsTab = ({ patientId }) => {
    const [meals, setMeals] = useState([]);
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMeals = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('meals')
                .select('*, meal_items(*)')
                .eq('patient_id', patientId)
                .eq('meal_date', date)
                .order('meal_time', { ascending: true });
            
            if (error) {
                console.error("Error fetching meals:", error);
                setMeals([]);
            } else {
                setMeals(data);
            }
            setLoading(false);
        };
        fetchMeals();
    }, [patientId, date]);

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">Registros de {format(new Date(date.replace(/-/g, '/')), 'dd/MM/yyyy')}</h3>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-card text-sm text-muted-foreground border-border rounded-md p-1 focus:ring-primary"/>
            </div>
            {loading ? <p>Carregando...</p> : (
                meals.length > 0 ? (
                    <div className="space-y-4">
                        {meals.map(meal => <MealRecordCard key={meal.id} meal={meal} />)}
                    </div>
                ) : (
                    <p className="text-muted-foreground text-center py-8">Nenhum registro encontrado para esta data.</p>
                )
            )}
        </motion.div>
    );
};

const EditHistoryTab = ({ patientId }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('meal_edit_history')
                .select('*')
                .eq('patient_id', patientId)
                .order('edited_at', { ascending: false });
            
            if (error) {
                console.error("Error fetching history:", error);
                setHistory([]);
            } else {
                setHistory(data);
            }
            setLoading(false);
        };
        fetchHistory();
    }, [patientId]);
    
    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
            {loading ? <p>Carregando histórico de edições...</p> : (
                history.length > 0 ? history.map(item => (
                    <Card key={item.id}>
                        <CardHeader>
                            <CardTitle>Edição de Refeição</CardTitle>
                            <CardDescription>
                                Editado {formatDistanceToNow(new Date(item.edited_at), { addSuffix: true, locale: ptBR })}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <h4 className="font-semibold mb-2">Antes</h4>
                                <div className="text-xs p-2 bg-muted/50 rounded-md">
                                    <p>Tipo: {item.original_data.meal_type} às {item.original_data.meal_time}</p>
                                    <p>Calorias: {Math.round(item.original_data.total_calories)} kcal</p>
                                </div>
                            </div>
                             <div>
                                <h4 className="font-semibold mb-2">Depois</h4>
                                <div className="text-xs p-2 bg-primary/10 rounded-md">
                                    <p>Tipo: {item.new_data.meal_type} às {item.new_data.meal_time}</p>
                                    <p>Calorias: {Math.round(item.new_data.total_calories)} kcal</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )) : <p className="text-center py-8 text-muted-foreground">Nenhuma edição encontrada.</p>
            )}
        </motion.div>
    )
}

export default function NutritionistPatientDetail() {
  const { patientId } = useParams();
  const { user } = useAuth();
  const [patient, setPatient] = useState(null);
  const [prescription, setPrescription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [meals, setMeals] = useState([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const loadPatientData = useCallback(async () => {
    setLoading(true);
    const { data: patientData } = await supabase.from('user_profiles').select('*').eq('id', patientId).single();
    setPatient(patientData);

    const { data: prescriptionData } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('patient_id', patientId)
      .lte('start_date', selectedDate)
      .gte('end_date', selectedDate)
      .maybeSingle();
    setPrescription(prescriptionData);
    
    setLoading(false);
  }, [patientId, selectedDate]);

  useEffect(() => {
    loadPatientData();
  }, [loadPatientData]);

  useEffect(() => {
    const fetchMeals = async () => {
        const { data, error } = await supabase
            .from('meals')
            .select('*, meal_items(*)')
            .eq('patient_id', patientId)
            .eq('meal_date', selectedDate);
        if (error) {
            console.error(error);
            setMeals([]);
        } else {
            setMeals(data);
        }
    };
    if (patientId) {
        fetchMeals();
    }
  }, [patientId, selectedDate]);


  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando detalhes do paciente...</div>;
  }
  
  if (!patient) {
    return <div className="flex items-center justify-center h-screen">Paciente não encontrado.</div>;
  }

  const tabs = [
    { value: "dashboard", label: "Dashboard", icon: <BarChart className="w-4 h-4 mr-2"/> },
    { value: "records", label: "Registros", icon: <Utensils className="w-4 h-4 mr-2"/> },
    { value: "history", label: "Hist. Edições", icon: <History className="w-4 h-4 mr-2"/> },
    { value: "summary", label: "Resumo Semanal", icon: <FileText className="w-4 h-4 mr-2"/> },
    { value: "anamnese", label: "Anamnese", icon: <MessageSquare className="w-4 h-4 mr-2"/> },
  ];

  if (patient.patient_category === 'pregnant' || patient.patient_category === 'child') {
    tabs.push({ value: "growth", label: "Crescimento", icon: <Baby className="w-4 h-4 mr-2"/> });
  }

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
        <Tabs defaultValue="dashboard">
            <TabsList className="grid w-full" style={{gridTemplateColumns: `repeat(${tabs.length}, 1fr)`}}>
                {tabs.map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value}>{tab.icon}{tab.label}</TabsTrigger>
                ))}
            </TabsList>
            <TabsContent value="dashboard" className="mt-6">
                <DashboardTab 
                    meals={meals} 
                    prescription={prescription} 
                    selectedDate={selectedDate}
                    setSelectedDate={setSelectedDate}
                />
            </TabsContent>
            <TabsContent value="records" className="mt-6">
                <FoodRecordsTab patientId={patientId} />
            </TabsContent>
             <TabsContent value="history" className="mt-6">
                <EditHistoryTab patientId={patientId} />
            </TabsContent>
            <TabsContent value="summary" className="mt-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <WeeklySummary patientId={patientId} nutritionistId={user.id} prescription={prescription} />
                </motion.div>
            </TabsContent>
            <TabsContent value="anamnese" className="mt-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <AnamneseView patientId={patientId} nutritionistId={user.id} />
                </motion.div>
            </TabsContent>
            {(patient.patient_category === 'pregnant' || patient.patient_category === 'child') && (
                <TabsContent value="growth" className="mt-6">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                        <GrowthChart patientId={patientId} />
                    </motion.div>
                </TabsContent>
            )}
        </Tabs>
      </main>
    </div>
  );
}