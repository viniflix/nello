import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Users, Utensils, Activity, TrendingUp, TrendingDown,
  DollarSign, Calendar, ShieldAlert, Zap, Target,
  BarChart3, Clock, AlertCircle, CheckCircle2, 
  ArrowRight, Eye, MousePointer, Award, MessageSquare,
  Bell, Settings, FileText, TrendingUpDown, Bug
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart as RechartsPie, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getDashboardStats, getSystemLiveLogs } from '@/services/adminService';
import { getOperationalHealthSummary } from '@/lib/supabase/observability-queries';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9'];

function StatCard({ icon: Icon, label, value, trend, color, sub, loading }) {
  const isPositive = trend >= 0;
  return (
    <Card className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className={`p-3 rounded-xl ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          {trend !== undefined && (
            <Badge variant={isPositive ? 'default' : 'destructive'} className="gap-1">
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(trend)}%
            </Badge>
          )}
        </div>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="h-9 w-20 mt-1" />
          ) : (
            <p className="text-3xl font-bold mt-1">{value}</p>
          )}
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniChart({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} fill={`url(#gradient-${color})`} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function HealthIndicator({ rate }) {
  const getStatus = () => {
    if (rate < 1) return { label: 'Excelente', color: 'text-green-600', bg: 'bg-green-100' };
    if (rate < 5) return { label: 'Bom', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { label: 'Crítico', color: 'text-red-600', bg: 'bg-red-100' };
  };
  const status = getStatus();
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${status.bg}`}>
      {rate < 5 ? <CheckCircle2 className={`w-4 h-4 ${status.color}`} /> : <AlertCircle className={`w-4 h-4 ${status.color}`} />}
      <span className={`text-sm font-medium ${status.color}`}>{status.label}</span>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [observability, setObservability] = useState({ error_rate: 0, total_events: 0, error_events: 0, avg_latency_ms: 0 });

  const isAdmin = user?.profile?.is_admin === true;

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statsRes, obsRes] = await Promise.all([
        getDashboardStats(),
        getOperationalHealthSummary({ nutritionistId: null, windowHours: 24 })
      ]);
      
      if (statsRes.data) setStats(statsRes.data);
      if (obsRes.data) setObservability({
        error_rate: Number(obsRes.data?.error_rate || 0),
        total_events: Number(obsRes.data?.total_events || 0),
        error_events: Number(obsRes.data?.error_events || 0),
        avg_latency_ms: Number(obsRes.data?.avg_latency_ms || 0)
      });
    } catch (err) {
      console.error('[Dashboard] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && !isAdmin) {
      toast({ title: 'Acesso Negado', description: 'Página restrita a administradores.', variant: 'destructive' });
      navigate('/nutritionist', { replace: true });
      return;
    }
    if (isAdmin) loadData();
  }, [user, isAdmin, navigate, toast, loadData]);

  if (!user || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md"><CardContent className="pt-6 text-center">
          <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Acesso Negado</h2>
          <p className="text-sm text-muted-foreground mt-2">Página restrita a administradores.</p>
          <Button onClick={() => navigate('/nutritionist')} className="mt-4">Voltar</Button>
        </CardContent></Card>
      </div>
    );
  }

  const kpis = stats?.kpis || {};
  const growthData = stats?.growthData || [];
  const chartData = growthData.slice(-7).map((d, i) => ({
    name: format(subMonths(new Date(), 6 - i), 'MMM', { locale: ptBR }).slice(0, 3),
    value: d.users || d.count || 0
  }));

  // Quick links
  const quickLinks = [
    { label: 'Comportamento', desc: 'Análises de uso', icon: Activity, path: '/admin/study', color: 'bg-violet-100 text-violet-600' },
    { label: 'Performance', desc: 'Bugs e logs', icon: Bug, path: '/admin/bugs', color: 'bg-orange-100 text-orange-600' },
    { label: 'Usuários', desc: 'Gestão de acesso', icon: Users, path: '/admin/users', color: 'bg-blue-100 text-blue-600' },
    { label: 'Financeiro', desc: 'Receita e métricas', icon: DollarSign, path: '/admin/financial', color: 'bg-emerald-100 text-emerald-600' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-8">
        
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-600 text-white">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">ERP Dashboard</h1>
                <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <HealthIndicator rate={observability.error_rate} />
            <Badge variant="outline" className="gap-1">
              <ShieldAlert className="w-3 h-3" /> Admin
            </Badge>
          </div>
        </motion.div>

        {/* KPI Grid - Row 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard loading={isLoading} icon={Users} label="Nutricionistas" value={kpis.totalNutritionists || 0} color="bg-blue-100 text-blue-600" sub="ativos na plataforma" trend={12} />
          <StatCard loading={isLoading} icon={Users} label="Pacientes" value={kpis.totalPatients || 0} color="bg-emerald-100 text-emerald-600" sub="cadastrados" trend={8} />
          <StatCard loading={isLoading} icon={Utensils} label="Refeições" value={(kpis.totalMeals || 0).toLocaleString('pt-BR')} color="bg-orange-100 text-orange-600" sub="registros totais" trend={15} />
          <StatCard loading={isLoading} icon={Activity} label="Taxa Atividade" value={`${kpis.activePatients || 0}%`} color="bg-purple-100 text-purple-600" sub="usuários ativos" trend={-3} />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Chart - 2/3 width */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Crescimento da Plataforma
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Evolução de usuários nos últimos meses</p>
              </div>
              <Badge variant="outline" className="gap-1">
                <Clock className="w-3 h-3" /> Atualizado agora
              </Badge>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="value" stroke="#6366f1" fill="url(#colorGrowth)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  <p>Sem dados disponíveis</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Side Panel - 1/3 width */}
          <div className="space-y-6">
            
            {/* System Health */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="w-5 h-5 text-amber-500" />
                  Saúde do Sistema
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Taxa de Erro</span>
                  <span className="font-semibold">{observability.error_rate.toFixed(2)}%</span>
                </div>
                <Progress value={Math.min(100, observability.error_rate * 10)} className="h-2" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Eventos (24h)</span>
                  <span className="font-semibold">{observability.total_events.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Erros (24h)</span>
                  <span className="font-semibold text-red-600">{observability.error_events}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Latência Média</span>
                  <span className="font-semibold">{observability.avg_latency_ms.toFixed(0)}ms</span>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="w-5 h-5 text-emerald-500" />
                  Metas & Ações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { icon: Award, label: 'Metas Ativas', value: '47', color: 'text-emerald-600' },
                  { icon: Calendar, label: 'Consultas Hoje', value: '12', color: 'text-blue-600' },
                  { icon: MessageSquare, label: 'Mensagens', value: '234', color: 'text-purple-600' },
                  { icon: CheckCircle2, label: 'Conquistas', value: '89', color: 'text-amber-600' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <item.icon className={`w-5 h-5 ${item.color}`} />
                      <span className="text-sm">{item.label}</span>
                    </div>
                    <span className={`font-semibold ${item.color}`}>{item.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Access Grid */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MousePointer className="w-5 h-5 text-primary" />
            Acesso Rápido
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickLinks.map((link, i) => (
              <motion.div
                key={link.path}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card 
                  className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all duration-300 hover:-translate-y-1 group"
                  onClick={() => navigate(link.path)}
                >
                  <CardContent className="p-5">
                    <div className={`w-10 h-10 rounded-xl ${link.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                      <link.icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold">{link.label}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{link.desc}</p>
                    <div className="flex items-center gap-1 mt-3 text-primary text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                      Acessar <ArrowRight className="w-3 h-3" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Financial Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-500" />
                Visão Geral Financeira
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                <div className="text-center p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                  <p className="text-xs text-emerald-600 mb-1">MRR</p>
                  <p className="text-2xl font-bold text-emerald-700">R$ {(kpis.estimated_mrr || 0).toLocaleString('pt-BR')}</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-600 mb-1">Ticket Médio</p>
                  <p className="text-2xl font-bold text-blue-700">R$ {kpis.totalNutritionists > 0 ? ((kpis.estimated_mrr || 0) / kpis.totalNutritionists).toFixed(2) : '0,00'}</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-amber-50 border border-amber-100">
                  <p className="text-xs text-amber-600 mb-1">Proj. Anual</p>
                  <p className="text-2xl font-bold text-amber-700">R$ {((kpis.estimated_mrr || 0) * 12).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="w-5 h-5 text-violet-500" />
                Status em Tempo Real
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Sistema', status: 'online', color: 'bg-green-500' },
                { label: 'Database', status: 'online', color: 'bg-green-500' },
                { label: 'API', status: 'online', color: 'bg-green-500' },
                { label: 'Auth', status: 'online', color: 'bg-green-500' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span className="text-sm">{item.label}</span>
                  </div>
                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                    {item.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
