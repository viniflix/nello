import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { createClientErrorCapture } from '@/lib/clientError/clientErrorCapture';
import { createBugReport } from '@/services/bugReportService';

/**
 * Instala captura global de erros no frontend e envia para o Supabase
 * 
 * Este componente:
 * 1. Captura TODOS os erros JavaScript (window errors, unhandled rejections, React errors)
 * 2. Coleta contexto rico (usuário, rota, device, console logs)
 * 3. Envia para a tabela bug_reports no Supabase
 * 4. Faz parte do sistema de observabilidade do HipoZero
 */
export default function ClientErrorLogger() {
  const { user } = useAuth();
  const location = useLocation();
  const errorCountRef = useRef(0);
  const MAX_ERRORS_PER_SESSION = 50; // Limite para evitar flooding

  // Captura contexto do usuário atual
  const getUserContext = useCallback(() => {
    if (!user) {
      return {
        id: null,
        email: null,
        name: null,
        type: null,
      };
    }
    
    return {
      id: user.id || null,
      email: user.email || null,
      name: user.profile?.name || null,
      type: user.profile?.user_type || null,
    };
  }, [user]);

  // Cria instância de captura com callback de envio
  const capture = useMemo(() => {
    return createClientErrorCapture({
      getUserContext,
      onErrorCaptured: async (errorData) => {
        // Limite para evitar flooding
        if (errorCountRef.current >= MAX_ERRORS_PER_SESSION) {
          console.warn('[ClientErrorLogger] Limite de erros por sessão atingido, ignorando...');
          return;
        }
        errorCountRef.current++;

        try {
          // Adiciona contexto adicional
          const enrichedData = {
            ...errorData,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            screenSize: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : null,
            sessionId: typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('session_id') || null : null,
          };

          // Envia para a tabela bug_reports
          await createBugReport(enrichedData);
          
          console.log('[ClientErrorLogger] Bug report enviado com sucesso');
        } catch (err) {
          // Nunca deixar o logger quebrar o app
          console.error('[ClientErrorLogger] Falha ao enviar bug report:', err);
        }
      }
    });
  }, [getUserContext]);

  // Instala captura de erros
  useEffect(() => {
    capture.install();
    
    // Disponibiliza instância para o ErrorBoundary
    window.__hipozeroClientErrorCapture = capture;
    
    return () => capture.uninstall();
  }, [capture]);

  // Atualiza local quando a rota muda
  useEffect(() => {
    void location?.pathname;
  }, [location]);

  return null;
}
