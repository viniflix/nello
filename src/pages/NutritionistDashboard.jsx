import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Plus, Calendar, MessageSquare, UserCheck, Loader2, BookOpen, BrainCircuit, 
  Users, // Ícone para Total de Pacientes
  Bell, // Ícone para Alertas do Calendário
  PieChart // Ícone para Adesão
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardHeader from '@/components/DashboardHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
// PatientListCard NÃO é mais importado
import PrescriptionDialog from '@/components/nutritionist/PrescriptionDialog';
import AddPatientDialog from '@/components/nutritionist/AddPatientDialog';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import NotificationsPanel from '@/components/NotificationsPanel';
import RecentActivityFeed from '@/components/nutritionist/RecentActivityFeed'; // Será usado na lateral
import { format, parseISO, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// --- WIDGET (DIREITA): Próximas Consultas ---
const UpcomingAppointmentsWidget = ({ appointments }) => {
  const navigate = useNavigate();
  
  return (
    // Card com sombra
    <Card className="bg-card shadow-figma-btn rounded-xl">
      <CardHeader>
        {/* Título com fonte Clash Display e cor #4F6F52 (text-primary) */}
        <CardTitle className="font-clash text-lg font-semibold text-primary">
          Próximas Consultas
        </CardTitle>
        {/* Descrição com cor #B99470 */}
        <CardDescription style={{ color: '#B99470' }}>
          Seus próximos agendamentos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {appointments.length > 0 ? (
          <div className="space-y-4">
            {appointments.map(appt => {
              const profile = appt.patient; 
              return (
                <div key={appt.id} className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex-shrink-0 flex items-center justify-center">
                    <span className="font-semibold text-emerald-700">
                      {(profile?.name || 'P').substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{profile?.name || 'Paciente (Excluído)'}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(appt.appointment_time), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              );
            })}
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => navigate('/nutritionist/agenda')}>
              Ver agenda completa
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma consulta agendada.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

// --- WIDGET (ESQUERDA): 3 Cards de Estatística ---
const StatCard = ({ title, description, value, icon: Icon, link }) => (
  <Card className="bg-card shadow-figma-btn rounded-xl">
    <CardHeader className="relative pb-2">
      {/* Título (Clash Display, Verde #4F6F52) */}
      <CardTitle className="font-clash text-xl font-semibold text-primary">
        {title}
      </CardTitle>
      {/* Descrição (Nunito, Laranja #C4661F) */}
      <CardDescription className="text-destructive font-semibold">
        {description}
      </CardDescription>
      {/* Ícone (Laranja #C4661F, canto superior direito) */}
      <div className="absolute top-4 right-4">
        <Icon className="h-5 w-5 text-destructive" />
      </div>
    </CardHeader>
    <CardContent>
      {/* Informação (Nunito, Grande, Marrom #783D19) */}
      <div className="text-4xl font-bold text-accent my-4">
        {value}
      </div>
      {/* Link "Ver mais..." (Laranja #C4661F) */}
      <Link to={link} className="text-xs font-semibold text-destructive hover:underline self-end">
        Ver mais...
      </Link>
    </CardContent>
  </Card>
);

const DashboardStats = ({ patientCount, alertsCount, adherencePercent }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <StatCard 
        title="Total de Pacientes"
        description="Pacientes ativos"
        value={patientCount}
        icon={Users}
        link="/nutritionist/patients" // Link para a futura página de pacientes
      />
      <StatCard 
        title="Alertas do Dia"
        description="Consultas e notificações"
        value={alertsCount}
        icon={Bell}
        link="/nutritionist/agenda" // Link para agenda
      />
      <StatCard 
        title="Adesão de Dieta"
        description="Média de registros (Hoje)"
        value={adherencePercent}
        icon={PieChart}
        link="#" // Link para uma futura página de relatórios
      />
    </div>
  );
};

// --- WIDGET (ESQUERDA - DENTRO DO FEED): Precisando de Atenção ---
const LowAdherencePatientsWidget = () => (
  // Card SEM SOMBRA, pois está dentro do "Feed de Atividades"
  <Card className="bg-card rounded-xl border-none"> 
    <CardHeader>
      <CardTitle className="font-clash text-lg font-semibold text-primary">Precisando de Atenção</CardTitle>
      <CardDescription style={{ color: '#B99470' }}>
        Pacientes com baixa adesão ou pendências.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground text-center py-4">
        (Em breve: Pacientes com baixa adesão ou anamneses pendentes)
      </p>
    </CardContent>
  </Card>
);


// --- COMPONENTE PRINCIPAL DO DASHBOARD ---
export default function NutritionistDashboard() {
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const { unreadSenders } = useChat(); // 'unreadSenders' não é usado neste layout
  const navigate = useNavigate();

  const [patients, setPatients] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0); 
  const [adherence, setAdherence] = useState('--%'); 
  const [loading, setLoading] = useState(true);
  
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showPrescription, setShowPrescription] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [existingPrescription, setExistingPrescription] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  
  const fetchData = useCallback(async () => {
    if (!user || !user.id) return;
    setLoading(true);
    try {
      const today = new Date().toISOString(); 
      const todayDateOnly = new Date().toISOString().split('T')[0];

      // Busca de Pacientes (para o card de estatística)
      const { data: patientData, error: patientError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('nutritionist_id', user.id)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (patientError) throw patientError;
      setPatients(patientData || []);

      // Busca de Prescrições (para o modal)
      const { data: prescriptionData, error: prescriptionError } = await supabase
        .from('prescriptions')
        .select('*')
        .eq('nutritionist_id', user.id);
      if (prescriptionError) throw prescriptionError;
      setPrescriptions(prescriptionData || []);

      // Busca de Consultas (Próximas 3, para o widget da direita)
      const { data: apptData, error: apptError } = await supabase
        .from('appointments')
        .select('id, appointment_time, patient:appointments_patient_id_fkey(id, name, avatar_url)')
        .eq('nutritionist_id', user.id)
        .gte('appointment_time', today) 
        .order('appointment_time', { ascending: true }) 
        .limit(3);
      if (apptError) throw apptError;
      setAppointments(apptData || []);
      
      // Busca de Notificações/Alertas (Contagem)
      const { count: notifCount, error: notifError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      if (notifError) throw notifError;
      
      // Contar consultas de HOJE
      const { count: todayApptCount, error: todayApptError } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('nutritionist_id', user.id)
        .gte('appointment_time', `${todayDateOnly}T00:00:00`)
        .lte('appointment_time', `${todayDateOnly}T23:59:59`);
      if (todayApptError) throw todayApptError;
      
      setUnreadNotifications((notifCount || 0) + (todayApptCount || 0));

      // 5. Busca de Adesão (Placeholder)
      if (patientData && patientData.length > 0) {
        setAdherence('100%'); // Valor de placeholder
      } else {
        setAdherence('0%');
      }

    } catch (error) {
      toast({ title: "Erro ao carregar dados", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if(user?.id) { 
      fetchData();
    }
  }, [user, fetchData]); 

  const handleAddPatient = () => fetchData();
  const handleSavePrescription = () => fetchData();

  const handleOpenPrescriptionDialog = (patient) => {
    // Esta função era usada pelo 'PatientListCard', está desabilitada.
    const existing = prescriptions.find(p => p.patient_id === patient.id);
    setSelectedPatient(patient);
    setExistingPrescription(existing || null);
    setShowPrescription(true);
  };

  if (loading || !user?.profile) {
    return <div className="flex items-center justify-center h-screen bg-background-page"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    // Fundo da página (cor #F9EBC7)
    <div className="flex flex-col min-h-screen bg-background-page"> 
      
      {/* O HEADER */}
      <DashboardHeader 
        user={user.profile}
        logout={signOut}
        onToggleNotifications={() => setShowNotifications(s => !s)}
      />
      
      {/* O CONTEÚDO PRINCIPAL (Tudo abaixo do header) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto w-full px-4 md:px-8" 
      >
        {/* Bloco "DASHBOARD" */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-8 mb-8">
          
          <div className="flex flex-col justify-center flex-1">
            <h1 className="font-clash text-4xl sm:text-5xl font-semibold text-primary">
              DASHBOARD
            </h1>
            <p className="text-lg text-accent mt-2">
              Gerencie seus pacientes, prescrições e análises.
            </p>
          </div>

          <div className="flex flex-col space-y-3">
            <div className="w-full h-2 bg-destructive rounded-full shadow-figma-btn lg:hidden"></div>
            <div className="hidden md:flex flex-wrap items-center justify-start lg:justify-end gap-3">
              <Button
                onClick={() => navigate('/nutritionist/agenda')}
                className="bg-card text-primary rounded-5px shadow-figma-btn font-semibold hover:bg-card/90 whitespace-nowrap"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Agenda
              </Button>
              <Button
                onClick={() => navigate('/nutritionist/food-bank')}
                className="bg-card text-primary rounded-5px shadow-figma-btn font-semibold hover:bg-card/90 whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                Banco de Alimentos
              </Button>
              <Button
                onClick={() => navigate('/nutritionist/calculator')}
                className="bg-card text-primary rounded-5px shadow-figma-btn font-semibold hover:bg-card/90 whitespace-nowrap"
              >
                <BrainCircuit className="w-4 h-4 mr-2" />
                Calculadora
              </Button>
              <Button 
                onClick={() => setShowAddPatient(true)} 
                className="bg-primary text-primary-foreground rounded-5px shadow-figma-btn font-semibold hover:bg-primary/90 whitespace-nowrap"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Paciente
              </Button>
            </div>
            <div className="block md:hidden space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button
                  onClick={() => navigate('/nutritionist/agenda')}
                  className="bg-card text-primary rounded-5px shadow-figma-btn font-semibold hover:bg-card/90"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Agenda
                </Button>
                <Button
                  onClick={() => navigate('/nutritionist/food-bank')}
                  className="bg-card text-primary rounded-5px shadow-figma-btn font-semibold hover:bg-card/90"
                >
                  <BookOpen className="w-4 h-4 mr-2" />
                  Banco de Alimentos
                </Button>
                <Button
                  onClick={() => navigate('/nutritionist/calculator')}
                  className="bg-card text-primary rounded-5px shadow-figma-btn font-semibold hover:bg-card/90"
                >
                  <BrainCircuit className="w-4 h-4 mr-2" />
                  Calculadora
                </Button>
              </div>
              <Button 
                onClick={() => setShowAddPatient(true)} 
                className="w-full bg-primary text-primary-foreground rounded-5px shadow-figma-btn font-semibold hover:bg-primary/90"
              >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Paciente
              </Button>
            </div>
          </div>
        </div>
        {/* --- FIM DO BLOCO "DASHBOARD" --- */}


        {/* --- LAYOUT DE GRID (Conteúdo da Página) --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Coluna Lateral */}
          <div className="lg:col-span-1 space-y-8 lg:order-last">
            <UpcomingAppointmentsWidget appointments={appointments} />
            {/* 'Atividades Recentes' */}
            <RecentActivityFeed />
          </div>

          {/* Coluna Principal*/}
          <div className="lg:col-span-2 space-y-8 lg:order-first">
            {/* 3 Cards de Estatística */}
            <DashboardStats 
              patientCount={patients.length} 
              alertsCount={unreadNotifications} 
              adherencePercent={adherence}
            />
            
            {/* "Card Feed de Atividades" */}
            <Card className="bg-card shadow-figma-btn rounded-xl">
              <CardHeader>
                <CardTitle className="font-clash text-lg font-semibold text-primary">Feed de Atividades</CardTitle>
                <CardDescription style={{ color: '#B99470' }}>
                  Ações importantes e pendências.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Card "Precisando de Atenção" */}
                <LowAdherencePatientsWidget />
                
                {/* (Quando tiver mais itens do feed, eles entram aqui) */}

              </CardContent>
            </Card>

          </div>
          
        </div>
      </motion.div>

      {/* --- Modais --- */}
      <AddPatientDialog
        isOpen={showAddPatient}
        setIsOpen={setShowAddPatient}
        onAddPatient={handleAddPatient}
        nutritionistId={user?.id}
      />
      <PrescriptionDialog
        isOpen={showPrescription}
        setIsOpen={setShowPrescription}
        patient={selectedPatient}
        nutritionistId={user?.id}
        onSave={handleSavePrescription}
        existingPrescription={existingPrescription}
      />
      <NotificationsPanel isOpen={showNotifications} setIsOpen={setShowNotifications} />
    </div>
  );
}