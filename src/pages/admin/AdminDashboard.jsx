import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, differenceInDays, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Stethoscope,
  Users,
  Utensils,
  Activity,
  TrendingUp,
  ShieldAlert,
  Loader2,
  UserPlus,
  DollarSign,
  CreditCard,
  Terminal,
  Megaphone,
  Send,
  AlertCircle,
  Info,
  AlertTriangle
} from 'lucide-react';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getDashboardStats } from '@/services/adminService';

// Cores para o gráfico de pizza
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// Eventos simulados para o Live Log (mais profissionais e diversos)
const FAKE_EVENTS = [
  { type: 'info', message: 'Registro de refeição: Café da manhã completo', user: 'Maria Silva' },
  { type: 'info', message: 'Sessão iniciada: Nutricionista autenticado', user: 'Dr. João Santos' },
  { type: 'info', message: 'Hidratação registrada: 500ml de água', user: 'Ana Costa' },
  { type: 'info', message: 'Acesso ao painel: Dashboard de pacientes', user: 'Dr. Pedro Lima' },
  { type: 'info', message: 'Atualização antropométrica: Peso registrado', user: 'Carlos Souza' },
  { type: 'warning', message: 'Tentativa de autenticação falhou: Credenciais inválidas', user: 'Sistema' },
  { type: 'info', message: 'Nova mensagem: Chat entre paciente e nutricionista', user: 'Julia Ferreira' },
  { type: 'error', message: 'Erro de servidor: Timeout na requisição /api/meals', user: 'Sistema' },
  { type: 'info', message: 'Questionário completado: Anamnese nutricional', user: 'Roberto Alves' },
  { type: 'info', message: 'Agendamento criado: Consulta para próxima semana', user: 'Dr. Fernanda Rocha' },
  { type: 'info', message: 'Plano alimentar atualizado: Nova prescrição', user: 'Dr. Lucas Mendes' },
  { type: 'info', message: 'Progresso registrado: Meta de proteínas atingida', user: 'Patricia Oliveira' },
  { type: 'info', message: 'Upload realizado: Foto de progresso adicionada', user: 'Ricardo Almeida' },
  { type: 'warning', message: 'Alerta: Paciente sem registro há 7 dias', user: 'Sistema' },
  { type: 'info', message: 'Exportação de dados: Relatório gerado', user: 'Dr. Camila Rodrigues' },
];

/**
 * AdminDashboard - CEO Mission Control Dashboard
 * 
 * Dashboard profissional com métricas SaaS, financeiro e logs em tempo real
 */
export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [liveLogs, setLiveLogs] = useState([]);
  const scrollAreaRef = useRef(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Security check: Only admins can access
  const isAdmin = user?.profile?.is_admin === true;

  useEffect(() => {
    if (user && !isAdmin) {
      toast({
        title: 'Acesso Negado',
        description: 'Esta página é restrita a administradores.',
        variant: 'destructive'
      });
      navigate('/nutritionist', { replace: true });
      return;
    }

    if (isAdmin) {
      loadStats();
    }
  }, [user, isAdmin, navigate, toast]);

  // Função para verificar se está no final do scroll
  const isAtBottom = (element, margin = 50) => {
    if (!element) return false;
    const { scrollHeight, scrollTop, clientHeight } = element;
    return scrollHeight - scrollTop - clientHeight <= margin;
  };

  // Função para scroll suave até o final
  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // Live Log Simulation (only when on System tab)
  useEffect(() => {
    if (activeTab !== 'system' || !isAdmin) return;

    // Adicionar alguns logs iniciais
    const initialLogs = FAKE_EVENTS.slice(0, 5).map((event, index) => ({
      id: `log-${Date.now()}-${index}`,
      type: event.type,
      message: event.message,
      user: event.user,
      timestamp: new Date(Date.now() - (5 - index) * 10000).toISOString()
    }));
    setLiveLogs(initialLogs);

    // Scroll inicial para o final
    setTimeout(() => scrollToBottom(), 100);

    // Adicionar novos logs aleatórios a cada 8-12 segundos (mais lento)
    const interval = setInterval(() => {
      // Verificar se o usuário está no final ANTES de adicionar o log
      const wasAtBottom = isAtBottom(scrollAreaRef.current, 50);

      const randomEvent = FAKE_EVENTS[Math.floor(Math.random() * FAKE_EVENTS.length)];
      const newLog = {
        id: `log-${Date.now()}`,
        type: randomEvent.type,
        message: randomEvent.message,
        user: randomEvent.user,
        timestamp: new Date().toISOString()
      };
      
      setLiveLogs(prev => {
        const updated = [newLog, ...prev].slice(0, 50); // Manter apenas os últimos 50
        
        // Só fazer scroll se o usuário estava no final
        if (wasAtBottom) {
          setTimeout(() => scrollToBottom(), 50);
        }
        
        return updated;
      });
    }, Math.random() * 4000 + 8000); // Entre 8-12 segundos (mais lento)

    return () => clearInterval(interval);
  }, [activeTab, isAdmin]);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await getDashboardStats();

      if (error) {
        console.error('[AdminDashboard] Erro ao carregar estatísticas:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar as estatísticas do dashboard.',
          variant: 'destructive'
        });
        // Set default stats to avoid crashes
        setStats({
          kpis: { totalNutritionists: 0, totalPatients: 0, totalMeals: 0, activePatients: 0 },
          growthData: [],
          goalsDistribution: [],
          recentUsers: []
        });
        return;
      }

      // Debug: Log the received data structure
      console.log('[AdminDashboard] Received stats data:', data);

      // Handle different possible response structures
      let processedData = null;
      
      if (data) {
        // If data is already in the expected format
        if (data.kpis || data.counts || data.totalNutritionists !== undefined) {
          // Try to extract from different possible structures
          processedData = {
            kpis: {
              totalNutritionists: data.kpis?.totalNutritionists || data.counts?.nutritionists || data.totalNutritionists || 0,
              totalPatients: data.kpis?.totalPatients || data.counts?.patients || data.totalPatients || 0,
              totalMeals: data.kpis?.totalMeals || data.counts?.meals || data.totalMeals || 0,
              activePatients: data.kpis?.activePatients || data.counts?.activePatients || data.activePatients || 0
            },
            growthData: data.growthData || data.growth || data.userGrowth || [],
            goalsDistribution: data.goalsDistribution || data.goals || data.patientGoals || [],
            recentUsers: data.recentUsers || data.users || data.newUsers || []
          };
        } else {
          // If data is the object itself (flat structure)
          processedData = {
            kpis: {
              totalNutritionists: data.totalNutritionists || data.nutritionists || 0,
              totalPatients: data.totalPatients || data.patients || 0,
              totalMeals: data.totalMeals || data.meals || 0,
              activePatients: data.activePatients || 0
            },
            growthData: data.growthData || [],
            goalsDistribution: data.goalsDistribution || [],
            recentUsers: data.recentUsers || []
          };
        }
      }

      console.log('[AdminDashboard] Processed stats:', processedData);
      setStats(processedData || {
        kpis: { totalNutritionists: 0, totalPatients: 0, totalMeals: 0, activePatients: 0 },
        growthData: [],
        goalsDistribution: [],
        recentUsers: []
      });
    } catch (error) {
      console.error('[AdminDashboard] Erro inesperado:', error);
      toast({
        title: 'Erro',
        description: 'Ocorreu um erro inesperado ao carregar os dados.',
        variant: 'destructive'
      });
      // Set default stats to avoid crashes
      setStats({
        kpis: { totalNutritionists: 0, totalPatients: 0, totalMeals: 0, activePatients: 0 },
        growthData: [],
        goalsDistribution: [],
        recentUsers: []
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBroadcast = () => {
    if (!broadcastMessage.trim()) {
      toast({
        title: 'Mensagem vazia',
        description: 'Por favor, digite uma mensagem para enviar.',
        variant: 'destructive'
      });
      return;
    }

    console.log(`[BROADCAST SENT]: ${broadcastMessage}`);
    
    toast({
      title: 'Broadcast Enviado',
      description: `Mensagem enviada para todos os usuários: "${broadcastMessage}"`,
      duration: 5000
    });

    // Adicionar ao log
    const broadcastLog = {
      id: `log-broadcast-${Date.now()}`,
      type: 'info',
      message: `Broadcast enviado: ${broadcastMessage}`,
      user: 'Sistema',
      timestamp: new Date().toISOString()
    };
    setLiveLogs(prev => [broadcastLog, ...prev].slice(0, 50));

    setBroadcastMessage('');
  };

  // Don't render if not admin
  if (!user || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <ShieldAlert className="w-12 h-12 text-destructive" />
              <div>
                <h2 className="text-xl font-semibold">Acesso Negado</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Esta página é restrita a administradores.
                </p>
              </div>
              <Button onClick={() => navigate('/nutritionist')}>
                Voltar ao Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Extrair dados do stats (com fallbacks)
  const kpis = stats?.kpis || {
    totalNutritionists: 0,
    totalPatients: 0,
    totalMeals: 0,
    activePatients: 0
  };

  const growthData = stats?.growthData || [];
  const goalsDistribution = stats?.goalsDistribution || [];
  const recentUsers = stats?.recentUsers || [];

  // Calcular métricas financeiras (simuladas)
  const estimatedMRR = kpis.totalNutritionists * 97; // R$97/mês por nutricionista
  const averageTicket = kpis.totalNutritionists > 0 ? estimatedMRR / kpis.totalNutritionists : 0;
  const churnRate = 2.5; // Simulado: 2.5%

  // Gerar dados de receita dos últimos 6 meses
  const revenueData = Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(new Date(), 5 - i);
    const monthName = format(date, 'MMM', { locale: ptBR });
    // Simular crescimento gradual
    const baseRevenue = estimatedMRR * 0.8;
    const growth = (5 - i) * 0.05;
    return {
      month: monthName.charAt(0).toUpperCase() + monthName.slice(1),
      receita: Math.round(baseRevenue * (1 + growth))
    };
  });

  // Formatar dados de crescimento para o gráfico
  const chartData = growthData.map(item => ({
    month: item.month || item.period || 'N/A',
    users: item.users || item.count || 0
  }));

  // Formatar dados de objetivos para o gráfico de pizza
  const pieData = goalsDistribution.map(item => ({
    name: item.name || item.goal || 'Outros',
    value: item.value || item.count || 0
  }));

  // Função para formatar "há X dias"
  const formatDaysAgo = (dateString) => {
    try {
      const date = new Date(dateString);
      const days = differenceInDays(new Date(), date);
      
      if (days === 0) return 'Hoje';
      if (days === 1) return 'Há 1 dia';
      if (days < 7) return `Há ${days} dias`;
      if (days < 30) return `Há ${Math.floor(days / 7)} semanas`;
      if (days < 365) return `Há ${Math.floor(days / 30)} meses`;
      return `Há ${Math.floor(days / 365)} anos`;
    } catch {
      return 'Data inválida';
    }
  };

  // Função para formatar timestamp do log
  const formatLogTime = (timestamp) => {
    try {
      return format(new Date(timestamp), 'HH:mm:ss');
    } catch {
      return '--:--:--';
    }
  };

  // Função para obter ícone do tipo de log
  const getLogIcon = (type) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />;
      default:
        return <Info className="w-3.5 h-3.5 text-blue-500" />;
    }
  };

  // Função para obter badge variant do tipo de log
  const getLogBadgeVariant = (type) => {
    switch (type) {
      case 'error':
        return 'destructive';
      case 'warning':
        return 'warning';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-8 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Painel de Controle Executivo</h1>
              <p className="text-muted-foreground mt-1">
                {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
            <Badge variant="outline" className="text-sm">
              <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
              Administrador
            </Badge>
          </div>
        </motion.div>

        {/* Tabs Structure */}
        <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="finance" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Financeiro
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              Sistema & Logs
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Visão Geral */}
          <TabsContent value="overview" className="space-y-6">
            {/* Row 1: KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Nutricionistas */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Nutricionistas
                    </CardTitle>
                    <Stethoscope className="h-5 w-5 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      <div className="text-3xl font-bold text-blue-600">{kpis.totalNutritionists}</div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Profissionais cadastrados
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Total Pacientes */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-green-500">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Pacientes
                    </CardTitle>
                    <Users className="h-5 w-5 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      <div className="text-3xl font-bold text-green-600">{kpis.totalPatients}</div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Usuários cadastrados
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Refeições Registradas */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-orange-500">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Refeições Registradas
                    </CardTitle>
                    <Utensils className="h-5 w-5 text-orange-500" />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      <div className="text-3xl font-bold text-orange-600">
                        {kpis.totalMeals.toLocaleString('pt-BR')}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Total de registros
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Taxa de Atividade */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-purple-500">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Taxa de Atividade
                    </CardTitle>
                    <Activity className="h-5 w-5 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      <div className="text-3xl font-bold text-purple-600">{kpis.activePatients}</div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Pacientes ativos
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Row 2: Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Crescimento da Plataforma (66%) */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="lg:col-span-2"
              >
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <CardTitle>Crescimento da Plataforma</CardTitle>
                    </div>
                    <CardDescription>
                      Evolução do número de usuários ao longo do tempo
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-[300px] w-full" />
                    ) : chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="month"
                            className="text-xs"
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          />
                          <YAxis
                            className="text-xs"
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--popover))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="users"
                            stroke="#3b82f6"
                            fillOpacity={1}
                            fill="url(#colorUsers)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                        <p>Nenhum dado disponível</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Objetivos dos Pacientes (33%) */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Objetivos dos Pacientes</CardTitle>
                    <CardDescription>
                      Distribuição por tipo de meta
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-[300px] w-full" />
                    ) : pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--popover))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value) => value}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                        <p>Nenhum dado disponível</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Row 3: Recent Activity */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-primary" />
                    <CardTitle>Novos Usuários</CardTitle>
                  </div>
                  <CardDescription>
                    Últimos 5 usuários cadastrados na plataforma
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center gap-4">
                          <Skeleton className="h-10 w-10 rounded-full" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : recentUsers.length > 0 ? (
                    <div className="space-y-4">
                      {recentUsers.slice(0, 5).map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user.avatar_url} alt={user.name} />
                            <AvatarFallback>
                              {user.name?.charAt(0).toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm truncate">{user.name || 'Sem nome'}</p>
                              <Badge
                                variant={
                                  user.user_type === 'nutritionist'
                                    ? 'default'
                                    : user.user_type === 'patient'
                                    ? 'secondary'
                                    : 'outline'
                                }
                                className="text-xs"
                              >
                                {user.user_type === 'nutritionist'
                                  ? 'Nutricionista'
                                  : user.user_type === 'patient'
                                  ? 'Paciente'
                                  : user.user_type || 'Usuário'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Entrou {formatDaysAgo(user.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Users className="h-12 w-12 mb-2 opacity-50" />
                      <p>Nenhum usuário recente</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* TAB 2: Financeiro */}
          <TabsContent value="finance" className="space-y-6">
            {/* Finance KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* MRR Estimado */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-emerald-500">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      MRR Estimado
                    </CardTitle>
                    <DollarSign className="h-5 w-5 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-8 w-32" />
                    ) : (
                      <div className="text-3xl font-bold text-emerald-600">
                        R$ {estimatedMRR.toLocaleString('pt-BR')}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Receita mensal recorrente
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Ticket Médio */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Ticket Médio
                    </CardTitle>
                    <CreditCard className="h-5 w-5 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-8 w-32" />
                    ) : (
                      <div className="text-3xl font-bold text-blue-600">
                        R$ {averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Por nutricionista/mês
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Churn Rate */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-red-500">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Churn Rate
                    </CardTitle>
                    <TrendingUp className="h-5 w-5 text-red-500 rotate-180" />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-8 w-32" />
                    ) : (
                      <div className="text-3xl font-bold text-red-600">
                        {churnRate}%
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Taxa de cancelamento
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Revenue Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    <CardTitle>Receita por Mês</CardTitle>
                  </div>
                  <CardDescription>
                    Últimos 6 meses de receita estimada
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={revenueData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="month"
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--popover))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                          formatter={(value) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Receita']}
                        />
                        <Bar dataKey="receita" fill="#10b981" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* TAB 3: Sistema & Logs */}
          <TabsContent value="system" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Broadcast Widget */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-5 w-5 text-primary" />
                      <CardTitle>Broadcast</CardTitle>
                    </div>
                    <CardDescription>
                      Envie uma mensagem para todos os usuários da plataforma
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      placeholder="Digite sua mensagem de broadcast aqui..."
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      className="min-h-[120px] font-mono text-sm"
                    />
                    <Button
                      onClick={handleBroadcast}
                      className="w-full"
                      disabled={!broadcastMessage.trim()}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Enviar para Todos
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Live Audit Log */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Terminal className="h-5 w-5 text-primary" />
                      <CardTitle>Live Audit Log</CardTitle>
                    </div>
                    <CardDescription>
                      Eventos do sistema em tempo real
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div 
                      ref={scrollAreaRef}
                      className="bg-slate-950 rounded-lg p-4 h-[400px] overflow-y-auto font-mono text-xs"
                    >
                      {liveLogs.length === 0 ? (
                        <div className="text-muted-foreground text-center py-8">
                          <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p>Aguardando eventos...</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {liveLogs.map((log) => (
                            <div
                              key={log.id}
                              className="flex items-start gap-3 p-2 rounded hover:bg-slate-900/50 transition-colors"
                            >
                              <div className="mt-0.5">
                                {getLogIcon(log.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-slate-400">{formatLogTime(log.timestamp)}</span>
                                  <Badge variant={getLogBadgeVariant(log.type)} className="text-xs">
                                    {log.type.toUpperCase()}
                                  </Badge>
                                </div>
                                <p className="text-slate-300">{log.message}</p>
                                <p className="text-slate-500 text-[10px] mt-1">Usuário: {log.user}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Quick Actions (Always visible) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
              <CardDescription>
                Ferramentas de gerenciamento da plataforma
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-auto p-6 flex flex-col items-start justify-start hover:bg-primary/5 hover:border-primary transition-colors"
                  onClick={() => navigate('/nutritionist/foods')}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Utensils className="w-6 h-6 text-primary" />
                    <span className="text-lg font-semibold">Gerenciar Alimentos</span>
                  </div>
                  <p className="text-sm text-muted-foreground text-left">
                    Adicionar e editar medidas caseiras dos alimentos
                  </p>
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  className="h-auto p-6 flex flex-col items-start justify-start hover:bg-primary/5 hover:border-primary transition-colors"
                  onClick={() => {
                    toast({
                      title: 'Em breve',
                      description: 'A funcionalidade de gerenciamento de usuários estará disponível em breve.',
                    });
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Users className="w-6 h-6 text-primary" />
                    <span className="text-lg font-semibold">Gerenciar Usuários</span>
                  </div>
                  <p className="text-sm text-muted-foreground text-left">
                    Visualizar e gerenciar contas de usuários
                  </p>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
