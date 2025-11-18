/**
 * Hook para gerenciar medidas caseiras de um alimento
 * Usa padrão useState + useEffect (sem React Query)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getFoodMeasures,
  createFoodMeasure,
  updateFoodMeasure,
  deleteFoodMeasure,
  foodHasMeasures
} from '@/lib/supabase/food-measures-queries';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook para buscar medidas caseiras de um alimento
 * @param {number} foodId - ID do alimento
 * @returns {object} { data, isLoading, error, refetch }
 */
export const useFoodMeasures = (foodId) => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadMeasures = useCallback(async () => {
    if (!foodId) {
      setData([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getFoodMeasures(foodId);
      if (result.error) throw result.error;
      setData(result.data || []);
    } catch (err) {
      console.error('Erro ao carregar medidas:', err);
      setError(err);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [foodId]);

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
 * Hook para criar nova medida caseira
 * @returns {object} { mutateAsync, isPending, error }
 */
export const useCreateFoodMeasure = () => {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  const mutateAsync = useCallback(async (payload) => {
    setIsPending(true);
    setError(null);

    try {
      const result = await createFoodMeasure(payload);
      if (result.error) throw result.error;

      toast({
        title: 'Medida adicionada',
        description: 'Medida caseira cadastrada com sucesso',
      });

      return result;
    } catch (err) {
      console.error('Erro ao criar medida:', err);
      setError(err);

      toast({
        title: 'Erro ao adicionar medida',
        description: err.message || 'Ocorreu um erro ao cadastrar a medida',
        variant: 'destructive',
      });

      throw err;
    } finally {
      setIsPending(false);
    }
  }, [toast]);

  return {
    mutateAsync,
    isPending,
    error
  };
};

/**
 * Hook para atualizar medida caseira
 * @returns {object} { mutateAsync, isPending, error }
 */
export const useUpdateFoodMeasure = () => {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  const mutateAsync = useCallback(async ({ id, payload }) => {
    setIsPending(true);
    setError(null);

    try {
      const result = await updateFoodMeasure(id, payload);
      if (result.error) throw result.error;

      toast({
        title: 'Medida atualizada',
        description: 'Medida caseira atualizada com sucesso',
      });

      return result;
    } catch (err) {
      console.error('Erro ao atualizar medida:', err);
      setError(err);

      toast({
        title: 'Erro ao atualizar medida',
        description: err.message || 'Ocorreu um erro ao atualizar a medida',
        variant: 'destructive',
      });

      throw err;
    } finally {
      setIsPending(false);
    }
  }, [toast]);

  return {
    mutateAsync,
    isPending,
    error
  };
};

/**
 * Hook para deletar medida caseira
 * @returns {object} { mutateAsync, isPending, error }
 */
export const useDeleteFoodMeasure = () => {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  const mutateAsync = useCallback(async (id) => {
    setIsPending(true);
    setError(null);

    try {
      const result = await deleteFoodMeasure(id);
      if (result.error) throw result.error;

      toast({
        title: 'Medida removida',
        description: 'Medida caseira removida com sucesso',
      });

      return result;
    } catch (err) {
      console.error('Erro ao deletar medida:', err);
      setError(err);

      toast({
        title: 'Erro ao remover medida',
        description: err.message || 'Ocorreu um erro ao remover a medida',
        variant: 'destructive',
      });

      throw err;
    } finally {
      setIsPending(false);
    }
  }, [toast]);

  return {
    mutateAsync,
    isPending,
    error
  };
};

/**
 * Hook para verificar se um alimento tem medidas cadastradas
 * @param {number} foodId - ID do alimento
 * @returns {boolean}
 */
export const useFoodHasMeasures = (foodId) => {
  const [hasMeasures, setHasMeasures] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!foodId) {
      setHasMeasures(false);
      return;
    }

    const checkMeasures = async () => {
      setIsLoading(true);
      try {
        const result = await foodHasMeasures(foodId);
        setHasMeasures(result);
      } catch (err) {
        console.error('Erro ao verificar medidas:', err);
        setHasMeasures(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkMeasures();
  }, [foodId]);

  return { hasMeasures, isLoading };
};
