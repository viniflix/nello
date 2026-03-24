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
  Clipboard,
  Check
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { getBugReports, getBugReportById, markBugAsResolved, deleteBugReport, getBugStats } from '@/services/bugReportService';
import { getSystemLiveLogs } from '@/services/adminService';
import { getOperationalHealthSummary } from '@/lib/supabase/observability-queries';

/**
 * AdminBugReportsPage - Sistema completo de relatório de bugs e audit log
 * Otimizado para análise por IAs
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
      
      const windowHours = dateFilter === '1h' ? 1 : 
                          dateFilter === '24h' ? 24 : 
                          dateFilter === '7d' ? 168 : 
                          dateFilter === '30d' ? 720 : null;
      
      const { data, error } = await getBugReports({ windowHours });
      
      if (error) throw error;
      setBugs(data || []);
    } catch (err) {
      console.error('[AdminBugReports] Erro ao carregar bugs:', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os relatórios de bugs.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [dateFilter, toast]);

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      const { data, error } = await getBugStats();
      if (error) throw error;
      setStats(data || {
        total: 0,
        unresolved: 0,
        resolved: 0,
        critical: 0,
        last24h: 0
      });
    } catch (err) {
      console.error('[AdminBugReports] Erro ao carregar estatísticas:', err);
    }
  }, []);

  // Load observability
  const loadObservability = useCallback(async () => {
    try {
      const { data, error } = await getOperationalHealthSummary({
        nutritionistId: null,
        windowHours: 24
      });
      if (error) throw error;
      setObservabilitySummary({
        total_events: Number(data?.total_events || 0),
        error_events: Number(data?.error_events || 0),
        error_rate: Number(data?.error_rate || 0),
        avg_latency_ms: Number(data?.avg_latency_ms || 0)
      });
    } catch (err) {
      console.error('[AdminBugReports] Erro ao carregar observabilidade:', err);
    }
  }, []);

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
    } else if (statusFilter === 'unresolved') {
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

  // Copy log for AI - FORMATADO PARA IAs ENTENDEREM
  const copyLogForAI = (log) => {
    const timestamp = format(new Date(log.timestamp || log.event_timestamp), "yyyy-MM-dd'T'HH:mm:ss");
    
    // Formato estruturado para IAs
    const formattedLog = `---
🐛 EVENTO DO SISTEMA
═══════════════════════════════════════
⏰ Data/Hora: ${timestamp}
📋 Tipo: ${log.type?.toUpperCase() || 'INFO'}
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
      description: 'Evento formatado para análise de IA',
      duration: 2000
    });
    
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  // Copy all logs for AI
  const copyAllLogsForAI = () => {
    const allLogsFormatted = liveLogs.map((log, index) => {
      const timestamp = format(new Date(log.timestamp || log.event_timestamp), "yyyy-MM-dd'T'HH:mm:ss");
      return `[${index + 1}] ${timestamp} | ${log.type?.toUpperCase() || 'INFO'} | ${log.user_name || 'Sistema'} | ${log.message}`;
    }).join('\n');

    const header = `═══════════════════════════════════════
📋 HIPOZERO - AUDIT LOG EXPORTADO
📅 Gerado em: ${format(new Date(), "yyyy-MM-dd'T'HH:mm:ss")}
📊 Total de eventos: ${liveLogs.length}
═══════════════════════════════════════

`;
    
    navigator.clipboard.writeText(header + allLogsFormatted);
    toast({
      title: 'Todos os logs copiados!',
      description: `${liveLogs.length} eventos prontos para análise`,
      duration: 3000
    });
  };

  // Copy bug details for AI
  const copyBugForAI = (bug) => {
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
      description: 'Pronto para análise de IA',
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

  // Get log icon
  const getLogIcon = (type) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
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
            Sistema completo de rastreamento e análise de erros
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
            <Activity className="w-4 h-4" />
            Audit Log
          </TabsTrigger>
          <TabsTrigger value="observability" className="gap-2">
            <ShieldAlert className="w-4 h-4" />
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
                  <option value="all">Todos os status</option>
                  <option value="unresolved">Pendentes</option>
                  <option value="resolved">Resolvidos</option>
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
                Clique em um bug para ver detalhes ou use o botão de copiar para análise de IA
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
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleOpenBugDetails(bug)}>
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            {getSeverityBadge(bug.severity)}
                            {getTypeBadge(bug.bug_type)}
                            {getStatusBadge(bug.is_resolved)}
                          </div>

                          <p className="text-sm font-medium text-foreground line-clamp-2">
                            {bug.error_message || 'Erro sem mensagem'}
                          </p>

                          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {format(new Date(bug.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </span>
                            
                            <span className="flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              {bug.route || 'N/A'}
                            </span>

                            {bug.user_name && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {bug.user_name}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyBugForAI(bug)}
                            className="gap-1 bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
                            title="Copiar para análise de IA"
                          >
                            <Clipboard className="w-4 h-4" />
                          </Button>
                          
                          {!bug.is_resolved && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleMarkResolved(bug.id)}
                              className="gap-1 text-green-600 hover:bg-green-50"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                          )}
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenBugDetails(bug)}
                            className="gap-1"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteBug(bug.id)}
                            className="gap-1 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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
                    Live Audit Log
                  </CardTitle>
                  <CardDescription>
                    Eventos formatados para fácil cópia e análise por IAs
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={copyAllLogsForAI}
                    className="gap-2 bg-blue-50 hover:bg-blue-100 border-blue-200"
                  >
                    <Clipboard className="w-4 h-4" />
                    Copiar Todos para IA
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
                            {/* Header */}
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
                            
                            {/* Message */}
                            <p className="text-slate-200 mb-2 whitespace-pre-wrap">
                              {log.message}
                            </p>
                            
                            {/* Metadata */}
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
                          
                          {/* Copy Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyLogForAI(log)}
                            className={`gap-1 ${copiedLogId === (log.id || index) ? 'text-green-400' : 'text-slate-400 hover:text-white'}`}
                            title="Copiar para análise de IA"
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Observabilidade Técnica
              </CardTitle>
              <CardDescription>
                Métricas de saúde da plataforma nas últimas 24h
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-xs text-muted-foreground">Total de Eventos</p>
                  <p className="text-2xl font-semibold">{observabilitySummary.total_events}</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-xs text-red-700">Erros</p>
                  <p className="text-2xl font-semibold text-red-700">{observabilitySummary.error_events}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs text-amber-700">Latência Média</p>
                  <p className="text-2xl font-semibold text-amber-700">
                    {observabilitySummary.avg_latency_ms.toFixed(0)} ms
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-xs text-muted-foreground">Taxa de Erro</p>
                  <p className="text-2xl font-semibold">{observabilitySummary.error_rate.toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-primary" />
                Sistema de Captura de Erros
              </CardTitle>
              <CardDescription>
                Como os erros são capturados e armazenados
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Monitor className="w-4 h-4" /> Erros Capturados
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• window.error (JavaScript)</li>
                    <li>• unhandledrejection (Promises)</li>
                    <li>• React Error Boundaries</li>
                    <li>• Console errors</li>
                  </ul>
                </div>
                <div className="p-4 rounded-lg border">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <FileCode className="w-4 h-4" /> Dados Coletados
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Stack trace completo</li>
                    <li>• Rota/URL do erro</li>
                    <li>• Informações do usuário</li>
                    <li>• Logs do console</li>
                  </ul>
                </div>
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
                  Informações completas para debugging
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => copyBugForAI(selectedBug)}
                className="gap-2 bg-blue-50 hover:bg-blue-100 border-blue-200"
              >
                <Clipboard className="w-4 h-4" />
                Copiar para IA
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
                {/* Status & Severity */}
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

                {/* Error Message */}
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

                {/* Context Info Grid */}
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

                {/* Stack Trace */}
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

                {/* Console Log */}
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

                {/* Additional Actions */}
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
                    onClick={() => copyBugForAI(selectedBug)}
                    className="gap-2 bg-blue-50 hover:bg-blue-100 border-blue-200"
                  >
                    <Clipboard className="w-4 h-4" />
                    Copiar para IA
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
