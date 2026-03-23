import { useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { createClientErrorCapture } from '@/lib/clientError/clientErrorCapture';

/**
 * Instala captura global de erros no frontend e envia para o Supabase
 * (tabela operational_observability_log via RPC log_operational_event).
 */
export default function ClientErrorLogger() {
  const { user } = useAuth();
  const location = useLocation();

  const getUserContext = useCallback(() => {
    const userId = user?.id || null;
    const userType = user?.profile?.user_type || null;

    return {
      userId,
      patientId: userType === 'patient' ? userId : null,
    };
  }, [user]);

  const capture = useMemo(() => createClientErrorCapture({ getUserContext }), [getUserContext]);

  useEffect(() => {
    capture.install();
    // Make the instance available to the ErrorBoundary (so we can include componentStack).
    window.__hipozeroClientErrorCapture = capture;
    return () => capture.uninstall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Keep location updated inside error metadata (window handler reads window.location anyway)
    // This effect exists to ensure capture is initialized after router context is ready.
    void location?.pathname;
  }, [location]);

  return null;
}

