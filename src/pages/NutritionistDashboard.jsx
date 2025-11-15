import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Calendar, MessageSquare, UserCheck, Loader2, BookOpen, BrainCircuit,
  Users, // Ícone para Total de Pacientes
  Bell, // Ícone para Alertas do Calendário
  PieChart, // Ícone para Adesão
  CalendarDays, // Ícone para Consultas Agendadas
  DollarSign // Ícone para Faturamento
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import NotificationsPanel from '@/components/NotificationsPanel';
import PatientUpdatesWidget from '@/components/nutritionist/PatientUpdatesWidget';
import NutritionistActivityFeed from '@/components/nutritionist/NutritionistActivityFeed';
import { format, parseISO, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// --- WIDGET (DIREITA): Próximas Consultas ---
const UpcomingAppointmentsWidget = ({ appointments }) => {
  const navigate = useNavigate();
  
  return (
    <Card className="bg-card shadow-card-dark rounded-xl">
      <CardHeader>
        <CardTitle className="font-clash text-lg font-semibold text-primary">
          Próximas Consultas
        </CardTitle>
        <CardDescription className="text-muted-foreground">
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
    return <div className="flex items-center justify-center h-screen bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background"> 
      
      
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto w-full px-4 md:px-8" 
      >
        {/* Zona de Ação Rápida */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          {/* Lado Esquerdo: Título e Descrição */}
          <div>
            <h2 className="text-3xl font-bold font-heading uppercase tracking-wide text-primary">
              Dashboard
            </h2>
            <p className="text-neutral-600">
              Visualize as informações mais importantes da sua operação.
            </p>
          </div>

          {/* Lado Direito: Ações Rápidas */}
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => navigate('/nutritionist/patients')}>
              <Users className="h-4 w-4 mr-2" />
              Ver todos os pacientes
            </Button>
            <Button variant="secondary" onClick={() => navigate('/nutritionist/patients')}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Paciente
            </Button>
          </div>
        </div>


        {/* --- Conteúdo da Página --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Coluna Lateral */}
          <div className="lg:col-span-1 space-y-8 lg:order-last">
            <UpcomingAppointmentsWidget appointments={appointments} />
            <PatientUpdatesWidget />
          </div>

          {/* Coluna Principal*/}
          <div className="lg:col-span-2 space-y-8 lg:order-first">
            {/* Cards de Estatística - Design com Cores Vibrantes */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
              {/* Card 1: Pacientes (Verde) */}
              <Card className="bg-primary text-white border-0 shadow-card-dark">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-heading uppercase text-sm font-medium text-white/80 whitespace-nowrap tracking-wide">
                    Total de Pacientes
                  </CardTitle>
                  <Users className="h-6 w-6 text-white/80" />
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-white">
                    {patients.length}
                  </div>
                  <p className="text-xs text-white/70">
                    Pacientes ativos
                  </p>
                </CardContent>
              </Card>

              {/* Card 2: Consultas (Laranja) */}
              <Card className="bg-secondary text-white border-0 shadow-card-dark">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-heading uppercase text-sm font-medium text-white/80 whitespace-nowrap tracking-wide">
                    Consultas Agendadas
                  </CardTitle>
                  <CalendarDays className="h-6 w-6 text-white/80" />
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-white">
                    {appointments.length}
                  </div>
                  <p className="text-xs text-white/70">
                    Próximas consultas
                  </p>
                </CardContent>
              </Card>

              {/* Card 3: Alertas (Neutro Escuro) */}
              <Card className="bg-neutral-800 text-white border-0 shadow-card-dark">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-heading uppercase text-sm font-medium text-white/80 whitespace-nowrap tracking-wide">
                    Alertas do Dia
                  </CardTitle>
                  <Bell className="h-6 w-6 text-white/80" />
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-white">
                    {alertsCount}
                  </div>
                  <p className="text-xs text-white/70">
                    Consultas e notificações
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Feed do Nutricionista (Alertas e Pendências) */}
            <NutritionistActivityFeed />

          </div>
          
        </div>
      </motion.div>
      
      <NotificationsPanel isOpen={showNotifications} setIsOpen={setShowNotifications} />
    </div>
  );
}