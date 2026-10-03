import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { resolvePatientId } from '@/lib/supabase/patient-queries';
import { isUuid } from '@/lib/utils/patientRoutes';

/**
 * Resolve :patientSlugOrId para patientId real.
 * Suporta UUID (usa direto) ou slug (busca no banco).
 */
export function useResolvedPatientId() {
    const { patientId: paramValue } = useParams();
    const { user } = useAuth();
    const [resolution, setResolution] = useState(null);
    const scopeKey = `${user?.id || ''}:${paramValue || ''}`;
    const scopeRef = useRef({ key: scopeKey });
    if (scopeRef.current.key !== scopeKey) scopeRef.current = { key: scopeKey };
    const scope = scopeRef.current;

    useEffect(() => {
        if (!paramValue || !user?.id) {
            return;
        }
        if (isUuid(paramValue)) {
            return;
        }
        let cancelled = false;
        resolvePatientId(paramValue, user.id).then(({ patientId: resolved, error: err }) => {
            if (cancelled) return;
            setResolution({ scope, patientId: err ? null : resolved, loading: false, error: err || null });
        }).catch(() => {
            if (!cancelled) setResolution({ scope, patientId: null, loading: false, error: new Error('Não foi possível localizar o paciente. Tente novamente.') });
        });
        return () => { cancelled = true; };
    }, [paramValue, user?.id, scope]);

    if (!paramValue || !user?.id) return { patientId: null, loading: false, error: null, paramValue };
    if (isUuid(paramValue)) return { patientId: paramValue, loading: false, error: null, paramValue };
    return resolution?.scope === scope ? { patientId: resolution.patientId, loading: resolution.loading, error: resolution.error, paramValue } : { patientId: null, loading: true, error: null, paramValue };
}
