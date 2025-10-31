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
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import NotificationsPanel from '@/components/NotificationsPanel';
import RecentActivityFeed from '@/components/nutritionist/RecentActivityFeed';
import { format, parseISO, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// --- WIDGET (DIREITA): Próximas Consultas ---
const UpcomingAppointmentsWidget = ({ appointments }) => {
  const navigate = useNavigate();
  
  return (
    <Card className="bg-card shadow-figma-btn rounded-xl">
      <CardHeader>
        <CardTitle className="font-clash text-lg font-semibold text-primary">
          Próximas Consultas
        </CardTitle>
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

// --- WIDGET (ESQUERDA): Cards de Estatística ---
const StatCard = ({ title, description, value, icon: Icon, link }) => (
  <Card className="bg-card shadow-figma-btn rounded-xl">
    <CardHeader className="relative pb-2">
      <CardTitle className="font-clash text-xl font-semibold text-primary">
        {title}
      </CardTitle>
      <CardDescription className="text-destructive font-semibold">
        {description}
      </CardDescription>
      <div className="absolute top-4 right-4">
        <Icon className="h-5 w-5 text-destructive" />
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-4xl font-bold text-accent my-4">
        {value}
      </div>
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
        link="/nutritionist/patients"
      />
      <StatCard 
        title="Alertas do Dia"
        description="Consultas e notificações"
        value={alertsCount}
        icon={Bell}
        link="/nutritionist/alerts" // Link para a página de Alertas
      />
      <StatCard 
        title="Adesão de Dieta"
        description="Média de registros (Hoje)"
        value={adherencePercent}
        icon={PieChart}
        link="/nutritionist/alerts" // Link para a página de Alertas
      />
    </div>
  );
};

// --- WIDGET (ESQUERDA - DENTRO DO FEED): Precisando de Atenção ---
const LowAdherencePatientsWidget = () => (
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
  const { unreadSenders } = useChat();
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [alertsCount, setAlertsCount] = useState(0); 
  const [adherence, setAdherence] = useState('--%'); 
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  
  const fetchData = useCallback(async () => {
    if (!user || !user.id) return;
    setLoading(true);
    try {
      const today = new Date().toISOString(); 
      const todayDateOnly = new Date().toISOString().split('T')[0];
      const todayMonthDay = format(new Date(), 'MM-dd'); 

      // Busca de Pacientes (com birth_date)
      const { data: patientData, error: patientError } = await supabase
        .from('user_profiles')
        .select('id, name, birth_date')
        .eq('nutritionist_id', user.id)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (patientError) throw patientError;
      setPatients(patientData || []);

      // Busca de Consultas (Próximas 3)
      const { data: apptData, error: apptError } = await supabase
        .from('appointments')
        .select('id, appointment_time, patient:appointments_patient_id_fkey(id, name, avatar_url)')
        .eq('nutritionist_id', user.id)
        .gte('appointment_time', today) 
        .order('appointment_time', { ascending: true }) 
        .limit(3);
      if (apptError) throw apptError;
      setAppointments(apptData || []);
      
      // Busca de Notificações
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

      // Contagem de Aniversário
      const birthdayCount = (patientData || []).filter(p => {
          if (!p.birth_date) return false;
          const birthDate = new Date(p.birth_date);
          birthDate.setHours(birthDate.getHours() + 4); // Corrige fuso
          return format(birthDate, 'MM-dd') === todayMonthDay;
        }
      ).length;
      
      // Soma tudo para os "Alertas do Dia"
      setAlertsCount((notifCount || 0) + (todayApptCount || 0) + birthdayCount);

      // 5. *** MUDANÇA: Busca de Adesão (Real) ***
      const { data: adherenceData, error: adherenceError } = await supabase
        .rpc('get_daily_adherence', { p_nutritionist_id: user.id });

      if (adherenceError) {
        console.error('Erro ao buscar adesão:', adherenceError);
        setAdherence('--%');
      } else {
        setAdherence(Math.round(adherenceData) + '%'); // Arredonda e adiciona '%'
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

  if (loading || !user?.profile) {
    return <div className="flex items-center justify-center h-screen bg-background-page"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background-page"> 
      
      <DashboardHeader 
        user={user.profile}
        logout={signOut}
        onToggleNotifications={() => setShowNotifications(s => !s)}
      />
      
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
                onClick={() => navigate('/nutritionist/patients')}
                className="bg-primary text-primary-foreground rounded-5px shadow-figma-btn font-semibold hover:bg-primary/90 whitespace-nowrap"
              >
                <Plus className="w-4 h-4 mr-2" />
                Meus Pacientes
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
                onClick={() => navigate('/nutritionist/patients')}
                className="w-full bg-primary text-primary-foreground rounded-5px shadow-figma-btn font-semibold hover:bg-primary/90"
              >
                  <Plus className="w-4 h-4 mr-2" />
                  Meus Pacientes
              </Button>
            </div>
          </div>
        </div>
        {/* --- FIM DO BLOCO "DASHBOARD" --- */}


        {/* --- Conteúdo da Página --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Coluna Lateral */}
          <div className="lg:col-span-1 space-y-8 lg:order-last">
            <UpcomingAppointmentsWidget appointments={appointments} />
            <RecentActivityFeed />
          </div>

          {/* Coluna Principal*/}
          <div className="lg:col-span-2 space-y-8 lg:order-first">
            {/* Cards de Estatística */}
            <DashboardStats 
              patientCount={patients.length} 
              alertsCount={alertsCount} 
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
      
      <NotificationsPanel isOpen={showNotifications} setIsOpen={setShowNotifications} />
    </div>
  );
}