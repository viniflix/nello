import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { resolvePatientId } from '@/lib/supabase/patient-queries';
import { isUuid } from '@/lib/utils/patientRoutes';

/**
 * Resolve :patientSlugOrId para patientId real.
 * Suporta UUID (usa direto) ou slug (busca no banco).
 */
export function useResolvedPatientId(options = {}) {
    const { replaceUrlWithSlug = true } = options;
    const { patientId: paramValue } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [patientId, setPatientId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!paramValue || !user?.id) {
            setPatientId(null);
            setLoading(false);
            return;
        }
        if (isUuid(paramValue)) {
            setPatientId(paramValue);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        resolvePatientId(paramValue, user.id).then(({ patientId: resolved, error: err }) => {
            if (cancelled) return;
            setLoading(false);
            if (err) setError(err);
            else setPatientId(resolved);
        });
        return () => { cancelled = true; };
    }, [paramValue, user?.id]);

    return { patientId, loading, error, paramValue };
}
