import { ExternalLink, PlugZap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getAdminIntegrations } from '@/services/adminService';
import { useAdminSource } from '@/portals/admin/hooks/useAdminSource';
import AdminSourceStatus from '@/portals/admin/components/AdminSourceStatus';
import { operationalDate } from '@/portals/admin/model/sourceState';
const states = { available: 'Leitura disponível', not_configured: 'Não configurado', authorization_required: 'Permissão de leitura pendente', rate_limited: 'Limite de consultas atingido', unavailable: 'Consulta indisponível' };
const links = { Supabase: 'https://supabase.com/dashboard', Sentry: 'https://nello.sentry.io/', PostHog: 'https://us.posthog.com/', Resend: 'https://resend.com/overview' };
export default function AdminIntegrationsPage() {
  const query = useAdminSource('integrations', getAdminIntegrations);
  return <div className="space-y-6"><header className="space-y-2"><p className="text-sm font-medium text-primary">Operação · fontes</p><h1 className="font-heading text-2xl uppercase sm:text-3xl">Integrações e confiança</h1><p className="max-w-2xl text-sm text-muted-foreground">Confira acesso à leitura, atualização e limites. Um endpoint disponível não prova a saúde de todos os fluxos.</p></header><AdminSourceStatus query={query} />
    <div className="grid gap-4 md:grid-cols-2">{query.isPending ? [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-56 rounded-2xl" />) : query.data?.sources?.map(source => <Card key={source.provider} className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><PlugZap className="h-5 w-5 text-primary" />{source.provider}</CardTitle></CardHeader><CardContent className="space-y-3"><Badge variant="outline">{states[source.state] || 'Estado desconhecido'}</Badge><p className="text-sm text-muted-foreground">{source.reason}</p><dl className="space-y-2 text-xs text-muted-foreground"><div><dt>Consulta</dt><dd className="text-foreground">{operationalDate(source.generated_at)}</dd></div><div><dt>Consumo, quota e custo contratado</dt><dd>Não disponível por esta integração. Conferir o painel oficial.</dd></div></dl>{links[source.provider] && <a href={links[source.provider]} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary">Abrir painel oficial<ExternalLink className="h-4 w-4" /><span className="sr-only">em nova aba</span></a>}</CardContent></Card>)}</div>
    <p className="text-sm text-muted-foreground">Credenciais ficam no servidor. Não são exibidas pessoas, mensagens, domínio de email ou configurações privadas dos provedores.</p>
  </div>;
}
