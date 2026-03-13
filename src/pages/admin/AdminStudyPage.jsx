import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart2, Users, Activity, Target, BookOpen, FileText,
  Calendar, MessageSquare, Award, TrendingUp, TrendingDown,
  Zap, ExternalLink, RefreshCw, Info, Utensils, Scale,
  ChevronRight, AlertCircle, CheckCircle2, Clock, PieChart
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart as RechartsPie, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { getTCCStudyMetrics } from '@/services/adminService';
import { track, Events } from '@/analytics/posthog';

// ── constants ──────────────────────────────────────────────────────────────
const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9'];

const GOAL_TYPE_LABELS = {
  weight_loss: 'Perda de Peso',
  weight_gain: 'Ganho de Peso',
  weight_maintenance: 'Manutenção',
  body_composition: 'Composição Corporal',
  custom: 'Personalizada',
};

const MODULE_LABELS = {
  feed: 'Feed/Alertas',
  meal_plan: 'Plano Alimentar',
  food_diary: 'Diário Alimentar',
  agenda: 'Agenda',
  system: 'Sistema',
};

const APPT_LABELS = {
  first_appointment: 'Primeira Consulta',
  return: 'Retorno',
  evaluation: 'Avaliação',
  online: 'Online',
  in_person: 'Presencial',
};

// ── helpers ────────────────────────────────────────────────────────────────
const pct = (val) => `${val ?? 0}%`;
const num = (val) => (val ?? 0).toLocaleString('pt-BR');
const round1 = (val) => (val ?? 0).toFixed(1);

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary', trend, loading }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className={`p-2 rounded-lg bg-muted/50 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              {trend !== undefined && (
                <Badge variant="outline" className={trend >= 0 ? 'text-emerald-600 border-emerald-200' : 'text-red-500 border-red-200'}>
                  {trend >= 0 ? <TrendingUp className="w-3 h-3 mr-1 inline" /> : <TrendingDown className="w-3 h-3 mr-1 inline" />}
                  {Math.abs(trend)}%
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SectionTitle({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

// ── Activity Bar Chart ─────────────────────────────────────────────────────
function ActivityChart({ data, loading }) {
  if (loading) return <Skeleton className="h-48 w-full" />;
  if (!data?.length) return <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>;

  const chartData = data.map(d => ({
    name: d.day_name || format(new Date(d.day_date), 'EEE', { locale: ptBR }),
    eventos: d.platform_events || 0,
    refeicoes: d.meal_logs || 0,
    medidas: d.growth_records || 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} barSize={14}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="eventos" name="Eventos Platform." fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
        <Bar dataKey="refeicoes" name="Refeições Registradas" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} />
        <Bar dataKey="medidas" name="Med. Antropométricas" fill={CHART_COLORS[2]} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Pie Chart helper ───────────────────────────────────────────────────────
function DistributionPie({ data, labelMap, loading }) {
  if (loading) return <Skeleton className="h-48 w-full" />;
  if (!data) return <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>;

  const entries = Object.entries(data).filter(([, v]) => v > 0).map(([k, v], i) => ({
    name: labelMap?.[k] || k,
    value: Number(v),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  if (!entries.length) return <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro</p>;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RechartsPie>
        <Pie data={entries} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
          {entries.map((e, i) => <Cell key={i} fill={e.color} />)}
        </Pie>
        <Tooltip formatter={(v) => [num(v), '']} />
      </RechartsPie>
    </ResponsiveContainer>
  );
}

// ── Progress Row ───────────────────────────────────────────────────────────
function MetricRow({ label, value, max = 100, unit = '', color = 'bg-primary' }) {
  const pctVal = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="space-y-1.5 mb-3">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{num(value)} {unit}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={`h-full ${color} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${pctVal}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// ── BMI Badge ──────────────────────────────────────────────────────────────
function BMIBlock({ dist, loading }) {
  if (loading) return <Skeleton className="h-24 w-full" />;
  if (!dist) return null;

  const total = Object.values(dist).reduce((a, b) => a + Number(b), 0);
  const items = [
    { key: 'underweight', label: 'Abaixo do Peso', color: 'bg-blue-400' },
    { key: 'normal',      label: 'Peso Normal',    color: 'bg-emerald-500' },
    { key: 'overweight',  label: 'Sobrepeso',      color: 'bg-amber-400' },
    { key: 'obese',       label: 'Obesidade',      color: 'bg-red-500' },
  ];

  return (
    <div className="space-y-2">
      {items.map(({ key, label, color }) => {
        const val = Number(dist[key] || 0);
        return (
          <MetricRow
            key={key}
            label={label}
            value={val}
            max={total || 1}
            unit="pacientes"
            color={color}
          />
        );
      })}
      <p className="text-xs text-muted-foreground text-right">Total: {num(total)} com dados</p>
    </div>
  );
}

// ── Module Usage bars ──────────────────────────────────────────────────────
function ModuleUsageBlock({ usage, errors, loading }) {
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!usage) return <p className="text-xs text-muted-foreground">Sem dados de módulos</p>;

  const entries = Object.entries(usage).sort(([, a], [, b]) => Number(b) - Number(a));
  const maxVal = entries.length ? Number(entries[0][1]) : 1;

  return (
    <div className="space-y-2">
      {entries.map(([mod, cnt], i) => (
        <div key={mod} className="flex items-center gap-3 text-xs">
          <span className="w-32 text-muted-foreground truncate">{MODULE_LABELS[mod] || mod}</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
              initial={{ width: 0 }}
              animate={{ width: `${(Number(cnt) / maxVal) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.05 }}
            />
          </div>
          <span className="w-12 text-right font-medium">{num(cnt)}</span>
          {errors?.[mod] !== undefined && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {round1(errors[mod])}% err
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

// ── PostHog panel ──────────────────────────────────────────────────────────
function PostHogPanel() {
  const hasKey = !!import.meta.env.VITE_PUBLIC_POSTHOG_KEY;

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-5 ${hasKey ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${hasKey ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {hasKey ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          </div>
          <div>
            <p className="font-semibold text-sm">
              {hasKey ? 'PostHog Ativo — Trackando eventos' : 'PostHog não configurado'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {hasKey
                ? 'Eventos de comportamento estão sendo capturados. Acesse o dashboard para análises detalhadas.'
                : 'Adicione VITE_PUBLIC_POSTHOG_KEY ao arquivo .env para ativar o tracking comportamental (gratuito até 1M eventos/mês).'}
            </p>
          </div>
        </div>
      </div>

      {/* Setup instructions */}
      {!hasKey && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Como configurar o PostHog (gratuito)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="space-y-3 text-sm">
              {[
                { n: 1, text: 'Acesse posthog.com e crie uma conta gratuita', link: 'https://posthog.com' },
                { n: 2, text: 'Crie um novo projeto chamado "HipoZero"' },
                { n: 3, text: 'Copie a Project API Key (começa com phc_...)' },
                { n: 4, text: 'Adicione ao arquivo .env na raiz do projeto:' },
              ].map(({ n, text, link }) => (
                <li key={n} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">{n}</span>
                  <span className="text-muted-foreground pt-0.5">
                    {text}
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary inline-flex items-center gap-1 hover:underline">
                        Abrir <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            <div className="bg-muted rounded-md p-3 font-mono text-xs border border-border">
              <span className="text-muted-foreground"># .env</span><br />
              <span className="text-green-600">VITE_PUBLIC_POSTHOG_KEY</span>=phc_sua_chave_aqui<br />
              <span className="text-green-600">VITE_PUBLIC_POSTHOG_HOST</span>=https://us.i.posthog.com
            </div>
          </CardContent>
        </Card>
      )}

      {/* Events being tracked */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Eventos configurados para captura
          </CardTitle>
          <CardDescription>Estes eventos são enviados automaticamente ao PostHog quando os usuários interagem com a plataforma</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { event: 'meal_logged', desc: 'Refeição registrada no diário', category: 'Nutrição' },
              { event: 'anamnesis_completed', desc: 'Formulário de anamnese concluído', category: 'Clínico' },
              { event: 'goal_created', desc: 'Meta nutricional criada', category: 'Metas' },
              { event: 'goal_completed', desc: 'Meta atingida pelo paciente', category: 'Metas' },
              { event: 'appointment_scheduled', desc: 'Consulta agendada', category: 'Agenda' },
              { event: 'appointment_completed', desc: 'Consulta realizada', category: 'Agenda' },
              { event: 'meal_plan_created', desc: 'Plano alimentar criado', category: 'Nutrição' },
              { event: 'growth_record_added', desc: 'Medida antropométrica registrada', category: 'Clínico' },
              { event: 'chat_message_sent', desc: 'Mensagem enviada no chat', category: 'Comunicação' },
              { event: 'achievement_earned', desc: 'Conquista desbloqueada', category: 'Gamificação' },
              { event: 'energy_calc_performed', desc: 'Cálculo de TMB/GET realizado', category: 'Clínico' },
              { event: 'study_area_viewed', desc: 'Área de Estudo acessada', category: 'Admin' },
            ].map(({ event, desc, category }) => (
              <div key={event} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 border border-border/50">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <div className="min-w-0">
                  <code className="text-[10px] font-mono text-primary block">{event}</code>
                  <p className="text-xs text-muted-foreground truncate">{desc}</p>
                </div>
                <Badge variant="outline" className="text-[10px] px-1.5 ml-auto flex-shrink-0">{category}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* PostHog features for TCC */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Análises disponíveis no PostHog (TCC)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: '🎯', title: 'Funis de Conversão', desc: 'Cadastro → 1ª refeição → meta criada → meta atingida' },
              { icon: '📈', title: 'Retenção por Coorte', desc: '% de usuários ativos após 7, 14, 30 dias do cadastro' },
              { icon: '⏱️', title: 'Sessão Média', desc: 'Quanto tempo nutris e pacientes ficam por sessão' },
              { icon: '🗺️', title: 'Fluxo de Usuário', desc: 'Caminho percorrido antes de registrar a 1ª refeição' },
              { icon: '🔥', title: 'Features Mais Usadas', desc: 'Ranking das páginas e funcionalidades por clique' },
              { icon: '📹', title: 'Gravações de Sessão', desc: '5.000 gravações/mês gratuitas para análise de UX' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
                <span className="text-xl">{icon}</span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          {hasKey && (
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                onClick={() => window.open('https://us.posthog.com', '_blank')}
                className="gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Abrir Dashboard PostHog
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════════════
export default function AdminStudyPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await getTCCStudyMetrics();
      if (rpcError) throw rpcError;
      setMetrics(data);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message || 'Erro ao carregar métricas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    track(Events.STUDY_AREA_VIEWED);
  }, [load]);

  const m = metrics || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-lg bg-violet-100 text-violet-700">
              <BookOpen className="w-5 h-5" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Área de Estudo</h1>
          </div>
          <p className="text-muted-foreground text-sm ml-11">
            Métricas de pesquisa acadêmica para TCC em Nutrição — dados reais de uso da plataforma
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {lastRefresh && (
            <p className="text-xs text-muted-foreground">
              Atualizado: {format(lastRefresh, 'HH:mm', { locale: ptBR })}
            </p>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading} className="gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </motion.div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-4 w-full sm:w-auto">
          <TabsTrigger value="overview" className="gap-1.5"><BarChart2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Visão Geral</span></TabsTrigger>
          <TabsTrigger value="clinical" className="gap-1.5"><Target className="w-3.5 h-3.5" /><span className="hidden sm:inline">Clínico</span></TabsTrigger>
          <TabsTrigger value="platform" className="gap-1.5"><Activity className="w-3.5 h-3.5" /><span className="hidden sm:inline">Plataforma</span></TabsTrigger>
          <TabsTrigger value="posthog" className="gap-1.5"><Zap className="w-3.5 h-3.5" /><span className="hidden sm:inline">PostHog</span></TabsTrigger>
        </TabsList>

        {/* ── TAB: VISÃO GERAL ─────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard loading={isLoading} icon={Users} label="Nutricionistas" color="text-indigo-600" value={num(m.platform?.total_nutritionists)} sub={`${num(m.platform?.active_nutritionists_30d)} ativos (30d)`} />
            <StatCard loading={isLoading} icon={Users} label="Pacientes" color="text-emerald-600" value={num(m.platform?.total_patients)} sub={`${num(m.platform?.active_patients_30d)} com registro (30d)`} />
            <StatCard loading={isLoading} icon={TrendingUp} label="Novos (7d)" color="text-violet-600" value={num(m.platform?.new_users_7d)} sub={`${num(m.platform?.new_users_30d)} nos últimos 30d`} />
            <StatCard loading={isLoading} icon={Target} label="Metas Ativas" color="text-amber-600" value={num(m.goals?.active)} sub={`${round1(m.goals?.avg_progress_pct)}% progresso médio`} />
            <StatCard loading={isLoading} icon={Utensils} label="Refeições (30d)" color="text-orange-500" value={num(m.nutrition_diary?.meals_last_30d)} sub={`${num(m.nutrition_diary?.active_diarists_30d)} pacientes ativos`} />
            <StatCard loading={isLoading} icon={Calendar} label="Consultas" color="text-sky-600" value={num(m.appointments?.total)} sub={`${round1(m.appointments?.attendance_rate_pct)}% comparecimento`} />
          </div>

          {/* Weekly Activity Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Atividade dos Últimos 7 Dias
              </CardTitle>
              <CardDescription>Eventos na plataforma, refeições registradas e medidas antropométricas por dia</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityChart data={m.activity_by_day} loading={isLoading} />
            </CardContent>
          </Card>

          {/* Quick metrics row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Aderência Alimentar Média</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-16 w-full" /> : (
                  <div className="space-y-2">
                    <p className="text-3xl font-bold text-foreground">{round1(m.nutrition_diary?.avg_adherence_score)}<span className="text-lg text-muted-foreground">%</span></p>
                    <Progress value={m.nutrition_diary?.avg_adherence_score || 0} className="h-2" />
                    <p className="text-xs text-muted-foreground">Quanto o consumo real corresponde ao plano prescrito</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Notificações</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-16 w-full" /> : (
                  <div className="space-y-2">
                    <p className="text-3xl font-bold text-foreground">{round1(m.notifications?.read_rate_pct)}<span className="text-lg text-muted-foreground">%</span></p>
                    <Progress value={m.notifications?.read_rate_pct || 0} className="h-2" />
                    <p className="text-xs text-muted-foreground">{num(m.notifications?.read)} de {num(m.notifications?.total)} lidas</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Score de Viabilidade das Metas</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-16 w-full" /> : (
                  <div className="space-y-2">
                    <p className="text-3xl font-bold text-foreground">{round1(m.goals?.avg_viability_score)}<span className="text-lg text-muted-foreground">/5</span></p>
                    <Progress value={(m.goals?.avg_viability_score || 0) * 20} className="h-2" />
                    <p className="text-xs text-muted-foreground">Escala 1 (ruim) a 5 (ótimo) — avaliado pelo nutricionista</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── TAB: CLÍNICO ─────────────────────────────────────────────── */}
        <TabsContent value="clinical" className="mt-6 space-y-6">

          {/* Goals */}
          <Card>
            <CardHeader>
              <SectionTitle icon={Target} title="Metas Nutricionais" description="Distribuição de objetivos e taxa de progresso dos pacientes" />
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Total', val: m.goals?.total, color: 'from-indigo-500 to-indigo-600' },
                    { label: 'Ativas', val: m.goals?.active, color: 'from-emerald-500 to-emerald-600' },
                    { label: 'Concluídas', val: m.goals?.completed, color: 'from-amber-500 to-amber-600' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className={`rounded-lg bg-gradient-to-br ${color} p-3 text-white`}>
                      <p className="text-2xl font-bold">{isLoading ? '—' : num(val)}</p>
                      <p className="text-xs opacity-80">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between items-center p-2 bg-muted/30 rounded-lg">
                    <span className="text-muted-foreground text-xs">Progresso médio</span>
                    <span className="font-medium">{isLoading ? '—' : pct(m.goals?.avg_progress_pct)}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted/30 rounded-lg">
                    <span className="text-muted-foreground text-xs">Viabilidade média</span>
                    <span className="font-medium">{isLoading ? '—' : `${round1(m.goals?.avg_viability_score)}/5`}</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-3">Distribuição por tipo de objetivo</p>
                <DistributionPie data={m.goals?.type_distribution} labelMap={GOAL_TYPE_LABELS} loading={isLoading} />
              </div>
            </CardContent>
          </Card>

          {/* Anamnesis + Anthropometry */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <SectionTitle icon={FileText} title="Anamnese" description="Completude dos formulários clínicos" />
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? <Skeleton className="h-32 w-full" /> : (
                  <>
                    <div className="flex items-center justify-center">
                      <div className="relative w-28 h-28">
                        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                          <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                          <circle
                            cx="50" cy="50" r="40" fill="none"
                            stroke="#6366f1" strokeWidth="10"
                            strokeDasharray={`${(m.anamnesis?.completion_rate_pct || 0) * 2.513} 251.3`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold">{m.anamnesis?.completion_rate_pct ?? 0}%</span>
                          <span className="text-[10px] text-muted-foreground">completas</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-muted/30 p-2 rounded-lg">
                        <p className="text-lg font-bold">{num(m.anamnesis?.total_records)}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div className="bg-muted/30 p-2 rounded-lg">
                        <p className="text-lg font-bold">{num(m.anamnesis?.completed)}</p>
                        <p className="text-xs text-muted-foreground">Concluídas</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <SectionTitle icon={Scale} title="Antropometria" description="Registros de peso, altura, medidas e bioimpedância" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Registros totais', val: m.anthropometry?.total_records },
                    { label: 'Pacientes c/ dados', val: m.anthropometry?.patients_with_records },
                    { label: 'Mês atual', val: m.anthropometry?.records_last_30d },
                    { label: 'Média/paciente', val: round1(m.anthropometry?.avg_records_per_patient) },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-muted/30 p-2 rounded-lg text-center">
                      <p className="text-lg font-bold">{isLoading ? '—' : val}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Distribuição de IMC (últimos registros)</p>
                  <BMIBlock dist={m.anthropometry?.bmi_distribution} loading={isLoading} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Nutrition Diary + Appointments */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <SectionTitle icon={Utensils} title="Diário Alimentar" description="Frequência e aderência aos registros de refeição" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-40 w-full" /> : (
                  <div className="space-y-3">
                    {[
                      { label: 'Total de refeições registradas', val: m.nutrition_diary?.total_meals, max: m.nutrition_diary?.total_meals },
                      { label: 'Últimos 7 dias', val: m.nutrition_diary?.meals_last_7d, max: m.nutrition_diary?.meals_last_30d || 1, color: 'bg-emerald-500' },
                      { label: 'Últimos 30 dias', val: m.nutrition_diary?.meals_last_30d, max: m.nutrition_diary?.total_meals || 1 },
                      { label: 'Pacientes ativos (30d)', val: m.nutrition_diary?.active_diarists_30d, max: m.platform?.total_patients || 1, color: 'bg-violet-500' },
                    ].map(({ label, val, max, color }) => (
                      <MetricRow key={label} label={label} value={val} max={max || 1} color={color} />
                    ))}
                    <div className="flex justify-between items-center p-3 bg-primary/5 rounded-lg border border-primary/10 mt-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Aderência média ao plano</p>
                        <p className="text-2xl font-bold text-primary">{round1(m.nutrition_diary?.avg_adherence_score)}<span className="text-sm">%</span></p>
                      </div>
                      <Info className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <SectionTitle icon={Calendar} title="Consultas" description="Taxa de comparecimento e tipos de atendimento" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-40 w-full" /> : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Total', val: m.appointments?.total, color: 'text-foreground' },
                        { label: 'Realizadas', val: m.appointments?.completed, color: 'text-emerald-600' },
                        { label: 'Canceladas', val: m.appointments?.cancelled, color: 'text-red-500' },
                        { label: 'Faltas (no-show)', val: m.appointments?.no_show, color: 'text-amber-600' },
                      ].map(({ label, val, color }) => (
                        <div key={label} className="bg-muted/30 rounded-lg p-2 text-center">
                          <p className={`text-xl font-bold ${color}`}>{num(val)}</p>
                          <p className="text-xs text-muted-foreground">{label}</p>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Taxa de comparecimento</p>
                      <div className="flex items-center gap-3">
                        <Progress value={m.appointments?.attendance_rate_pct || 0} className="flex-1 h-3" />
                        <span className="text-sm font-bold w-12 text-right">{m.appointments?.attendance_rate_pct ?? 0}%</span>
                      </div>
                    </div>
                    {m.appointments?.type_distribution && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Por tipo</p>
                        <DistributionPie data={m.appointments.type_distribution} labelMap={APPT_LABELS} loading={false} />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* TMB Protocols */}
          <Card>
            <CardHeader>
              <SectionTitle icon={Zap} title="Protocolos de Cálculo Energético (TMB/GET)" description="Quais métodos científicos os nutricionistas mais utilizam" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-32 w-full" /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-3xl font-bold mb-1">{num(m.energy_calcs?.total)}</p>
                    <p className="text-sm text-muted-foreground mb-4">cálculos realizados na plataforma</p>
                    {m.energy_calcs?.protocol_distribution && Object.entries(m.energy_calcs.protocol_distribution).map(([proto, cnt], i) => (
                      <MetricRow
                        key={proto}
                        label={proto.toUpperCase().replace('-', '–')}
                        value={Number(cnt)}
                        max={Math.max(...Object.values(m.energy_calcs.protocol_distribution).map(Number)) || 1}
                        color={`bg-[${CHART_COLORS[i % CHART_COLORS.length]}]`}
                      />
                    ))}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Distribuição de protocolos</p>
                    <DistributionPie data={m.energy_calcs?.protocol_distribution} loading={false} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: PLATAFORMA ───────────────────────────────────────────── */}
        <TabsContent value="platform" className="mt-6 space-y-6">
          {/* Module Usage */}
          <Card>
            <CardHeader>
              <SectionTitle icon={BarChart2} title="Módulos Mais Usados (últimos 30 dias)" description="Operações registradas por módulo no sistema de observabilidade" />
            </CardHeader>
            <CardContent>
              <ModuleUsageBlock usage={m.modules?.usage_30d} errors={m.modules?.error_rates_pct_30d} loading={isLoading} />
              {!isLoading && m.modules?.avg_latency_ms != null && (
                <div className="mt-4 p-3 bg-muted/30 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Latência média</span>
                  </div>
                  <span className="font-semibold">{num(m.modules.avg_latency_ms)} ms</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chat + Gamification + Meal Plans row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <SectionTitle icon={MessageSquare} title="Chat" description="Comunicação profissional-paciente" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Total de mensagens', val: m.chat?.total_messages },
                  { label: 'Mensagens (30d)', val: m.chat?.messages_last_30d },
                  { label: 'Pares ativos (30d)', val: m.chat?.active_chat_pairs_30d },
                ].map(({ label, val }) => (
                  <div key={label} className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground text-xs">{label}</span>
                    <span className="font-semibold">{isLoading ? '—' : num(val)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <SectionTitle icon={Award} title="Gamificação" description="Conquistas desbloqueadas pelos usuários" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Conquistas desbloqueadas', val: m.gamification?.total_achievements_earned },
                  { label: 'Usuários com conquistas', val: m.gamification?.patients_with_achievements },
                ].map(({ label, val }) => (
                  <div key={label} className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground text-xs">{label}</span>
                    <span className="font-semibold">{isLoading ? '—' : num(val)}</span>
                  </div>
                ))}
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-1">Adoção de gamificação</p>
                  <Progress
                    value={(!isLoading && m.platform?.total_patients > 0)
                      ? (m.gamification?.patients_with_achievements / m.platform.total_patients * 100)
                      : 0}
                    className="h-2"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <SectionTitle icon={FileText} title="Planos Alimentares" description="Prescrições criadas pelos nutricionistas" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Planos criados', val: m.meal_plans?.total },
                  { label: 'Pacientes com plano', val: m.meal_plans?.patients_with_plan },
                ].map(({ label, val }) => (
                  <div key={label} className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground text-xs">{label}</span>
                    <span className="font-semibold">{isLoading ? '—' : num(val)}</span>
                  </div>
                ))}
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-1">Cobertura de prescrição</p>
                  <Progress
                    value={(!isLoading && m.platform?.total_patients > 0)
                      ? (m.meal_plans?.patients_with_plan / m.platform.total_patients * 100)
                      : 0}
                    className="h-2"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Research note */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-violet-50 border border-violet-200">
            <div className="p-2 rounded-lg bg-violet-100 text-violet-700 flex-shrink-0">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-violet-900">Nota Metodológica para o TCC</p>
              <p className="text-xs text-violet-700 mt-1 leading-relaxed">
                Todos os dados desta área são agregados e anonimizados — nenhuma informação individualizável é exibida.
                As métricas refletem o comportamento coletivo dos usuários e são atualizadas em tempo real a partir do banco de dados da plataforma.
                Para análises individualizadas (com consentimento dos participantes), utilize a seção Usuários.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB: POSTHOG ──────────────────────────────────────────────── */}
        <TabsContent value="posthog" className="mt-6">
          <PostHogPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
