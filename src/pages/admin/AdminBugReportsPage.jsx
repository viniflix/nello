import { useState, useEffect, useCallback } from 'react';
import { format, subHours, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertCircle,
  Bug,
  Filter,
  Search,
  RefreshCw,
  ExternalLink,
  X,
  ChevronDown,
  ChevronUp,
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
  Download
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

/**
 * AdminBugReportsPage - Sistema completo de relatório de bugs
 * 
 * Funcionalidades:
 * - Listagem com filtros (data, tipo, severidade, status)
 * - Busca por usuário, mensagem ou rota
 * - Detalhes completos ao clicar
 * - Marcar como resolvido
 * - Excluir relatórios
 * - Estatísticas de bugs
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
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('24h'); // 1h, 24h, 7d, 30d, all
  const [typeFilter, setTypeFilter] = useState('all'); // all, frontend, backend, api
  const [statusFilter, setStatusFilter] = useState('all'); // all, resolved, unresolved
  const [severityFilter, setSeverityFilter] = useState('all'); // all, critical, error, warning
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    unresolved: 0,
    resolved: 0,
    critical: 0,
    last24h: 0
  });

  // Load bugs
  const loadBugs = useCallback(async () => {
    setIsLoading(true);
    try {
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
      setStats(data || stats);
    } catch (err) {
      console.error('[AdminBugReports] Erro ao carregar estatísticas:', err);
    }
  }, [stats]);

  // Load initial data
  useEffect(() => {
    loadBugs();
    loadStats();
  }, [loadBugs, loadStats]);

  // Apply filters
  useEffect(() => {
    let filtered = [...bugs];

    // Search filter
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

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(bug => bug.bug_type === typeFilter);
    }

    // Status filter
    if (statusFilter === 'resolved') {
      filtered = filtered.filter(bug => bug.is_resolved === true);
    } else if (statusFilter === 'unresolved') {
      filtered = filtered.filter(bug => bug.is_resolved !== true);
    }

    // Severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter(bug => bug.severity === severityFilter);
    }

    setFilteredBugs(filtered);
  }, [bugs, searchQuery, typeFilter, statusFilter, severityFilter]);

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
        <Button onClick={loadBugs} disabled={isLoading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

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
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por erro, rota, usuário..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Date Filter */}
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="1h">Última hora</option>
              <option value="24h">Últimas 24h</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="all">Todo o período</option>
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="all">Todos os tipos</option>
              <option value="frontend">Frontend</option>
              <option value="backend">Backend</option>
              <option value="api">API</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="all">Todos os status</option>
              <option value="unresolved">Pendentes</option>
              <option value="resolved">Resolvidos</option>
            </select>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
            Lista de todos os erros reportados pelos usuários
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
              <p className="text-sm">Os filtros podem estar muito restritivos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBugs.map((bug) => (
                <div
                  key={bug.id}
                  className={`p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors cursor-pointer ${
                    bug.is_resolved ? 'opacity-60 border-dashed' : 'border-l-4 border-l-red-500'
                  }`}
                  onClick={() => handleOpenBugDetails(bug)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Header Row */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {getSeverityBadge(bug.severity)}
                        {getTypeBadge(bug.bug_type)}
                        {getStatusBadge(bug.is_resolved)}
                      </div>

                      {/* Error Message */}
                      <p className="text-sm font-medium text-foreground line-clamp-2">
                        {bug.error_message || 'Erro sem mensagem'}
                      </p>

                      {/* Metadata Row */}
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(bug.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                        </span>
                        
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {bug.route || 'Rota desconhecida'}
                        </span>

                        {bug.user_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {bug.user_name} ({bug.user_email})
                          </span>
                        )}

                        {bug.user_agent && (
                          <span className="flex items-center gap-1">
                            <Smartphone className="w-3 h-3" />
                            {bug.user_agent.includes('Mobile') ? 'Mobile' : 'Desktop'}
                          </span>
                        )}
                      </div>

                      {/* Stack Preview */}
                      {bug.stack_trace && (
                        <div className="mt-3 p-2 bg-slate-950 rounded text-[10px] text-slate-400 font-mono overflow-hidden">
                          {bug.stack_trace.slice(0, 200)}...
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!bug.is_resolved && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkResolved(bug.id);
                          }}
                          className="gap-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportBug(bug);
                        }}
                        className="gap-1"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenBugDetails(bug);
                        }}
                        className="gap-1"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBug(bug.id);
                        }}
                        className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
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

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="w-5 h-5 text-destructive" />
              Detalhes do Bug #{selectedBug?.id}
            </DialogTitle>
            <DialogDescription>
              Informações completas do erro reportado
            </DialogDescription>
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
                  {/* Time */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Data e Hora
                    </h3>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium">
                        {format(new Date(selectedBug.created_at), "dd 'de' MMMM 'de' yyyy, HH:mm:ss", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Há {Math.round((Date.now() - new Date(selectedBug.created_at).getTime()) / 60000)} minutos
                      </p>
                    </div>
                  </div>

                  {/* User */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <User className="w-4 h-4" /> Usuário
                    </h3>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium">{selectedBug.user_name || 'Anônimo'}</p>
                      <p className="text-xs text-muted-foreground">{selectedBug.user_email || 'Sem e-mail'}</p>
                      <p className="text-xs text-muted-foreground">
                        Tipo: {selectedBug.user_type || 'Desconhecido'} • 
                        ID: {selectedBug.user_id || 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Route */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Globe className="w-4 h-4" /> Rota / URL
                    </h3>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-mono break-all">{selectedBug.route || 'Rota desconhecida'}</p>
                    </div>
                  </div>

                  {/* Device */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Smartphone className="w-4 h-4" /> Dispositivo
                    </h3>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm">
                        {selectedBug.user_agent?.includes('Mobile') ? '📱 Mobile' : '💻 Desktop'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {selectedBug.user_agent || 'User agent não disponível'}
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
                      <Terminal className="w-4 h-4" /> Console Log (Últimas {selectedBug.console_log.length} entradas)
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
                            [{entry.level.toUpperCase()}]
                          </span>
                          <span className="text-slate-300">
                            {typeof entry.args === 'string' ? entry.args : JSON.stringify(entry.args)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {selectedBug.metadata && Object.keys(selectedBug.metadata).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <FileCode className="w-4 h-4" /> Metadados Adicionais
                    </h3>
                    <div className="p-4 bg-muted rounded-lg overflow-auto max-h-[300px]">
                      <pre className="text-xs font-mono whitespace-pre-wrap">
                        {JSON.stringify(selectedBug.metadata, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Component Stack (React errors) */}
                {selectedBug.component_stack && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <FileCode className="w-4 h-4" /> Component Stack (React)
                    </h3>
                    <div className="p-4 bg-slate-950 rounded-lg overflow-auto max-h-[400px]">
                      <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
                        {selectedBug.component_stack}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Source Info */}
                {selectedBug.source_file && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <FileCode className="w-4 h-4" /> Arquivo Fonte
                    </h3>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-mono">
                        {selectedBug.source_file}
                        {selectedBug.line_number && `:${selectedBug.line_number}`}
                        {selectedBug.column_number && `:${selectedBug.column_number}`}
                      </p>
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
                    variant="destructive"
                    onClick={() => handleDeleteBug(selectedBug.id)}
                    className="gap-2 ml-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir Relatório
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
