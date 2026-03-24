import { supabase } from '@/lib/customSupabaseClient';

/**
 * BugReportService - Serviço para gerenciar relatórios de bugs
 * 
 * Funcionalidades:
 * - CRUD completo de bugs
 * - Estatísticas de bugs
 * - Busca com filtros
 */

// ============================================
// QUERIES DE LEITURA
// ============================================

/**
 * Busca lista de relatórios de bugs com filtros
 * @param {Object} options
 * @param {number|null} options.windowHours - Janela de tempo em horas (null = todo período)
 * @param {string} options.type - Tipo de bug (frontend, backend, api)
 * @param {boolean} options.resolved - Filtrar por status de resolução
 * @param {string} options.severity - Severidade do bug
 */
export async function getBugReports({ 
  windowHours = 24,
  type = null,
  resolved = null,
  severity = null
} = {}) {
  try {
    let query = supabase
      .from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false });

    // Filtro de tempo
    if (windowHours) {
      const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', since);
    }

    // Filtro de tipo
    if (type && type !== 'all') {
      query = query.eq('bug_type', type);
    }

    // Filtro de resolução
    if (resolved !== null) {
      query = query.eq('is_resolved', resolved);
    }

    // Filtro de severidade
    if (severity && severity !== 'all') {
      query = query.eq('severity', severity);
    }

    const { data, error } = await query.limit(500);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[BugReportService] getBugReports:', error);
    return { data: null, error };
  }
}

/**
 * Busca um relatório de bug específico por ID
 */
export async function getBugReportById(bugId) {
  try {
    const { data, error } = await supabase
      .from('bug_reports')
      .select('*')
      .eq('id', bugId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[BugReportService] getBugReportById:', error);
    return { data: null, error };
  }
}

/**
 * Busca estatísticas resumidas de bugs
 */
export async function getBugStats() {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Queries paralelas para estatísticas
    const [
      totalResult,
      unresolvedResult,
      resolvedResult,
      criticalResult,
      last24hResult
    ] = await Promise.all([
      supabase.from('bug_reports').select('id', { count: 'exact', head: true }),
      supabase.from('bug_reports').select('id', { count: 'exact', head: true }).eq('is_resolved', false),
      supabase.from('bug_reports').select('id', { count: 'exact', head: true }).eq('is_resolved', true),
      supabase.from('bug_reports').select('id', { count: 'exact', head: true }).eq('severity', 'critical').eq('is_resolved', false),
      supabase.from('bug_reports').select('id', { count: 'exact', head: true }).gte('created_at', last24h)
    ]);

    return {
      data: {
        total: totalResult.count || 0,
        unresolved: unresolvedResult.count || 0,
        resolved: resolvedResult.count || 0,
        critical: criticalResult.count || 0,
        last24h: last24hResult.count || 0
      },
      error: null
    };
  } catch (error) {
    console.error('[BugReportService] getBugStats:', error);
    return { data: null, error };
  }
}

/**
 * Busca erros do frontend das últimas horas
 */
export async function getRecentFrontendErrors(hours = 24, limit = 50) {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('bug_reports')
      .select('*')
      .eq('bug_type', 'frontend')
      .eq('is_resolved', false)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[BugReportService] getRecentFrontendErrors:', error);
    return { data: null, error };
  }
}

/**
 * Busca erros por rota específica
 */
export async function getBugsByRoute(route) {
  try {
    const { data, error } = await supabase
      .from('bug_reports')
      .select('*')
      .eq('route', route)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[BugReportService] getBugsByRoute:', error);
    return { data: null, error };
  }
}

/**
 * Busca erros por usuário
 */
export async function getBugsByUser(userId) {
  try {
    const { data, error } = await supabase
      .from('bug_reports')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[BugReportService] getBugsByUser:', error);
    return { data: null, error };
  }
}

// ============================================
// MUTATIONS (CRUD)
// ============================================

/**
 * Marca um bug como resolvido
 */
export async function markBugAsResolved(bugId) {
  try {
    const { error } = await supabase
      .from('bug_reports')
      .update({ 
        is_resolved: true,
        resolved_at: new Date().toISOString()
      })
      .eq('id', bugId);

    if (error) throw error;
    return { data: true, error: null };
  } catch (error) {
    console.error('[BugReportService] markBugAsResolved:', error);
    return { data: null, error };
  }
}

/**
 * Marca um bug como não resolvido
 */
export async function markBugAsUnresolved(bugId) {
  try {
    const { error } = await supabase
      .from('bug_reports')
      .update({ 
        is_resolved: false,
        resolved_at: null
      })
      .eq('id', bugId);

    if (error) throw error;
    return { data: true, error: null };
  } catch (error) {
    console.error('[BugReportService] markBugAsUnresolved:', error);
    return { data: null, error };
  }
}

/**
 * Exclui um relatório de bug
 */
export async function deleteBugReport(bugId) {
  try {
    const { error } = await supabase
      .from('bug_reports')
      .delete()
      .eq('id', bugId);

    if (error) throw error;
    return { data: true, error: null };
  } catch (error) {
    console.error('[BugReportService] deleteBugReport:', error);
    return { data: null, error };
  }
}

/**
 * Exclui múltiplos relatórios de bugs
 */
export async function deleteMultipleBugReports(bugIds) {
  try {
    const { error } = await supabase
      .from('bug_reports')
      .delete()
      .in('id', bugIds);

    if (error) throw error;
    return { data: true, error: null };
  } catch (error) {
    console.error('[BugReportService] deleteMultipleBugReports:', error);
    return { data: null, error };
  }
}

/**
 * Exclui bugs antigos resolvidos (limpeza)
 */
export async function cleanupOldResolvedBugs(daysOld = 30) {
  try {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('bug_reports')
      .delete()
      .eq('is_resolved', true)
      .lt('resolved_at', cutoffDate);

    if (error) throw error;
    return { data: true, error: null };
  } catch (error) {
    console.error('[BugReportService] cleanupOldResolvedBugs:', error);
    return { data: null, error };
  }
}

// ============================================
// CRIAÇÃO DE BUGS (via cliente)
// ============================================

/**
 * Registra um novo bug (chamado pelo ClientErrorLogger)
 * 
 * @param {Object} bugData - Dados do bug
 * @param {string} bugData.errorType - Tipo do erro (Error, TypeError, etc)
 * @param {string} bugData.message - Mensagem do erro
 * @param {string} bugData.stackTrace - Stack trace completo
 * @param {string} bugData.route - Rota onde ocorreu
 * @param {Object} bugData.user - Dados do usuário (id, email, name, type)
 * @param {string} bugData.userAgent - User agent do browser
 * @param {Array} bugData.consoleLog - Buffer de logs do console
 * @param {Object} bugData.metadata - Metadados adicionais
 */
export async function createBugReport(bugData) {
  try {
    const {
      errorType = 'Error',
      message = null,
      stackTrace = null,
      route = null,
      user = null,
      userAgent = null,
      consoleLog = [],
      metadata = {},
      componentStack = null,
      sourceFile = null,
      lineNumber = null,
      columnNumber = null
    } = bugData;

    // Determinar severidade baseado no tipo
    let severity = 'error';
    if (errorType === 'TypeError' || errorType === 'ReferenceError' || errorType === 'SyntaxError') {
      severity = 'critical';
    } else if (message?.toLowerCase().includes('warning') || message?.toLowerCase().includes('deprecated')) {
      severity = 'warning';
    }

    // Determinar tipo baseado na origem
    let bugType = 'frontend';
    if (sourceFile?.includes('/api/') || sourceFile?.includes('supabase')) {
      bugType = 'api';
    } else if (sourceFile?.includes('server') || metadata?.isServerError) {
      bugType = 'backend';
    }

    const bugReport = {
      error_type: errorType,
      error_message: message,
      stack_trace: stackTrace,
      route: route,
      user_id: user?.id || null,
      user_email: user?.email || null,
      user_name: user?.name || null,
      user_type: user?.type || null,
      user_agent: userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null),
      bug_type: bugType,
      severity: severity,
      console_log: consoleLog.slice(0, 30), // Limitar a 30 entradas
      metadata: metadata,
      component_stack: componentStack,
      source_file: sourceFile,
      line_number: lineNumber,
      column_number: columnNumber,
      is_resolved: false,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('bug_reports')
      .insert(bugReport)
      .select('id')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[BugReportService] createBugReport:', error);
    return { data: null, error };
  }
}

// ============================================
// RPC FUNCTIONS (para uso interno do banco)
// ============================================

/**
 * Busca resumo de bugs por período (RPC)
 */
export async function getBugReportsSummary(startDate, endDate) {
  try {
    const { data, error } = await supabase.rpc('get_bug_reports_summary', {
      p_start_date: startDate,
      p_end_date: endDate
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[BugReportService] getBugReportsSummary:', error);
    return { data: null, error };
  }
}

/**
 * Atualiza múltiplos bugs de uma vez (batch update)
 */
export async function batchUpdateBugs(bugIds, updates) {
  try {
    const { error } = await supabase
      .from('bug_reports')
      .update(updates)
      .in('id', bugIds);

    if (error) throw error;
    return { data: true, error: null };
  } catch (error) {
    console.error('[BugReportService] batchUpdateBugs:', error);
    return { data: null, error };
  }
}
