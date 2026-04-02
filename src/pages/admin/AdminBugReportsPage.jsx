import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertCircle,
  Bug,
  Filter,
  Search,
  RefreshCw,
  Clock,
  User,
  Monitor,
  Server,
  Zap,
  Terminal,
  FileCode,
  Globe,
  Smartphone,
  Loader2,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Eye,
  Download,
  Activity,
  ShieldAlert,
  Copy,
  Check,
  TrendingUp,
  TrendingDown,
  Database,
  Wifi,
  Cpu,
  HardDrive,
  Clock3,
  AlertOctagon,
  CheckCheck,
  X
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { getSystemLiveLogs } from '@/services/adminService';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * AdminBugReportsPage - Sistema completo de relatório de bugs e audit log
 */
export default function AdminBugReportsPage() {
  const { toast } = useToast();
  
  // States
  const [bugs, setBugs] = useState([]);
  const [filteredBugs, setFilteredBugs] = useState([]);
  const [selectedBug, setSelectedBug] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  // Audit Log States
  const [liveLogs, setLiveLogs] = useState([]);
  const [auditLogLoading, setAuditLogLoading] = useState(false);
  const [copiedLogId, setCopiedLogId] = useState(null);
  const auditLogRef = useRef(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('24h');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  
  // Auto-refresh control
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const lastManualRefreshRef = useRef(Date.now());
  const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000;
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    unresolved: 0,
    resolved: 0,
    critical: 0,
    last24h: 0
  });

  // Observability
  const [observabilitySummary, setObservabilitySummary] = useState({
    total_events: 0,
    error_events: 0,
    error_rate: 0,
    avg_latency_ms: 0
  });

  // Load bugs
  const loadBugs = useCallback(async (isManual = false) => {
    setIsLoading(true);
    try {
      if (isManual) {
        lastManualRefreshRef.current = Date.now();
      }
      
      const { data, error } = await supabase.functions.invoke('sentry-issues');
      
      if (error) throw error;
      setBugs(data || []);
      
      // Update stats based on Sentry issues
      const issues = data || [];
      const unresolved = issues.filter((i) => i.status === 'unresolved').length;
      setStats({
        total: issues.length,
        unresolved: unresolved,
        resolved: issues.length - unresolved,
        critical: issues.filter((i) => i.level === 'fatal' || i.level === 'error').length,
        last24h: issues.filter((i) => {
            const date = new Date(i.firstSeen);
            return (Date.now() - date.getTime()) < 24 * 60 * 60 * 1000;
        }).length
      });

    } catch (err) {
      console.error('[AdminBugReports] Erro ao carregar do Sentry:', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as Issues do Sentry. Verifique a Edge Function.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Load stats (handled by loadBugs now)
  const loadStats = useCallback(async () => {}, []);

  // Observability is now obsolete
  const loadObservability = useCallback(async () => {}, []);

  // Load audit logs
  const loadAuditLogs = useCallback(async () => {
    setAuditLogLoading(true);
    try {
      const { data } = await getSystemLiveLogs(100);
      if (data) {
        setLiveLogs(data);
      }
    } catch (err) {
      console.error('[AdminBugReports] Erro ao carregar audit logs:', err);
    } finally {
      setAuditLogLoading(false);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    loadBugs();
    loadStats();
    loadObservability();
    loadAuditLogs();
  }, [loadBugs, loadStats, loadObservability, loadAuditLogs]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const interval = setInterval(() => {
      const timeSinceManual = Date.now() - lastManualRefreshRef.current;
      if (timeSinceManual >= AUTO_REFRESH_INTERVAL) {
        loadBugs(false);
        loadStats();
        loadObservability();
        loadAuditLogs();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [autoRefreshEnabled, loadBugs, loadStats, loadObservability, loadAuditLogs]);

  // Apply filters
  useEffect(() => {
    let filtered = [...bugs];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(bug => 
        bug.error_message?.toLowerCase().includes(query) ||
        bug.route?.toLowerCase().includes(query) ||
        bug.user_email?.toLowerCase().includes(query) ||
        bug.user_name?.toLowerCase().includes(query) ||
        bug.id?.toString().includes(query)
      );
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(bug => bug.bug_type === typeFilter);
    }

    if (statusFilter === 'resolved') {
      filtered = filtered.filter(bug => bug.is_resolved === true);
    } else if (statusFilter === 'unresolved' || statusFilter === 'hide-resolved') {
      filtered = filtered.filter(bug => bug.is_resolved !== true);
    }

    if (severityFilter !== 'all') {
      filtered = filtered.filter(bug => bug.severity === severityFilter);
    }

    setFilteredBugs(filtered);
  }, [bugs, searchQuery, typeFilter, statusFilter, severityFilter]);

  // Manual refresh
  const handleManualRefresh = () => {
    lastManualRefreshRef.current = Date.now();
    loadBugs(true);
    loadStats();
    loadObservability();
    loadAuditLogs();
    toast({
      title: 'Atualizado',
      description: 'Dados recarregados.',
      duration: 2000
    });
  };

  // Copy log for clipboard
  const copyLogForClipboard = (log) => {
    const timestamp = format(new Date(log.timestamp || log.event_timestamp), "yyyy-MM-dd'T'HH:mm:ss");
    
    const formattedLog = `---
📋 REGISTRO DE EVENTO - HIPOZERO
═══════════════════════════════════════
⏰ Data/Hora: ${timestamp}
📌 Tipo: ${log.type?.toUpperCase() || 'INFO'}
👤 Usuário: ${log.user_name || 'Sistema'}
═══════════════════════════════════════

📝 Mensagem:
${log.message}

🔗 Rota: ${log.route || 'N/A'}
🏷️ Tags: ${log.tags || 'N/A'}
═══════════════════════════════════════
---`;
    
    navigator.clipboard.writeText(formattedLog);
    setCopiedLogId(log.id || timestamp);
    toast({
      title: 'Copiado!',
      description: 'Evento copiado para a área de transferência',
      duration: 2000
    });
    
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  // Copy all logs
  const copyAllLogs = () => {
    const allLogsFormatted = liveLogs.map((log, index) => {
      const timestamp = format(new Date(log.timestamp || log.event_timestamp), "yyyy-MM-dd'T'HH:mm:ss");
      return `[${index + 1}] ${timestamp} | ${log.type?.toUpperCase() || 'INFO'} | ${log.user_name || 'Sistema'} | ${log.message}`;
    }).join('\n');

    const header = `═══════════════════════════════════════
📋 HIPOZERO - REGISTRO DE AUDIT LOG
📅 Gerado em: ${format(new Date(), "yyyy-MM-dd'T'HH:mm:ss")}
📊 Total de eventos: ${liveLogs.length}
═══════════════════════════════════════

`;
    
    navigator.clipboard.writeText(header + allLogsFormatted);
    toast({
      title: 'Logs copiados!',
      description: `${liveLogs.length} eventos copiados para a área de transferência`,
      duration: 3000
    });
  };

  // Copy bug details
  const copyBugDetails = (bug) => {
    const formattedBug = `---
🐛 RELATÓRIO DE BUG - HIPOZERO
═══════════════════════════════════════
🆔 ID: ${bug.id}
⏰ Data: ${format(new Date(bug.created_at), "yyyy-MM-dd'T'HH:mm:ss")}
🎯 Severidade: ${bug.severity?.toUpperCase() || 'ERROR'}
💻 Tipo: ${bug.bug_type?.toUpperCase() || 'FRONTEND'}
📊 Status: ${bug.is_resolved ? '✅ RESOLVIDO' : '⚠️ PENDENTE'}
═══════════════════════════════════════

👤 USUÁRIO AFETADO
─────────────────
Nome: ${bug.user_name || 'Anônimo'}
Email: ${bug.user_email || 'N/A'}
Tipo: ${bug.user_type || 'N/A'}
ID: ${bug.user_id || 'N/A'}

🌐 CONTEXTO
──────────
Rota: ${bug.route || 'N/A'}
Device: ${bug.user_agent?.includes('Mobile') ? '📱 Mobile' : '💻 Desktop'}
User Agent: ${bug.user_agent || 'N/A'}

❌ MENSAGEM DO ERRO
──────────────────
${bug.error_message || 'Sem mensagem'}

📜 STACK TRACE
──────────────
${bug.stack_trace || 'Não disponível'}

💻 CONSOLE LOG (${(bug.console_log || []).length} entradas)
─────────────────────────────────────
${(bug.console_log || []).map((entry, i) => 
  `[${format(new Date(entry.ts), 'HH:mm:ss')}] [${entry.level?.toUpperCase()}] ${typeof entry.args === 'string' ? entry.args : JSON.stringify(entry.args)}`
).join('\n')}

📎 METADADOS
────────────
${JSON.stringify(bug.metadata, null, 2)}

📁 ARQUIVO FONTE
────────────────
${bug.source_file || 'N/A'}${bug.line_number ? `:${bug.line_number}` : ''}${bug.column_number ? `:${bug.column_number}` : ''}

═══════════════════════════════════════
FIM DO RELATÓRIO
═══════════════════════════════════════
---`;
    
    navigator.clipboard.writeText(formattedBug);
    toast({
      title: 'Bug copiado!',
      description: 'Detalhes copiados para a área de transferência',
      duration: 3000
    });
  };

  // Open bug details
  const handleOpenBugDetails = async (bug) => {
    setIsLoadingDetails(true);
    setShowDetailsModal(true);
    
    try {
      const { data, error } = await getBugReportById(bug.id);
      if (error) throw error;
      setSelectedBug(data);
    } catch (err) {
      console.error('[AdminBugReports] Erro ao carregar detalhes:', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os detalhes do bug.',
        variant: 'destructive'
      });
      setShowDetailsModal(false);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Mark as resolved
  const handleMarkResolved = async (bugId) => {
    try {
      const { error } = await markBugAsResolved(bugId);
      if (error) throw error;
      
      toast({
        title: 'Bug resolvido',
        description: 'O relatório foi marcado como resolvido.',
      });
      
      loadBugs();
      loadStats();
      
      if (selectedBug?.id === bugId) {
        setSelectedBug({ ...selectedBug, is_resolved: true });
      }
    } catch (err) {
      console.error('[AdminBugReports] Erro ao marcar como resolvido:', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível marcar o bug como resolvido.',
        variant: 'destructive'
      });
    }
  };

  // Delete bug
  const handleDeleteBug = async (bugId) => {
    try {
      const { error } = await deleteBugReport(bugId);
      if (error) throw error;
      
      toast({
        title: 'Bug excluído',
        description: 'O relatório foi excluído com sucesso.',
      });
      
      setBugs(prev => prev.filter(b => b.id !== bugId));
      loadStats();
      
      if (selectedBug?.id === bugId) {
        setShowDetailsModal(false);
        setSelectedBug(null);
      }
    } catch (err) {
      console.error('[AdminBugReports] Erro ao excluir:', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir o relatório.',
        variant: 'destructive'
      });
    }
  };

  // Export bug as JSON
  const handleExportBug = (bug) => {
    const dataStr = JSON.stringify(bug, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bug-report-${bug.id}-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Get severity badge
  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Crítico</Badge>;
      case 'error':
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" /> Erro</Badge>;
      case 'warning':
        return <Badge variant="warning" className="gap-1"><AlertTriangle className="w-3 h-3" /> Aviso</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1"><Info className="w-3 h-3" /> Info</Badge>;
    }
  };

  // Get type badge
  const getTypeBadge = (type) => {
    switch (type) {
      case 'frontend':
        return <Badge variant="outline" className="gap-1"><Monitor className="w-3 h-3" /> Frontend</Badge>;
      case 'backend':
        return <Badge variant="outline" className="gap-1"><Server className="w-3 h-3" /> Backend</Badge>;
      case 'api':
        return <Badge variant="outline" className="gap-1"><Zap className="w-3 h-3" /> API</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><Bug className="w-3 h-3" /> Desconhecido</Badge>;
    }
  };

  // Get status badge
  const getStatusBadge = (isResolved) => {
    if (isResolved) {
      return <Badge variant="success" className="gap-1"><CheckCircle className="w-3 h-3" /> Resolvido</Badge>;
    }
    return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> Pendente</Badge>;
  };

  // Get status health indicator
  const getStatusHealth = () => {
    if (observabilitySummary.error_rate < 1) {
      return { color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: 'Excelente' };
    } else if (observabilitySummary.error_rate < 5) {
      return { color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', label: 'Atenção' };
    } else {
      return { color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Crítico' };
    }
  };

  // Format log time
  const formatLogTime = (timestamp) => {
    try {
      return format(new Date(timestamp), 'HH:mm:ss');
    } catch {
      return '--:--:--';
    }
  };

  const statusHealth = getStatusHealth();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Bug className="w-8 h-8 text-destructive" />
            Relatórios de Bugs
          </h1>
          <p className="text-muted-foreground mt-1">
            Sistema completo de rastreamento, análise e resolução de erros do sistema
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefreshEnabled ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${autoRefreshEnabled ? 'animate-spin' : ''}`} />
            Auto {autoRefreshEnabled ? 'ON' : 'OFF'}
          </Button>
          <Button onClick={handleManualRefresh} disabled={isLoading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="bugs" className="space-y-6">
        <TabsList>
          <TabsTrigger value="bugs" className="gap-2">
            <Bug className="w-4 h-4" />
            Bugs
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <Terminal className="w-4 h-4" />
            Audit Log
          </TabsTrigger>
          <TabsTrigger value="observability" className="gap-2">
            <Activity className="w-4 h-4" />
            Observabilidade
          </TabsTrigger>
        </TabsList>

        {/* TAB: BUGS */}
        <TabsContent value="bugs" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{stats.unresolved}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Resolvidos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-orange-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Críticos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{stats.critical}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Últimas 24h</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{stats.last24h}</div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Filtros</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por erro, rota, usuário..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="1h">Última hora</option>
                  <option value="24h">Últimas 24h</option>
                  <option value="7d">Últimos 7 dias</option>
                  <option value="30d">Últimos 30 dias</option>
                  <option value="all">Todo o período</option>
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">Todos os tipos</option>
                  <option value="frontend">Frontend</option>
                  <option value="backend">Backend</option>
                  <option value="api">API</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">Todos os bugs</option>
                  <option value="unresolved">Somente Pendentes</option>
                  <option value="resolved">Somente Resolvidos</option>
                  <option value="hide-resolved">Pendentes (oculta resolvidos)</option>
                </select>

                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">Todas severidades</option>
                  <option value="critical">Crítico</option>
                  <option value="error">Erro</option>
                  <option value="warning">Aviso</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Bugs List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-destructive" />
                Bugs Encontrados
                <Badge variant="secondary" className="ml-2">{filteredBugs.length}</Badge>
              </CardTitle>
              <CardDescription>
                Lista de erros capturados automaticamente pelos usuários. Clique em um bug para ver detalhes completos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : filteredBugs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mb-4 text-green-500" />
                  <p className="text-lg font-medium">Nenhum bug encontrado</p>
                  <p className="text-sm">Tente ajustar os filtros</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {filteredBugs.map((bug) => (
                    <div
                      key={bug.id}
                      className={`p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors ${
                        bug.is_resolved ? 'opacity-60 border-dashed' : 'border-l-4 border-l-red-500'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => bug.permalink && window.open(bug.permalink, '_blank')}>
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            {getSeverityBadge(bug.level)}
                            {getTypeBadge(bug.type)}
                            {getStatusBadge(bug.status === 'resolved')}
                          </div>

                          <p className="text-sm font-medium text-foreground line-clamp-2">
                            {bug.title || 'Erro sem mensagem'}
                          </p>

                          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {bug.lastSeen ? format(new Date(bug.lastSeen), "dd/MM/yyyy HH:mm", { locale: ptBR }) : 'N/A'}
                            </span>
                            
                            <span className="flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              {bug.permalink ? <a href={bug.permalink} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Abrir no Sentry</a> : 'N/A'}
                            </span>

                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              Afetados: {bug.userCount || 0} (Ocorrências: {bug.count || 0})
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {bug.permalink && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(bug.permalink, '_blank');
                              }}
                              className="gap-1 bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
                              title="Gerenciar no Sentry"
                            >
                              <Eye className="w-4 h-4" /> Ver no Sentry
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: AUDIT LOG */}
        <TabsContent value="audit" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-primary" />
                    Registro de Auditoria
                  </CardTitle>
                  <CardDescription>
                    Log de eventos operacionais do sistema em tempo real - últimas 100 entradas
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={copyAllLogs}
                    className="gap-2 bg-blue-50 hover:bg-blue-100 border-blue-200"
                  >
                    <Copy className="w-4 h-4" />
                    Copiar Todos os Logs
                  </Button>
                  <Button variant="outline" size="sm" onClick={loadAuditLogs} disabled={auditLogLoading} className="gap-2">
                    <RefreshCw className={`w-4 h-4 ${auditLogLoading ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div 
                ref={auditLogRef}
                className="bg-slate-950 rounded-lg p-4 h-[600px] overflow-y-auto"
              >
                {auditLogLoading && liveLogs.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : liveLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <Terminal className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-lg">Nenhum evento registrado</p>
                    <p className="text-sm mt-2">Os eventos aparecerão aqui em tempo real</p>
                  </div>
                ) : (
                  <div className="space-y-3 font-mono text-xs">
                    {liveLogs.map((log, index) => (
                      <div
                        key={log.id || index}
                        className={`p-4 rounded-lg border transition-all ${
                          log.type === 'error' 
                            ? 'bg-red-950/50 border-red-800' 
                            : log.type === 'warning'
                            ? 'bg-yellow-950/50 border-yellow-800'
                            : 'bg-slate-900 border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="text-slate-400 font-bold">
                                #{String(index + 1).padStart(3, '0')}
                              </span>
                              <span className="bg-slate-700 px-2 py-0.5 rounded text-slate-200">
                                {formatLogTime(log.timestamp || log.event_timestamp)}
                              </span>
                              <span className={`px-2 py-0.5 rounded font-bold ${
                                log.type === 'error' 
                                  ? 'bg-red-600 text-white' 
                                  : log.type === 'warning'
                                  ? 'bg-yellow-600 text-black'
                                  : 'bg-blue-600 text-white'
                              }`}>
                                {log.type?.toUpperCase() || 'INFO'}
                              </span>
                            </div>
                            
                            <p className="text-slate-200 mb-2 whitespace-pre-wrap">
                              {log.message}
                            </p>
                            
                            <div className="flex items-center gap-4 text-slate-400 text-[10px] flex-wrap">
                              {log.user_name && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {log.user_name}
                                </span>
                              )}
                              {log.route && (
                                <span className="flex items-center gap-1">
                                  <Globe className="w-3 h-3" />
                                  {log.route}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyLogForClipboard(log)}
                            className={`gap-1 ${copiedLogId === (log.id || index) ? 'text-green-400' : 'text-slate-400 hover:text-white'}`}
                            title="Copiar evento"
                          >
                            {copiedLogId === (log.id || index) ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: OBSERVABILIDADE */}
        <TabsContent value="observability" className="space-y-6">
          {/* Status Geral */}
          <Card className={`border-2 ${statusHealth.bg}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" />
                Status Geral do Sistema
              </CardTitle>
              <CardDescription>
                Visão geral da saúde operacional da plataforma nas últimas 24 horas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {observabilitySummary.error_rate < 5 ? (
                    <CheckCheck className="w-12 h-12 text-green-600" />
                  ) : (
                    <AlertOctagon className="w-12 h-12 text-red-600" />
                  )}
                  <div>
                    <p className={`text-2xl font-bold ${statusHealth.color}`}>
                      {statusHealth.label}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Taxa de erro: {observabilitySummary.error_rate.toFixed(2)}%
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Última verificação</p>
                  <p className="text-sm font-medium">
                    {format(new Date(), "dd/MM/yyyy HH:mm")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Métricas Principais */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-500" />
                  Total de Eventos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{observabilitySummary.total_events.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Nas últimas 24 horas</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-red-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  Total de Erros
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">{observabilitySummary.error_events.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Erros registrados</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock3 className="w-4 h-4 text-amber-500" />
                  Latência Média
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600">
                  {observabilitySummary.avg_latency_ms.toFixed(0)} ms
                </div>
                <p className="text-xs text-muted-foreground mt-1">Tempo médio de resposta</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-purple-500" />
                  Taxa de Erro
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">
                  {observabilitySummary.error_rate.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">% de eventos com erro</p>
              </CardContent>
            </Card>
          </div>

          {/* Detalhes Técnicos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sistema de Captura */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-primary" />
                  Sistema de Captura de Erros
                </CardTitle>
                <CardDescription>
                  Como os erros são capturados automaticamente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Monitor className="w-5 h-5 text-blue-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">JavaScript Errors</p>
                      <p className="text-xs text-muted-foreground">Captura via window.error</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Zap className="w-5 h-5 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Unhandled Promises</p>
                      <p className="text-xs text-muted-foreground">Captura via unhandledrejection</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <FileCode className="w-5 h-5 text-purple-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">React Error Boundaries</p>
                      <p className="text-xs text-muted-foreground">Captura de erros em componentes React</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Terminal className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Console Errors</p>
                      <p className="text-xs text-muted-foreground">Logs de console.error</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dados Coletados */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-primary" />
                  Dados Coletados
                </CardTitle>
                <CardDescription>
                  Informações armazenadas para cada erro
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <FileCode className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                    <p className="text-xs font-medium">Stack Trace</p>
                    <p className="text-[10px] text-muted-foreground">Caminho completo do erro</p>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <Globe className="w-5 h-5 text-green-500 mx-auto mb-1" />
                    <p className="text-xs font-medium">Rota/URL</p>
                    <p className="text-[10px] text-muted-foreground">Página onde ocorreu</p>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <User className="w-5 h-5 text-purple-500 mx-auto mb-1" />
                    <p className="text-xs font-medium">Usuário</p>
                    <p className="text-[10px] text-muted-foreground">Nome, email, tipo</p>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <Smartphone className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                    <p className="text-xs font-medium">Dispositivo</p>
                    <p className="text-[10px] text-muted-foreground">Browser, OS, Mobile</p>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <Terminal className="w-5 h-5 text-red-500 mx-auto mb-1" />
                    <p className="text-xs font-medium">Console Log</p>
                    <p className="text-[10px] text-muted-foreground">Logs antes do erro</p>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <HardDrive className="w-5 h-5 text-cyan-500 mx-auto mb-1" />
                    <p className="text-xs font-medium">Metadados</p>
                    <p className="text-[10px] text-muted-foreground">Dados adicionais</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Indicadores de Saúde */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Indicadores de Saúde
              </CardTitle>
              <CardDescription>
                Métricas de performance e disponibilidade
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Taxa de Resolução */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Taxa de Resolução</span>
                    <span className="font-medium">
                      {stats.total > 0 ? ((stats.resolved / stats.total) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${stats.total > 0 ? (stats.resolved / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Disponibilidade Estimada */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Disponibilidade</span>
                    <span className="font-medium text-green-600">
                      {(100 - observabilitySummary.error_rate).toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${100 - observabilitySummary.error_rate}%` }}
                    />
                  </div>
                </div>

                {/* Performance */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Performance (Latência)</span>
                    <span className={`font-medium ${
                      observabilitySummary.avg_latency_ms < 100 ? 'text-green-600' :
                      observabilitySummary.avg_latency_ms < 500 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {observabilitySummary.avg_latency_ms < 100 ? 'Excelente' :
                       observabilitySummary.avg_latency_ms < 500 ? 'Bom' : 'Lento'} 
                      ({observabilitySummary.avg_latency_ms.toFixed(0)}ms)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        observabilitySummary.avg_latency_ms < 100 ? 'bg-green-500' :
                        observabilitySummary.avg_latency_ms < 500 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.max(10, 100 - (observabilitySummary.avg_latency_ms / 10))}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informações Adicionais */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="w-5 h-5 text-primary" />
                Informações Adicionais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Período de Análise</span>
                <span className="text-sm font-medium">Últimas 24 horas</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Bugs Pendentes</span>
                <span className="text-sm font-medium text-red-600">{stats.unresolved}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Bugs Críticos</span>
                <span className="text-sm font-medium text-orange-600">{stats.critical}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Bugs Resolvidos</span>
                <span className="text-sm font-medium text-green-600">{stats.resolved}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">Última Atualização</span>
                <span className="text-sm font-medium">{format(new Date(), "dd/MM/yyyy HH:mm:ss")}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Bug className="w-5 h-5 text-destructive" />
                  Detalhes do Bug #{selectedBug?.id}
                </DialogTitle>
                <DialogDescription>
                  Informações completas para análise e resolução
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => copyBugDetails(selectedBug)}
                className="gap-2 bg-blue-50 hover:bg-blue-100 border-blue-200"
              >
                <Copy className="w-4 h-4" />
                Copiar Detalhes
              </Button>
            </div>
          </DialogHeader>

          {isLoadingDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : selectedBug ? (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-6 pb-6">
                <div className="flex items-center gap-3 flex-wrap">
                  {getSeverityBadge(selectedBug.severity)}
                  {getTypeBadge(selectedBug.bug_type)}
                  {getStatusBadge(selectedBug.is_resolved)}
                  
                  {!selectedBug.is_resolved && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleMarkResolved(selectedBug.id)}
                      className="gap-1 ml-auto"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Marcar como Resolvido
                    </Button>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                    <XCircle className="w-4 h-4" /> Mensagem do Erro
                  </h3>
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm font-mono text-red-800 whitespace-pre-wrap">
                      {selectedBug.error_message || 'Sem mensagem'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Data e Hora
                    </h3>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium">
                        {format(new Date(selectedBug.created_at), "dd 'de' MMMM 'de' yyyy, HH:mm:ss", { locale: ptBR })}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <User className="w-4 h-4" /> Usuário
                    </h3>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium">{selectedBug.user_name || 'Anônimo'}</p>
                      <p className="text-xs text-muted-foreground">{selectedBug.user_email || 'Sem e-mail'}</p>
                      <p className="text-xs text-muted-foreground">
                        Tipo: {selectedBug.user_type || 'Desconhecido'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Globe className="w-4 h-4" /> Rota / URL
                    </h3>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-mono break-all">{selectedBug.route || 'N/A'}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Smartphone className="w-4 h-4" /> Dispositivo
                    </h3>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm">
                        {selectedBug.user_agent?.includes('Mobile') ? '📱 Mobile' : '💻 Desktop'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {selectedBug.user_agent || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedBug.stack_trace && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Terminal className="w-4 h-4" /> Stack Trace
                    </h3>
                    <div className="p-4 bg-slate-950 rounded-lg overflow-auto max-h-[400px]">
                      <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
                        {selectedBug.stack_trace}
                      </pre>
                    </div>
                  </div>
                )}

                {selectedBug.console_log && selectedBug.console_log.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Terminal className="w-4 h-4" /> Console Log ({selectedBug.console_log.length} entradas)
                    </h3>
                    <div className="p-4 bg-slate-950 rounded-lg overflow-auto max-h-[300px]">
                      {selectedBug.console_log.map((entry, idx) => (
                        <div key={idx} className="flex gap-2 mb-2 text-xs font-mono">
                          <span className="text-slate-500">[{format(new Date(entry.ts), 'HH:mm:ss')}]</span>
                          <span className={`${
                            entry.level === 'error' ? 'text-red-400' :
                            entry.level === 'warn' ? 'text-yellow-400' :
                            'text-slate-300'
                          }`}>
                            [{entry.level?.toUpperCase()}]
                          </span>
                          <span className="text-slate-300">
                            {typeof entry.args === 'string' ? entry.args : JSON.stringify(entry.args)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => handleExportBug(selectedBug)}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Exportar JSON
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => copyBugDetails(selectedBug)}
                    className="gap-2 bg-blue-50 hover:bg-blue-100 border-blue-200"
                  >
                    <Copy className="w-4 h-4" />
                    Copiar Detalhes
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleDeleteBug(selectedBug.id)}
                    className="gap-2 ml-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir
                  </Button>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <p>Selecione um bug para ver os detalhes</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
