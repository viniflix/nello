import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Calendar, MessageSquare, UserCheck, Loader2, BookOpen, BrainCircuit,
  Users, // Ícone para Total de Pacientes
  Bell, // Ícone para Alertas do Calendário
  TrendingUp,
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
import { Skeleton } from '@/components/ui/skeleton';
import { StatCardSkeleton, AlertCardSkeleton } from '@/components/ui/card-skeleton';

const numericValue = (value) => {
  const onlyDigits = String(value ?? '').replace(/[^\d]/g, '');
  const parsed = Number(onlyDigits);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getCardTrend = (value) => {
  const base = Math.max(1, numericValue(value));
  return Array.from({ length: 7 }, (_, idx) => {
    const wave = Math.sin((base + idx) * 0.7);
    const trend = ((base + idx * 2) % 9) + 2;
    return Math.max(2, Math.round((wave + 1.2) * 3 + trend));
  });
};

const StatCardDecoration = ({ value }) => {
  const bars = getCardTrend(value);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
      <div className="absolute -right-1 -bottom-2 flex items-end gap-1 opacity-25">
        {bars.map((height, idx) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={`trend-${idx}`}
            className="w-1.5 rounded-t-full bg-white/90"
            style={{ height: `${height * 4}px` }}
          />
        ))}
      </div>
      <svg
        viewBox="0 0 160 80"
        className="absolute -left-8 bottom-3 h-16 w-48 opacity-20"
        aria-hidden="true"
      >
        <path
          d={`M 0 64 ${bars
            .map((h, idx) => `L ${idx * 24 + 10} ${76 - h * 3}`)
            .join(' ')}`}
          fill="none"
          stroke="white"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

const getUrgencyMeta = (appointmentTime) => {
  const diffMs = new Date(appointmentTime).getTime() - Date.now();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours <= 2) {
    return {
      label: 'Muito próxima',
      rowClass: 'border-red-300/80 bg-red-50/70',
      badgeClass: 'bg-red-100 text-red-700 border-red-200',
      dotClass: 'bg-red-500'
    };
  }

  if (diffHours <= 24) {
    return {
      label: 'Hoje',
      rowClass: 'border-orange-300/80 bg-orange-50/70',
      badgeClass: 'bg-orange-100 text-orange-700 border-orange-200',
      dotClass: 'bg-orange-500'
    };
  }

  if (diffHours <= 72) {
    return {
      label: 'Em breve',
      rowClass: 'border-amber-300/80 bg-amber-50/70',
      badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
      dotClass: 'bg-amber-500'
    };
  }

  return {
    label: 'Programada',
    rowClass: 'border-emerald-300/80 bg-emerald-50/70',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500'
  };
};

// --- WIDGET (DIREITA): Próximas Consultas ---
const UpcomingAppointmentsWidget = ({ appointments, totalUpcoming, todayAppointments }) => {
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
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="text-xl font-semibold text-foreground">{totalUpcoming}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Hoje</p>
            <p className="text-xl font-semibold text-foreground">{todayAppointments}</p>
          </div>
        </div>
        {appointments.length > 0 ? (
          <div className="space-y-4">
            {appointments.map(appt => {
              const profile = appt.patient; 
              const urgency = getUrgencyMeta(appt.appointment_time);
              return (
                <div key={appt.id} className={`rounded-lg border p-2.5 ${urgency.rowClass}`}>
                  <div className="mb-2 flex justify-end">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${urgency.badgeClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${urgency.dotClass}`} />
                      {urgency.label}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
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
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [appointmentsTodayCount, setAppointmentsTodayCount] = useState(0);
  const [appointmentsTotalCount, setAppointmentsTotalCount] = useState(0);
  const [adherence, setAdherence] = useState('--%');
  const [showNotifications, setShowNotifications] = useState(false);

  // OTIMIZADO: Loading states independentes para carregamento progressivo
  const [statsLoading, setStatsLoading] = useState(true);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  
  // OTIMIZADO: Função separada para carregar estatísticas
  const fetchStats = useCallback(async () => {
    if (!user || !user.id) return;
    setStatsLoading(true);
    try {
      // Buscar dados em paralelo
      const [patientData, notifCount, adherenceData] = await Promise.all([
        // Pacientes
        supabase
          .from('user_profiles')
          .select('id, name')
          .eq('nutritionist_id', user.id)
          .eq('is_active', true)
          .order('name', { ascending: true })
          .then(({ data, error }) => {
            if (error) throw error;
            return data || [];
          }),

        // Notificações não lidas
        supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false)
          .then(({ count, error }) => {
            if (error) throw error;
            return count || 0;
          }),

        // Adesão diária
        supabase
          .rpc('get_daily_adherence', { p_nutritionist_id: user.id })
          .then(({ data, error }) => {
            if (error) throw error;
            return data;
          })
      ]);

      setPatients(patientData);
      setUnreadNotifications(notifCount);
      setAdherence(adherenceData ? Math.round(adherenceData) + '%' : '--%');

    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
      toast({ title: "Erro ao carregar estatísticas", description: error.message, variant: "destructive" });
    } finally {
      setStatsLoading(false);
    }
  }, [user, toast]);

  // OTIMIZADO: Função separada para carregar agendamentos
  const fetchAppointments = useCallback(async () => {
    if (!user || !user.id) return;
    setAppointmentsLoading(true);
    try {
      const today = new Date().toISOString();
      const { data, error } = await supabase
        .from('appointments')
        .select('id, appointment_time, patient:appointments_patient_id_fkey(id, name, avatar_url)')
        .eq('nutritionist_id', user.id)
        .gte('appointment_time', today)
        .order('appointment_time', { ascending: true })
        .limit(3);

      if (error) throw error;
      setAppointments(data || []);

      const todayDateOnly = new Date().toISOString().split('T')[0];
      const [{ count: totalUpcomingCount, error: totalError }, { count: todayCount, error: todayError }] = await Promise.all([
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('nutritionist_id', user.id)
          .gte('appointment_time', today),
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('nutritionist_id', user.id)
          .gte('appointment_time', `${todayDateOnly}T00:00:00`)
          .lte('appointment_time', `${todayDateOnly}T23:59:59`)
      ]);

      if (totalError) throw totalError;
      if (todayError) throw todayError;
      setAppointmentsTotalCount(totalUpcomingCount || 0);
      setAppointmentsTodayCount(todayCount || 0);
    } catch (error) {
      console.error('Erro ao carregar agendamentos:', error);
      toast({ title: "Erro ao carregar agendamentos", description: error.message, variant: "destructive" });
    } finally {
      setAppointmentsLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user?.id) {
      // OTIMIZADO: Carrega dados em paralelo de forma independente
      fetchStats();
      fetchAppointments();
    }
  }, [user?.id, fetchStats, fetchAppointments]);

  return (
    <div className="flex flex-col min-h-screen bg-background"> 
      
      
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto w-full px-4 md:px-8 pt-8"
      >
        {/* Zona de Ação Rápida */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 text-center sm:text-left">
          {/* Lado Esquerdo: Título e Descrição */}
          <div>
            <h2 className="text-3xl font-bold font-heading uppercase tracking-wide text-primary">
              Dashboard
            </h2>
            <p className="text-neutral-600">
              Gerencie seus pacientes, Planos e Análises.
            </p>
          </div>

          {/* Lado Direito: Ação Rápida */}
          <div className="flex gap-2 flex-wrap justify-center sm:justify-end">
            <Button variant="secondary" onClick={() => navigate('/nutritionist/patients')}>
              <Users className="h-4 w-4 mr-2" />
              Ver todos os pacientes
            </Button>
          </div>
        </div>


        {/* --- Conteúdo da Página --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Coluna Lateral - Desktop à direita, Mobile: apenas Registros Recentes */}
          <div className="lg:col-span-1 space-y-8 lg:order-last order-3">
            {/* Próximas Consultas - Apenas Desktop */}
            <div className="hidden lg:block">
              {appointmentsLoading ? (
                <AlertCardSkeleton />
              ) : (
                <UpcomingAppointmentsWidget
                  appointments={appointments}
                  totalUpcoming={appointmentsTotalCount}
                  todayAppointments={appointmentsTodayCount}
                />
              )}
            </div>
            <PatientUpdatesWidget />
          </div>

          {/* Coluna Principal - Desktop à esquerda, Mobile no início */}
          <div className="lg:col-span-2 space-y-8 lg:order-first order-1">
            {/* Cards de Estatística - Layout 2x1 no mobile, 3 colunas no desktop */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
              {/* OTIMIZADO: Mostra skeletons enquanto carrega, depois mostra dados reais */}
              {statsLoading ? (
                <>
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <div className="col-span-2 lg:col-span-1">
                    <StatCardSkeleton />
                  </div>
                </>
              ) : (
                <>
                  {/* Card 1: Pacientes (Verde) */}
                  <Card className="relative overflow-hidden bg-primary text-white border-0 shadow-card-dark">
                    <StatCardDecoration value={patients.length} />
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="font-heading uppercase text-xs lg:text-sm font-medium text-white/80 tracking-wide leading-tight">
                        Total Pacientes
                      </CardTitle>
                      <Users className="h-5 w-5 lg:h-6 lg:w-6 text-white/80 flex-shrink-0" />
                    </CardHeader>
                    <CardContent className="relative">
                      <div className="text-3xl lg:text-4xl font-bold text-white">
                        {patients.length}
                      </div>
                      <p className="text-xs text-white/70">
                        Pacientes ativos
                      </p>
                    </CardContent>
                  </Card>

                  {/* Card 2: Mensagens (Neutro Escuro) - Mobile: posição 2, Desktop: posição 3 */}
                  <Card className="relative overflow-hidden bg-neutral-800 text-white border-0 shadow-card-dark lg:order-3">
                    <StatCardDecoration value={unreadNotifications} />
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="font-heading uppercase text-xs lg:text-sm font-medium text-white/80 tracking-wide leading-tight">
                        Não Lidas
                      </CardTitle>
                      <Bell className="h-5 w-5 lg:h-6 lg:w-6 text-white/80 flex-shrink-0" />
                    </CardHeader>
                    <CardContent className="relative">
                      <div className="text-3xl lg:text-4xl font-bold text-white">
                        {unreadNotifications}
                      </div>
                      <p className="text-xs text-white/70 leading-tight">
                        Notificações pendentes
                      </p>
                    </CardContent>
                  </Card>

                  {/* Card 3: Adesão (Laranja) - Mobile: ocupa 2 colunas embaixo, Desktop: posição 2 */}
                  <Card className="relative overflow-hidden bg-secondary text-white border-0 shadow-card-dark col-span-2 lg:col-span-1 lg:order-2">
                    <StatCardDecoration value={adherence} />
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="font-heading uppercase text-xs lg:text-sm font-medium text-white/80 tracking-wide leading-tight">
                        Adesão Hoje
                      </CardTitle>
                      <TrendingUp className="h-5 w-5 lg:h-6 lg:w-6 text-white/80 flex-shrink-0" />
                    </CardHeader>
                    <CardContent className="relative">
                      <div className="text-3xl lg:text-4xl font-bold text-white">
                        {adherence}
                      </div>
                      <p className="text-xs text-white/70">
                        Meta diária de adesão
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Feed do Nutricionista (Alertas e Pendências) - Desktop e Mobile no final */}
            <NutritionistActivityFeed />

          </div>

          {/* Mobile: Próximas Consultas entre Cards e Feed */}
          <div className="lg:hidden order-2">
            {appointmentsLoading ? (
              <AlertCardSkeleton />
            ) : (
              <UpcomingAppointmentsWidget
                appointments={appointments}
                totalUpcoming={appointmentsTotalCount}
                todayAppointments={appointmentsTodayCount}
              />
            )}
          </div>

        </div>
      </motion.div>
      
      <NotificationsPanel isOpen={showNotifications} setIsOpen={setShowNotifications} />
    </div>
  );
}