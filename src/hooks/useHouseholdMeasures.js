/**
 * Hook para buscar medidas genéricas (household_measures)
 * e combinar com medidas personalizadas do nutricionista.
 * Usa padrão useState + useEffect (sem React Query)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getCustomMeasures } from '@/lib/supabase/custom-measures-queries';
import { getAllHouseholdMeasures } from '@/lib/supabase/food-measures-queries';

/**
 * Hook para buscar todas as medidas caseiras genéricas
 * @param {object} options - Opções adicionais
 * @returns {object} { data, isLoading, error, refetch }
 */
export const useHouseholdMeasures = (options = {}) => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadMeasures = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getAllHouseholdMeasures();
      if (result.error) throw result.error;
      setData(result.data || []);
    } catch (err) {
      console.error('Erro ao carregar medidas caseiras:', err);
      setError(err);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeasures();
  }, [loadMeasures]);

  return {
    data,
    isLoading,
    error,
    refetch: loadMeasures
  };
};

/**
 * Hook para buscar medidas agrupadas por categoria
 * Útil para selects com categorias
 * @param {object} options - Opções adicionais
 * @returns {object} { data: groupedMeasures, measures, isLoading, error }
 */
export const useGroupedHouseholdMeasures = (options = {}) => {
  const { data: measures, isLoading, error, refetch } = useHouseholdMeasures(options);

  const groupedMeasures = useMemo(() => {
    return measures.reduce((acc, measure) => {
      const category = measure.category || 'other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(measure);
      return acc;
    }, {});
  }, [measures]);

  return {
    data: groupedMeasures,
    measures,
    isLoading,
    error,
    refetch
  };
};

/**
 * Labels das categorias em português
 */
export const categoryLabels = {
  volume: 'Medidas de Volume',
  weight: 'Medidas de Peso',
  unit: 'Unidades',
  other: 'Outras'
};

/**
 * Descrições das categorias
 */
export const categoryDescriptions = {
  volume: 'Colheres, xícaras, copos, etc.',
  weight: 'Gramas e quilogramas',
  unit: 'Unidades, fatias, porções, etc.',
  other: 'Outras medidas',
  custom: 'Medidas criadas por você'
};

/**
 * Hook unificado que combina medidas do sistema + medidas personalizadas do nutricionista.
 * Usado nos seletores do plano alimentar, PDF e diário.
 *
 * Retorna measures com campo `source`:
 *  - 'system'  → vem de household_measures (padrão, read-only)
 *  - 'custom'  → vem de nutritionist_custom_measures (do próprio nutricionista)
 *
 * @returns {{ data: Array, systemMeasures: Array, customMeasures: Array, isLoading, error, refetch }}
 */
export const useAllMeasures = () => {
  const [systemMeasures, setSystemMeasures] = useState([]);
  const [customMeasures, setCustomMeasures] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [systemResult, customResult] = await Promise.all([
        getAllHouseholdMeasures(),
        getCustomMeasures(),
      ]);

      if (systemResult.error) throw systemResult.error;

      setSystemMeasures((systemResult.data || []).map(m => ({ ...m, source: 'system' })));
      setCustomMeasures((customResult.data || []).map(m => ({
        ...m,
        // Normalizar campos para interface unificada
        category: 'custom',
        source: 'custom',
        ml_equivalent: null,
      })));
    } catch (err) {
      console.error('Erro ao carregar medidas:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const data = useMemo(() => [...systemMeasures, ...customMeasures], [systemMeasures, customMeasures]);

  return {
    data,
    systemMeasures,
    customMeasures,
    isLoading,
    error,
    refetch: load,
  };
};
