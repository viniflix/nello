import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Target, AlertTriangle, CheckCircle, TrendingUp, FileText, CalendarDays, BarChart, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import AnamneseForm from '@/components/AnamneseForm';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const getAdherenceStatus = (percentage) => {
    if (percentage > 110) return { text: 'Acima da meta', color: 'text-destructive', icon: <AlertTriangle className="w-4 h-4 mr-1" /> };
    if (percentage >= 90) return { text: 'Meta atingida', color: 'text-primary', icon: <CheckCircle className="w-4 h-4 mr-1" /> };
    return { text: 'Abaixo da meta', color: 'text-accent', icon: <TrendingUp className="w-4 h-4 mr-1" /> };
};

const AnamneseNotificationCard = ({ onOpenModal }) => (
    <Card className="glass-card m-4 bg-primary/10 border-primary/20">
        <CardHeader><div className="flex items-center gap-3"><FileText className="w-6 h-6 text-primary" /><CardTitle className="text-primary">Anamnese Pendente</CardTitle></div></CardHeader>
        <CardContent><p className="text-muted-foreground mb-4">Seu nutricionista precisa de mais algumas informações. Por favor, preencha sua anamnese.</p><Button onClick={onOpenModal} className="w-full">Preencher Anamnese</Button></CardContent>
    </Card>
);

const AppointmentReminderCard = ({ appointment }) => {
    if (!appointment || isAfter(new Date(), new Date(appointment.appointment_time))) {
        return null;
    }
    return (
        <Card className="glass-card m-4 bg-accent/10 border-accent/20">
            <CardHeader><div className="flex items-center gap-3"><CalendarClock className="w-6 h-6 text-accent" /><CardTitle className="text-accent">Lembrete de Consulta</CardTitle></div></CardHeader>
            <CardContent>
                <p className="text-muted-foreground">Você tem uma consulta agendada para:</p>
                <p className="text-lg font-semibold mt-2">{format(new Date(appointment.appointment_time), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}</p>
            </CardContent>
        </Card>
    );
};


const AnamneseModal = ({ isOpen, setIsOpen, anamnese, onSave }) => {
    const [anamneseData, setAnamneseData] = useState({});
    const [loading, setLoading] = useState(false);
    useEffect(() => { setAnamneseData(anamnese?.data || {}); }, [anamnese, isOpen]);
    const handleSave = async () => { setLoading(true); await onSave(anamneseData); setLoading(false); };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Preencher Anamnese</DialogTitle></DialogHeader>
                <div className="py-4 max-h-[70vh] overflow-y-auto pr-2"><AnamneseForm anamneseData={anamneseData} setAnamneseData={setAnamneseData} isExpanded={true} /></div>
                <DialogFooter><Button variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>Cancelar</Button><Button onClick={handleSave} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const GoalProgress = ({ label, consumed, goal }) => {
    const percentage = goal > 0 ? (consumed / goal) * 100 : 0;
    return (
        <div>
            <div className="flex justify-between items-baseline mb-1"><span className="text-sm font-medium text-foreground">{label}</span><span className="text-xs text-muted-foreground">{Math.round(consumed)} / {Math.round(goal)}</span></div>
            <div className="w-full bg-muted rounded-full h-2"><motion.div className="bg-primary h-2 rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(percentage, 100)}%` }} transition={{ duration: 0.5, ease: "easeInOut" }}/></div>
        </div>
    );
};

const GoalsCard = ({ prescription, periodEntries }) => {
    const goals = useMemo(() => {
        if (!prescription) return null;
        const multiplier = periodEntries.numDays;
        return { calories: prescription.calories * multiplier, protein: prescription.protein * multiplier, carbs: prescription.carbs * multiplier, fat: prescription.fat * multiplier };
    }, [prescription, periodEntries.numDays]);

    if (!goals) return null;

    return (
        <div className="space-y-3">
            <GoalProgress label="Calorias" consumed={periodEntries.totals.calories} goal={goals.calories} />
            <GoalProgress label="Proteínas" consumed={periodEntries.totals.protein} goal={goals.protein} />
            <GoalProgress label="Carboidratos" consumed={periodEntries.totals.carbs} goal={goals.carbs} />
            <GoalProgress label="Gorduras" consumed={periodEntries.totals.fat} goal={goals.fat} />
        </div>
    );
};


export default function PatientDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prescription, setPrescription] = useState(null);
  const [allMeals, setAllMeals] = useState([]);
  const [anamnese, setAnamnese] = useState(null);
  const [appointment, setAppointment] = useState(null);
  const [showAnamneseModal, setShowAnamneseModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    const { data: presData } = await supabase.from('prescriptions').select('*').eq('patient_id', user.id).lte('start_date', todayStr).gte('end_date', todayStr).maybeSingle();
    setPrescription(presData);

    const firstDayOfMonth = format(startOfMonth(today), 'yyyy-MM-dd');
    const { data: mealsData } = await supabase.from('meals').select('*').eq('patient_id', user.id).gte('meal_date', firstDayOfMonth);
    setAllMeals(mealsData || []);

    const { data: anamneseData } = await supabase.from('anamneses').select('*').eq('patient_id', user.id).maybeSingle();
    setAnamnese(anamneseData);

    const { data: apptData } = await supabase.from('appointments').select('*').eq('patient_id', user.id).gte('appointment_time', today.toISOString()).order('appointment_time', { ascending: true }).limit(1).maybeSingle();
    setAppointment(apptData);
    
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);
  
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`public:appointments:patient_id=eq.${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments'}, payload => { loadData(); })
        .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadData]);

  const handleSaveAnamnese = async (data) => {
    if (!user.profile.nutritionist_id) { toast({ title: "Erro", description: "Você não tem um nutricionista associado.", variant: "destructive" }); return; }
    const { error } = await supabase.from('anamneses').upsert({ patient_id: user.id, nutritionist_id: user.profile.nutritionist_id, data: data, id: anamnese?.id }, { onConflict: 'patient_id' });
    if (error) { toast({ title: "Erro", description: "Não foi possível salvar a anamnese.", variant: "destructive" }); } 
    else { toast({ title: "Sucesso!", description: "Anamnese salva com sucesso." }); setShowAnamneseModal(false); loadData(); }
  };

  const todayTotals = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return allMeals.filter(e => e.meal_date === todayStr).reduce((acc, entry) => ({ calories: acc.calories + entry.total_calories, protein: acc.protein + entry.total_protein, fat: acc.fat + entry.total_fat, carbs: acc.carbs + entry.total_carbs }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
  }, [allMeals]);
  
  const weeklyTotals = useMemo(() => {
    const today = new Date();
    const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const numDays = (today.getDay() === 0 ? 7 : today.getDay());
    const totals = allMeals.filter(e => e.meal_date >= weekStart && e.meal_date <= weekEnd).reduce((acc, entry) => ({ calories: acc.calories + entry.total_calories, protein: acc.protein + entry.total_protein, fat: acc.fat + entry.total_fat, carbs: acc.carbs + entry.total_carbs }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
    return { totals, numDays };
  }, [allMeals]);

  const monthlyTotals = useMemo(() => {
    const today = new Date();
    const monthStart = format(startOfMonth(today), 'yyyy-MM-dd');
    const numDays = today.getDate();
    const totals = allMeals.filter(e => e.meal_date >= monthStart).reduce((acc, entry) => ({ calories: acc.calories + entry.total_calories, protein: acc.protein + entry.total_protein, fat: acc.fat + entry.total_fat, carbs: acc.carbs + entry.total_carbs }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
    return { totals, numDays };
  }, [allMeals]);

  const pieData = prescription ? [{ name: 'Proteínas', value: todayTotals.protein, color: '#5F6F52', target: prescription.protein }, { name: 'Gorduras', value: todayTotals.fat, color: '#B99470', target: prescription.fat }, { name: 'Carboidratos', value: todayTotals.carbs, color: '#C4661F', target: prescription.carbs }] : [];
  const COLORS = ['#5F6F52', '#B99470', '#C4661F'];
  const calorieAdherence = prescription ? (todayTotals.calories / prescription.calories) * 100 : 0;
  const calorieStatus = getAdherenceStatus(calorieAdherence);

  if (loading) { return <div className="flex items-center justify-center h-screen">Carregando...</div>; }

  return (
    <div className="pb-24">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-6">
          <AppointmentReminderCard appointment={appointment} />
          {!anamnese && <AnamneseNotificationCard onOpenModal={() => setShowAnamneseModal(true)} />}
          {!prescription ? (
            <Card className="glass-card m-4"><CardContent className="text-center py-12"><Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" /><h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma dieta ativa</h3><p className="text-muted-foreground text-sm">Entre em contato com seu nutricionista.</p></CardContent></Card>
          ) : (
            <>
              <Card className="glass-card shadow-lg m-4">
                <CardHeader><CardTitle className="gradient-text">Resumo de Hoje</CardTitle><div className={`flex items-center text-sm font-medium ${calorieStatus.color}`}>{calorieStatus.icon}<span>{calorieStatus.text}</span></div></CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                    <div className="relative h-48 w-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">{pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip formatter={(value, name, props) => [`${Math.round(value)}g de ${Math.round(props.payload.target)}g`, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-bold text-destructive">{Math.round(todayTotals.calories)}</span><span className="text-sm text-muted-foreground">/{prescription.calories} kcal</span></div>
                    </div>
                    <div className="w-full grid grid-cols-3 gap-2 text-center">
                        {pieData.map(macro => {
                            const adherence = macro.target > 0 ? (macro.value / macro.target) * 100 : 0;
                            const status = getAdherenceStatus(adherence);
                            return (<div key={macro.name} className="p-2 rounded-lg bg-background/50"><p className="text-xs text-muted-foreground">{macro.name}</p><p className={`font-bold text-sm ${status.color}`}>{Math.round(macro.value)}g</p></div>)
                        })}
                    </div>
                </CardContent>
              </Card>
              <Card className="glass-card m-4">
                <CardHeader><CardTitle>Metas e Progresso</CardTitle><CardDescription>Acompanhe sua evolução semanal e mensal.</CardDescription></CardHeader>
                <CardContent>
                    <Tabs defaultValue="week" className="w-full">
                        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="week"><CalendarDays className="w-4 h-4 mr-2"/>Semana</TabsTrigger><TabsTrigger value="month"><BarChart className="w-4 h-4 mr-2"/>Mês</TabsTrigger></TabsList>
                        <TabsContent value="week" className="pt-4"><GoalsCard prescription={prescription} periodEntries={weeklyTotals} /></TabsContent>
                        <TabsContent value="month" className="pt-4"><GoalsCard prescription={prescription} periodEntries={monthlyTotals} /></TabsContent>
                    </Tabs>
                </CardContent>
              </Card>
            </>
          )}
        </motion.div>
        <AnamneseModal isOpen={showAnamneseModal} setIsOpen={setShowAnamneseModal} anamnese={anamnese} onSave={handleSaveAnamnese} />
    </div>
  );
}