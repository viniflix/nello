import { useState } from 'react';
import { motion } from 'framer-motion';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DollarSign, TrendingUp, CreditCard, Users, ArrowUpRight,
  ArrowDownRight, BarChart2, PieChart as PieIcon, Calendar,
  AlertCircle, CheckCircle2, Clock
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';

// ─── Simulated SaaS Financial Data ───────────────────────────────────────────

const PLANS = [
  { name: 'Starter', price: 79, color: '#6366f1', subscribers: 8 },
  { name: 'Pro', price: 149, color: '#10b981', subscribers: 15 },
  { name: 'Clínica', price: 299, color: '#f59e0b', subscribers: 4 },
];

const TOTAL_SUBSCRIBERS = PLANS.reduce((a, p) => a + p.subscribers, 0);
const MRR = PLANS.reduce((a, p) => a + p.price * p.subscribers, 0);
const ARR = MRR * 12;
const AVG_TICKET = MRR / TOTAL_SUBSCRIBERS;
const CHURN_RATE = 2.1;
const LTV = AVG_TICKET / (CHURN_RATE / 100);

// Últimos 8 meses de receita simulada com crescimento gradual
const revenueHistory = Array.from({ length: 8 }, (_, i) => {
  const date = subMonths(new Date(), 7 - i);
  const base = MRR * 0.55;
  const growth = Math.pow(1.08, i);
  return {
    month: format(date, 'MMM/yy', { locale: ptBR }),
    mrr: Math.round(base * growth),
    novos: Math.round(2 + i * 0.8 + Math.random() * 1.5),
    cancelamentos: Math.round(Math.max(0, i * 0.3 + Math.random())),
  };
});

// Transações simuladas (últimas 10)
const SIMULATED_TRANSACTIONS = [
  { id: 1, name: 'Ana Clara Ferreira', plan: 'Pro', amount: 149, status: 'paid', date: '2026-03-12' },
  { id: 2, name: 'Marcos Oliveira', plan: 'Clínica', amount: 299, status: 'paid', date: '2026-03-11' },
  { id: 3, name: 'Jéssica Lima', plan: 'Starter', amount: 79, status: 'paid', date: '2026-03-11' },
  { id: 4, name: 'Rafael Santos', plan: 'Pro', amount: 149, status: 'failed', date: '2026-03-10' },
  { id: 5, name: 'Carla Mendes', plan: 'Pro', amount: 149, status: 'paid', date: '2026-03-09' },
  { id: 6, name: 'Bruno Costa', plan: 'Starter', amount: 79, status: 'pending', date: '2026-03-09' },
  { id: 7, name: 'Luciana Teixeira', plan: 'Clínica', amount: 299, status: 'paid', date: '2026-03-08' },
  { id: 8, name: 'Felipe Rocha', plan: 'Pro', amount: 149, status: 'paid', date: '2026-03-07' },
  { id: 9, name: 'Adriana Souza', plan: 'Starter', amount: 79, status: 'refunded', date: '2026-03-06' },
  { id: 10, name: 'Gustavo Alves', plan: 'Pro', amount: 149, status: 'paid', date: '2026-03-05' },
];

const KPI_CARD_DATA = [
  {
    title: 'MRR',
    value: `R$ ${MRR.toLocaleString('pt-BR')}`,
    sub: 'Receita mensal recorrente',
    icon: DollarSign,
    color: 'emerald',
    trend: '+8% vs mês anterior',
    trending: 'up',
  },
  {
    title: 'ARR',
    value: `R$ ${(ARR / 1000).toFixed(0)}k`,
    sub: 'Receita anual recorrente',
    icon: TrendingUp,
    color: 'blue',
    trend: 'Projeção anual',
    trending: 'up',
  },
  {
    title: 'Ticket Médio',
    value: `R$ ${AVG_TICKET.toFixed(0)}`,
    sub: 'Por assinante/mês',
    icon: CreditCard,
    color: 'orange',
    trend: 'Estável',
    trending: 'neutral',
  },
  {
    title: 'Assinantes',
    value: TOTAL_SUBSCRIBERS,
    sub: 'Nutricionistas pagantes',
    icon: Users,
    color: 'indigo',
    trend: '+3 este mês',
    trending: 'up',
  },
  {
    title: 'Churn Rate',
    value: `${CHURN_RATE}%`,
    sub: 'Taxa de cancelamento/mês',
    icon: ArrowDownRight,
    color: 'red',
    trend: '-0.4% vs anterior',
    trending: 'down',
  },
  {
    title: 'LTV Estimado',
    value: `R$ ${Math.round(LTV).toLocaleString('pt-BR')}`,
    sub: 'Lifetime value médio',
    icon: BarChart2,
    color: 'purple',
    trend: 'Com churn atual',
    trending: 'neutral',
  },
];

const colorClassMap = {
  emerald: { border: 'border-l-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-100', icon: 'text-emerald-500' },
  blue: { border: 'border-l-blue-500', text: 'text-blue-600', bg: 'bg-blue-100', icon: 'text-blue-500' },
  orange: { border: 'border-l-orange-500', text: 'text-orange-600', bg: 'bg-orange-100', icon: 'text-orange-500' },
  indigo: { border: 'border-l-indigo-500', text: 'text-indigo-600', bg: 'bg-indigo-100', icon: 'text-indigo-500' },
  red: { border: 'border-l-red-500', text: 'text-red-600', bg: 'bg-red-100', icon: 'text-red-500' },
  purple: { border: 'border-l-purple-500', text: 'text-purple-600', bg: 'bg-purple-100', icon: 'text-purple-500' },
};

const statusConfig = {
  paid: { label: 'Pago', className: 'bg-emerald-100 text-emerald-700 border-0', icon: CheckCircle2 },
  failed: { label: 'Falhou', className: 'bg-red-100 text-red-700 border-0', icon: AlertCircle },
  pending: { label: 'Pendente', className: 'bg-amber-100 text-amber-700 border-0', icon: Clock },
  refunded: { label: 'Reembolso', className: 'bg-slate-100 text-slate-700 border-0', icon: ArrowDownRight },
};

export default function AdminFinancialPage() {
  const { user } = useAuth();
  if (!user?.profile?.is_admin) return null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Financeiro SaaS</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>
          <Badge variant="outline" className="text-xs bg-amber-50 border-amber-200 text-amber-700">
            Dados Simulados — Configuração Pendente
          </Badge>
        </div>
      </motion.div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {KPI_CARD_DATA.map((kpi, i) => {
          const c = colorClassMap[kpi.color];
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className={`hover:shadow-lg transition-shadow border-l-4 ${c.border}`}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
                  <div className={`rounded-lg p-1.5 ${c.bg}`}>
                    <Icon className={`h-4 w-4 ${c.icon}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${c.text}`}>{kpi.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
                  <p className={`text-xs mt-1.5 flex items-center gap-1 ${
                    kpi.trending === 'up' ? 'text-emerald-600' :
                    kpi.trending === 'down' ? 'text-red-500' : 'text-muted-foreground'
                  }`}>
                    {kpi.trending === 'up' && <ArrowUpRight className="w-3 h-3" />}
                    {kpi.trending === 'down' && <ArrowDownRight className="w-3 h-3" />}
                    {kpi.trend}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Tabs: Receita / Planos / Transações */}
      <Tabs defaultValue="revenue">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="revenue">Receita</TabsTrigger>
          <TabsTrigger value="plans">Planos</TabsTrigger>
          <TabsTrigger value="transactions">Transações</TabsTrigger>
        </TabsList>

        {/* Revenue Chart */}
        <TabsContent value="revenue" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Evolução do MRR</CardTitle>
              <CardDescription>Últimos 8 meses — receita mensal recorrente</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenueHistory}>
                  <defs>
                    <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    formatter={v => [`R$ ${v.toLocaleString('pt-BR')}`, 'MRR']}
                  />
                  <Area type="monotone" dataKey="mrr" stroke="#10b981" strokeWidth={2} fill="url(#mrrGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Novos vs Cancelamentos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={revenueHistory}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Legend />
                    <Bar dataKey="novos" name="Novos" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cancelamentos" name="Cancelamentos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Indicadores Chave</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Crescimento MRR (8 meses)', value: `+${(((revenueHistory.at(-1).mrr / revenueHistory[0].mrr) - 1) * 100).toFixed(0)}%` },
                  { label: 'Média de novos/mês', value: `${(revenueHistory.reduce((a, r) => a + r.novos, 0) / revenueHistory.length).toFixed(1)}` },
                  { label: 'PayBack Period', value: `${Math.ceil(90 / AVG_TICKET)} meses` },
                  { label: 'Expansion MRR', value: 'R$ 0 (upsell pendente)' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-2 border-b last:border-0">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className="text-sm font-semibold">{item.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Plans */}
        <TabsContent value="plans" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribuição por Plano</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={PLANS} cx="50%" cy="50%" outerRadius={90} dataKey="subscribers" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {PLANS.map((p) => <Cell key={p.name} fill={p.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, name) => [v + ' assinantes', name]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receita por Plano</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                {PLANS.map((plan) => {
                  const planMrr = plan.price * plan.subscribers;
                  const pct = (planMrr / MRR) * 100;
                  return (
                    <div key={plan.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: plan.color }} />
                          <span className="text-sm font-medium">{plan.name}</span>
                          <Badge variant="outline" className="text-xs font-normal">
                            R$ {plan.price}/mês · {plan.subscribers} usuários
                          </Badge>
                        </div>
                        <span className="text-sm font-semibold">R$ {planMrr.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="w-full rounded-full h-1.5 bg-muted">
                        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: plan.color }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{pct.toFixed(1)}% da receita total</p>
                    </div>
                  );
                })}
                <div className="pt-3 border-t flex justify-between">
                  <span className="text-sm text-muted-foreground font-medium">Total MRR</span>
                  <span className="text-sm font-bold">R$ {MRR.toLocaleString('pt-BR')}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Transactions */}
        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Transações Recentes</CardTitle>
              <CardDescription>Últimos pagamentos processados (simulado)</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {SIMULATED_TRANSACTIONS.map((tx) => {
                  const s = statusConfig[tx.status];
                  const StatusIcon = s.icon;
                  return (
                    <div key={tx.id} className="flex items-center gap-4 px-6 py-3 hover:bg-muted/30 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-foreground">{tx.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tx.name}</p>
                        <p className="text-xs text-muted-foreground">Plano {tx.plan} · {tx.date}</p>
                      </div>
                      <Badge className={`text-xs shrink-0 flex items-center gap-1 ${s.className}`}>
                        <StatusIcon className="w-3 h-3" />
                        {s.label}
                      </Badge>
                      <p className={`text-sm font-semibold shrink-0 ${tx.status === 'failed' || tx.status === 'refunded' ? 'text-red-500 line-through' : 'text-foreground'}`}>
                        R$ {tx.amount}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
