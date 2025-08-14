
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, Target, Calendar, User, Plus, BookOpen, BrainCircuit, DollarSign, Bell, UserCog, Code } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardHeader from '@/components/DashboardHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PatientListCard from '@/components/nutritionist/PatientListCard';
import RecentPrescriptionsCard from '@/components/nutritionist/RecentPrescriptionsCard';
import PrescriptionDialog from '@/components/nutritionist/PrescriptionDialog';
import AddPatientDialog from '@/components/nutritionist/AddPatientDialog';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import NotificationsPanel from '@/components/NotificationsPanel';
import PatientAdherenceChart from '@/components/nutritionist/PatientAdherenceChart';
import RecentActivityFeed from '@/components/nutritionist/RecentActivityFeed';

const DashboardStats = ({ patientCount, prescriptionCount }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-card-foreground/80">Total de Pacientes</CardTitle>
        <Users className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-primary">{patientCount}</div>
      </CardContent>
    </Card>
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-card-foreground/80">Prescrições Ativas</CardTitle>
        <Target className="h-4 w-4 text-accent" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-accent">{prescriptionCount}</div>
      </CardContent>
    </Card>
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-card-foreground/80">Este Mês</CardTitle>
        <Calendar className="h-4 w-4 text-secondary" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-secondary">{new Date().toLocaleDateString('pt-BR', { month: 'long' })}</div>
      </CardContent>
    </Card>
  </div>
);

const DevBar = ({ show }) => {
    if(!show) return null;
    return (
        <div className="fixed bottom-0 left-0 right-0 bg-foreground text-background p-2 z-50">
            <div className="max-w-7xl mx-auto flex justify-end items-center gap-4">
                 <Link to="/nutritionist/calculations" className="text-xs hover:underline flex items-center gap-1">
                    <BrainCircuit className="w-3 h-3"/> Central de Cálculos
                </Link>
            </div>
        </div>
    )
}

export default function NutritionistDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [patients, setPatients] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [showPrescription, setShowPrescription] = useState(false);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    
    const { data: patientsData, error: patientsError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_type', 'patient')
      .eq('nutritionist_id', user.id);

    if (patientsError) {
      toast({ title: "Erro", description: "Não foi possível carregar os pacientes.", variant: "destructive" });
      setPatients([]);
    } else {
      setPatients(patientsData || []);
    }

    const patientIds = patientsData?.map(p => p.id) || [];
    if (patientIds.length > 0) {
        const { data: prescriptionsData, error: prescriptionsError } = await supabase
          .from('prescriptions')
          .select('*')
          .in('patient_id', patientIds);

        if (prescriptionsError) {
          toast({ title: "Erro", description: "Não foi possível carregar as prescrições.", variant: "destructive" });
          setPrescriptions([]);
        } else {
          setPrescriptions(prescriptionsData || []);
        }
    } else {
        setPrescriptions([]);
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  useEffect(() => {
      const fetchUnread = async () => {
          if(!user) return;
          const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);
          setUnreadNotifications(count || 0);
      };
      fetchUnread();
      
      const channel = supabase.channel(`notifications-count:${user?.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user?.id}`}, payload => {
            fetchUnread();
        })
        .subscribe();
    
    return () => { supabase.removeChannel(channel); }
  }, [user]);

  const handleAddPatient = useCallback(() => {
    loadData();
  }, [loadData]);

  const handleSavePrescription = useCallback(() => {
    loadData();
  }, [loadData]);

  const handleOpenPrescriptionDialog = (patient) => {
    setSelectedPatient(patient);
    setShowPrescription(true);
  };
  
  const activePrescriptionCount = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    return prescriptions.filter(p => new Date(p.end_date) >= today).length;
  }, [prescriptions]);


  if (loading || !user) {
    return <div className="flex items-center justify-center h-screen">Carregando dashboard...</div>;
  }
  
  const existingPrescription = selectedPatient ? prescriptions.find(p => p.patient_id === selectedPatient.id) : null;
  const showDevBar = user?.profile?.preferences?.showDevBar || false;
  const showFinancials = user?.profile?.preferences?.showFinancials || false;

  return (
    <div className="min-h-screen bg-background">
       <DashboardHeader 
        user={user.profile} 
        logout={signOut} 
        title="HipoZero" 
        subtitle="Painel do Nutricionista"
        icon={<User className="w-6 h-6 text-primary-foreground" />}
        actions={
            <Button variant="ghost" size="icon" onClick={() => setShowNotifications(true)} className="relative">
                <Bell className="w-5 h-5 text-primary-foreground" />
                {unreadNotifications > 0 && <div className="absolute top-0 right-0 w-2 h-2 bg-destructive rounded-full" />}
            </Button>
        }
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
              <p className="text-muted-foreground">Gerencie seus pacientes e prescrições</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                 <Button variant="ghost" asChild>
                    <Link to="/nutritionist/profile"><UserCog className="w-4 h-4 mr-2" /> Meu Perfil</Link>
                </Button>
                <Button variant="outline" asChild>
                    <Link to="/nutritionist/agenda"><Calendar className="w-4 h-4 mr-2" /> Agenda</Link>
                </Button>
                {showFinancials && (
                  <Button variant="outline" asChild>
                      <Link to="/nutritionist/financial"><DollarSign className="w-4 h-4 mr-2" /> Financeiro</Link>
                  </Button>
                )}
                <Button variant="outline" asChild>
                    <Link to="/nutritionist/food-bank"><BookOpen className="w-4 h-4 mr-2" /> Banco de Alimentos</Link>
                </Button>
                <Button variant="outline" asChild>
                    <Link to="/nutritionist/calculator"><BrainCircuit className="w-4 h-4 mr-2" /> Calculadora</Link>
                </Button>
                <Button onClick={() => setShowAddPatient(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Paciente
                </Button>
            </div>
          </div>

          <DashboardStats patientCount={patients.length} prescriptionCount={activePrescriptionCount} />

          <PatientAdherenceChart />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <PatientListCard
                patients={patients}
                prescriptions={prescriptions}
                onPrescribe={handleOpenPrescriptionDialog}
              />
            </div>
            <div className="space-y-8">
              <RecentPrescriptionsCard
                prescriptions={prescriptions}
                patients={patients}
              />
              <RecentActivityFeed />
            </div>
          </div>
        </motion.div>
      </main>

      <AddPatientDialog
        isOpen={showAddPatient}
        setIsOpen={setShowAddPatient}
        onAddPatient={handleAddPatient}
        nutritionistId={user.id}
      />

      <PrescriptionDialog
        isOpen={showPrescription}
        setIsOpen={setShowPrescription}
        patient={selectedPatient}
        nutritionistId={user.id}
        onSave={handleSavePrescription}
        existingPrescription={existingPrescription}
      />
      <NotificationsPanel isOpen={showNotifications} setIsOpen={setShowNotifications} />
      <DevBar show={showDevBar} />
    </div>
  );
}
