-- =====================================================
-- HipoZero - Bug Reports System
-- Migration: Criar tabela e funções para relatórios de bugs
-- Data: 2026-03-23
-- =====================================================

-- 1. Criar a tabela de relatórios de bugs
CREATE TABLE IF NOT EXISTS public.bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Informações do erro
    error_type VARCHAR(100) DEFAULT 'Error',
    error_message TEXT,
    stack_trace TEXT,
    
    -- Contexto
    route TEXT,
    source_file TEXT,
    line_number INTEGER,
    column_number INTEGER,
    
    -- Informações do usuário
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    user_name TEXT,
    user_type VARCHAR(50),
    user_agent TEXT,
    
    -- Classificação
    bug_type VARCHAR(50) DEFAULT 'frontend', -- frontend, backend, api
    severity VARCHAR(20) DEFAULT 'error', -- critical, error, warning, info
    
    -- Logs e metadados
    console_log JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    component_stack TEXT,
    
    -- Status
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Criar índices para otimização de queries
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON public.bug_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON public.bug_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_route ON public.bug_reports(route);
CREATE INDEX IF NOT EXISTS idx_bug_reports_is_resolved ON public.bug_reports(is_resolved);
CREATE INDEX IF NOT EXISTS idx_bug_reports_severity ON public.bug_reports(severity);
CREATE INDEX IF NOT EXISTS idx_bug_reports_bug_type ON public.bug_reports(bug_type);
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_email ON public.bug_reports(user_email);

-- 3. Criar índice composto para queries frequentes
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_resolved ON public.bug_reports(created_at DESC, is_resolved);

-- 4. Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_bug_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_bug_reports_updated_at ON public.bug_reports;
CREATE TRIGGER trigger_update_bug_reports_updated_at
    BEFORE UPDATE ON public.bug_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.update_bug_reports_updated_at();

-- 6. Função RPC para registrar bug (chamada pelo frontend)
CREATE OR REPLACE FUNCTION public.log_bug_report(
    p_error_type VARCHAR DEFAULT 'Error',
    p_error_message TEXT DEFAULT NULL,
    p_stack_trace TEXT DEFAULT NULL,
    p_route TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_user_email TEXT DEFAULT NULL,
    p_user_name TEXT DEFAULT NULL,
    p_user_type VARCHAR DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_console_log JSONB DEFAULT '[]'::jsonb,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_component_stack TEXT DEFAULT NULL,
    p_source_file TEXT DEFAULT NULL,
    p_line_number INTEGER DEFAULT NULL,
    p_column_number INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_severity VARCHAR(20);
BEGIN
    -- Determinar severidade baseado no tipo do erro
    IF p_error_type IN ('TypeError', 'ReferenceError', 'SyntaxError', 'RangeError') THEN
        v_severity := 'critical';
    ELSIF p_error_message ILIKE '%warning%' OR p_error_message ILIKE '%deprecated%' THEN
        v_severity := 'warning';
    ELSE
        v_severity := 'error';
    END IF;

    -- Inserir o registro
    INSERT INTO public.bug_reports (
        error_type,
        error_message,
        stack_trace,
        route,
        user_id,
        user_email,
        user_name,
        user_type,
        user_agent,
        console_log,
        metadata,
        component_stack,
        source_file,
        line_number,
        column_number,
        severity,
        bug_type
    ) VALUES (
        p_error_type,
        p_error_message,
        p_stack_trace,
        p_route,
        p_user_id,
        p_user_email,
        p_user_name,
        p_user_type,
        p_user_agent,
        p_console_log,
        p_metadata,
        p_component_stack,
        p_source_file,
        p_line_number,
        p_column_number,
        v_severity,
        CASE 
            WHEN p_source_file LIKE '%/api/%' OR p_source_file LIKE '%supabase%' THEN 'api'
            ELSE 'frontend'
        END
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Permissões RLS
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Admins podem ver todos os bugs
CREATE POLICY "Admins can view all bug reports"
    ON public.bug_reports FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- Policy: Qualquer usuário pode inserir bugs (para captura automática)
CREATE POLICY "Users can insert bug reports"
    ON public.bug_reports FOR INSERT
    TO authenticated
    WITH CHECK (TRUE);

-- Policy: Admins podem atualizar bugs
CREATE POLICY "Admins can update bug reports"
    ON public.bug_reports FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- Policy: Admins podem deletar bugs
CREATE POLICY "Admins can delete bug reports"
    ON public.bug_reports FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- 8. Comentários para documentação
COMMENT ON TABLE public.bug_reports IS 'Tabela para armazenar relatórios de bugs e erros do sistema';
COMMENT ON COLUMN public.bug_reports.error_type IS 'Tipo do erro JavaScript (Error, TypeError, etc)';
COMMENT ON COLUMN public.bug_reports.error_message IS 'Mensagem do erro';
COMMENT ON COLUMN public.bug_reports.stack_trace IS 'Stack trace completo do erro';
COMMENT ON COLUMN public.bug_reports.route IS 'Rota/URL onde o erro ocorreu';
COMMENT ON COLUMN public.bug_reports.severity IS 'Severidade: critical, error, warning, info';
COMMENT ON COLUMN public.bug_reports.bug_type IS 'Tipo: frontend, backend, api';
COMMENT ON COLUMN public.bug_reports.console_log IS 'Buffer de logs do console JavaScript';
COMMENT ON COLUMN public.bug_reports.metadata IS 'Metadados adicionais do erro';
COMMENT ON COLUMN public.bug_reports.is_resolved IS 'Se o bug foi marcado como resolvido';

-- 9. Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.bug_reports TO authenticated;
GRANT ALL ON public.bug_reports TO service_role;
GRANT EXECUTE ON FUNCTION public.log_bug_report TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_bug_report TO service_role;

-- =====================================================
-- FIM DA MIGRATION
-- Execute este SQL no Supabase SQL Editor ou via CLI
-- =====================================================
