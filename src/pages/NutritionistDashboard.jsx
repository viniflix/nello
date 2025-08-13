
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, Target, Calendar, User, Plus } from 'lucide-react';
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

export default function NutritionistDashboard() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [patients, setPatients] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [showPrescription, setShowPrescription] = useState(false);
  const [showAddPatient, setShowAddPatient] = useState(false);
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

  const handleAddPatient = useCallback(() => {
    loadData();
  }, [loadData]);

  const handleAddPrescription = async (newPrescription) => {
    const { error } = await supabase
      .from('prescriptions')
      .upsert(newPrescription, { onConflict: 'patient_id, start_date' })
      .select();

    if (error) {
      console.error("Prescription error:", error);
      toast({ title: "Erro", description: "Não foi possível salvar a prescrição.", variant: "destructive" });
    } else {
      toast({ title: "Sucesso!", description: "Prescrição salva com sucesso." });
      loadData();
      setShowPrescription(false);
      setSelectedPatient(null);
    }
  };

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

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader 
        user={user.profile} 
        logout={signOut} 
        title="HipoZero" 
        subtitle="Painel do Nutricionista"
        icon={<User className="w-6 h-6 text-primary-foreground" />}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
              <p className="text-muted-foreground">Gerencie seus pacientes e prescrições</p>
            </div>
            <Button onClick={() => setShowAddPatient(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Paciente
            </Button>
          </div>

          <DashboardStats patientCount={patients.length} prescriptionCount={activePrescriptionCount} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <PatientListCard
                patients={patients}
                prescriptions={prescriptions}
                onPrescribe={handleOpenPrescriptionDialog}
              />
            </div>
            <RecentPrescriptionsCard
              prescriptions={prescriptions}
              patients={patients}
            />
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
        onAddPrescription={handleAddPrescription}
        existingPrescription={existingPrescription}
      />
    </div>
  );
}
