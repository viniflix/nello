import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { cloneAnamnesisSections, validateAnamnesisTemplate } from '@/lib/validations/formContracts';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

export function useAnamnesisTemplates() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const useTemplates = () => useQuery({
    queryKey: ['anamnesisTemplates', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('anamnesis_templates')
        .select('*')
        .or(`nutritionist_id.eq.${user?.id},is_system_default.eq.true`)
        .eq('is_active', true)
        .order('is_system_default', { ascending: false }) // Globais primeiro
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const getTemplate = useCallback(async (templateId) => {
    const { data, error } = await supabase
      .from('anamnesis_templates')
      .select('*')
      .eq('id', templateId)
      .or(`nutritionist_id.eq.${user.id},is_system_default.eq.true`)
      .eq('is_active', true)
      .single();
    if (error) throw error;
    return data;
  }, [user?.id]);

  const createTemplate = useMutation({
    mutationFn: async ({ title, description, sections }) => {
      if (validateAnamnesisTemplate({ title, sections })) throw new Error('INVALID_ANAMNESIS_TEMPLATE');
      const { data, error } = await supabase
        .from('anamnesis_templates')
        .insert({
          nutritionist_id: user.id,
          title,
          description: description || '',
          sections: sections || [],
          version: 1,
          is_system_default: false
        })
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anamnesisTemplates'] });
      toast({ title: "Sucesso!", description: "Template criado com sucesso." });
    },
    onError: (error) => {
      logSupabaseError('Criar template de anamnese', error);
      toast({ title: "Não foi possível criar", description: "Revise o formulário e tente novamente.", variant: "destructive" });
    }
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, title, description, sections }) => {
      if (validateAnamnesisTemplate({ title, sections })) throw new Error('INVALID_ANAMNESIS_TEMPLATE');
      const { data, error } = await supabase
        .from('anamnesis_templates')
        .update({
          title,
          description,
          sections,
          // Bump version whenever it changes
          // version: supabase.raw('version + 1') -> wait, handled via increment or just simple read/write.
          // For now just update fields.
        })
        .eq('id', id)
        .eq('nutritionist_id', user.id) // Security check
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anamnesisTemplates'] });
      toast({ title: "Sucesso!", description: "Template atualizado." });
    },
    onError: (error) => {
      logSupabaseError('Atualizar template de anamnese', error);
      toast({ title: "Não foi possível atualizar", description: "O formulário não foi salvo. Tente novamente.", variant: "destructive" });
    }
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('anamnesis_templates')
        .delete()
        .eq('id', id)
        .eq('nutritionist_id', user.id);
        
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anamnesisTemplates'] });
      toast({ title: "Sucesso", description: "Template excluído." });
    },
    onError: (error) => {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    }
  });

  // Copia apenas modelos oficiais ativos ainda não presentes na biblioteca pessoal.
  const seedBaseTemplates = useMutation({
    mutationFn: async () => {
      const { data: examples, error: examplesError } = await supabase
        .from('anamnesis_templates')
        .select('title, description, sections')
        .eq('is_system_default', true)
        .eq('is_active', true);
      if (examplesError) throw examplesError;
      const { data: owned, error: ownedError } = await supabase
        .from('anamnesis_templates')
        .select('title')
        .eq('nutritionist_id', user.id);
      if (ownedError) throw ownedError;
      const existing = new Set((owned || []).map((item) => item.title));
      const copies = (examples || [])
        .filter((item) => Array.isArray(item.sections) && item.sections.length > 0)
        .filter((item) => !existing.has(`${item.title} (Cópia)`))
        .map((item) => ({
          nutritionist_id: user.id,
          title: `${item.title} (Cópia)`,
          description: item.description || '',
          sections: cloneAnamnesisSections(item.sections),
          version: 1,
          is_system_default: false,
        }));
      if (copies.length === 0) return [];
      const { data, error } = await supabase.from('anamnesis_templates').insert(copies).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anamnesisTemplates'] });
      toast({ title: 'Modelos adicionados', description: 'Os formulários foram copiados para sua biblioteca.' });
    },
    onError: (error) => {
      logSupabaseError('Copiar modelos de anamnese', error);
      toast({ title: 'Não foi possível copiar', description: 'Tente novamente.', variant: 'destructive' });
    },
  });
  return {
    useTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    seedBaseTemplates
  };
}
