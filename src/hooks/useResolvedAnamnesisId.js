import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { resolveAnamnesisId } from '@/lib/supabase/anamnesis-queries';
import { isUuid } from '@/lib/utils/patientRoutes';

/**
 * Resolve :anamnesisId (short code ou UUID) para o ID real.
 */
export function useResolvedAnamnesisId(patientId) {
  const { anamnesisId: paramValue } = useParams();
  const [anamnesisId, setAnamnesisId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!paramValue || !patientId) {
      setAnamnesisId(null);
      setLoading(false);
      return;
    }
    if (isUuid(paramValue)) {
      setAnamnesisId(paramValue);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    resolveAnamnesisId(patientId, paramValue).then(({ anamnesisId: resolved, error: err }) => {
      if (cancelled) return;
      setLoading(false);
      if (err) setError(err);
      else setAnamnesisId(resolved);
    });
    return () => { cancelled = true; };
  }, [paramValue, patientId]);

  return { anamnesisId, loading, error, paramValue };
}
