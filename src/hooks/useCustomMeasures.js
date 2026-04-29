/**
 * Hooks para gerenciar medidas caseiras personalizadas do nutricionista.
 * Padrão: useState + useEffect (sem React Query), consistente com o restante do codebase.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getAllCustomMeasures,
  getCustomMeasures,
  countCustomMeasures,
  createCustomMeasure,
  updateCustomMeasure,
  deleteCustomMeasure,
} from '@/lib/supabase/custom-measures-queries';
import { useToast } from '@/hooks/use-toast';

const MAX_CUSTOM_MEASURES = 20;

/**
 * Busca todas as medidas personalizadas do nutricionista (tela de gerenciamento).
 * @returns {{ data, isLoading, error, refetch, count, hasReachedLimit }}
 */
export const useCustomMeasures = () => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getAllCustomMeasures();
      if (result.error) throw result.error;
      setData(result.data || []);
    } catch (err) {
      console.error('Erro ao carregar medidas personalizadas:', err);
      setError(err);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return {
    data,
    isLoading,
    error,
    refetch: load,
    count: data.length,
    hasReachedLimit: data.length >= MAX_CUSTOM_MEASURES,
  };
};

/**
 * Busca apenas medidas ativas para uso nos seletores do plano alimentar.
 * @returns {{ data, isLoading, error, refetch }}
 */
export const useActiveCustomMeasures = () => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getCustomMeasures();
      if (result.error) throw result.error;
      setData(result.data || []);
    } catch (err) {
      console.error('Erro ao carregar medidas ativas:', err);
      setError(err);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { data, isLoading, error, refetch: load };
};

/**
 * Mutação para criar uma nova medida personalizada.
 * @returns {{ mutateAsync, isPending, error }}
 */
export const useCreateCustomMeasure = () => {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  const mutateAsync = useCallback(async (payload) => {
    setIsPending(true);
    setError(null);
    try {
      const result = await createCustomMeasure(payload);
      if (result.error) throw result.error;
      toast({ title: 'Medida criada!', description: `"${payload.name}" foi adicionada às suas medidas.` });
      return result;
    } catch (err) {
      console.error('Erro ao criar medida:', err);
      setError(err);
      toast({ title: 'Erro ao criar medida', description: err.message, variant: 'destructive' });
      throw err;
    } finally {
      setIsPending(false);
    }
  }, [toast]);

  return { mutateAsync, isPending, error };
};

/**
 * Mutação para atualizar uma medida personalizada.
 * @returns {{ mutateAsync, isPending, error }}
 */
export const useUpdateCustomMeasure = () => {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  const mutateAsync = useCallback(async ({ id, payload }) => {
    setIsPending(true);
    setError(null);
    try {
      const result = await updateCustomMeasure(id, payload);
      if (result.error) throw result.error;
      toast({ title: 'Medida atualizada!', description: 'As alterações foram salvas.' });
      return result;
    } catch (err) {
      console.error('Erro ao atualizar medida:', err);
      setError(err);
      toast({ title: 'Erro ao atualizar', description: err.message, variant: 'destructive' });
      throw err;
    } finally {
      setIsPending(false);
    }
  }, [toast]);

  return { mutateAsync, isPending, error };
};

/**
 * Mutação para excluir uma medida personalizada.
 * Avisa o usuário que a medida será convertida para gramas nos planos existentes.
 * @returns {{ mutateAsync, isPending, error }}
 */
export const useDeleteCustomMeasure = () => {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  const mutateAsync = useCallback(async (id) => {
    setIsPending(true);
    setError(null);
    try {
      const result = await deleteCustomMeasure(id);
      if (result.error) throw result.error;
      toast({
        title: 'Medida excluída',
        description: 'Os planos alimentares que usavam esta medida foram convertidos para gramas automaticamente.',
      });
      return result;
    } catch (err) {
      console.error('Erro ao excluir medida:', err);
      setError(err);
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
      throw err;
    } finally {
      setIsPending(false);
    }
  }, [toast]);

  return { mutateAsync, isPending, error };
};
