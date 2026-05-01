import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';

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
      .single();
    if (error) throw error;
    return data;
  }, []);

  const createTemplate = useMutation({
    mutationFn: async ({ title, description, sections }) => {
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
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, title, description, sections }) => {
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
      toast({ title: "Erro", description: error.message, variant: "destructive" });
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

  // Seed default templates helper function
  const seedBaseTemplates = useMutation({
    mutationFn: async () => {
      const baseTemplates = [
        {
          nutritionist_id: user.id,
          title: "Anamnese Padrão (Adulto)",
          description: "Questionário completo para primeira consulta de pacientes adultos.",
          is_system_default: false, // In user's space for editability
          sections: [
            {
              id: crypto.randomUUID(),
              title: "Histórico Clínico",
              fields: [
                { id: crypto.randomUUID(), type: "textarea", label: "Histórico de Doenças Pessoais", required: true },
                { id: crypto.randomUUID(), type: "textarea", label: "Histórico Familiar (Diabetes, Hipertensão, etc)", required: false },
                { id: crypto.randomUUID(), type: "text", label: "Medicamentos em uso", required: false }
              ]
            },
            {
              id: crypto.randomUUID(),
              title: "Hábitos de Vida",
              fields: [
                { id: crypto.randomUUID(), type: "select", label: "Qualidade do Sono", options: [{label: "Ótimo", value: "otimo"}, {label: "Regular", value: "regular"}, {label: "Ruim", value: "ruim"}], required: true },
                { id: crypto.randomUUID(), type: "select", label: "Atividade Física", options: [{label: "Sedentário", value: "0"}, {label: "Leve (1-2x/sem)", value: "1"}, {label: "Moderado (3-4x/sem)", value: "2"}, {label: "Intenso (5+x/sem)", value: "3"}], required: true },
                { id: crypto.randomUUID(), type: "textarea", label: "Consumo de Álcool e Tabagismo", required: false }
              ]
            }
          ]
        },
        {
          nutritionist_id: user.id,
          title: "Rastreamento Metabólico",
          description: "Sintomas comuns para identificar desequilíbrios metabólicos.",
          is_system_default: false,
          sections: [
            {
              id: crypto.randomUUID(),
              title: "Sintomas Gastrointestinais",
              fields: [
                { id: crypto.randomUUID(), type: "scale_1_10", label: "Frequência de azia/refluxo", required: true },
                { id: crypto.randomUUID(), type: "scale_1_10", label: "Inchaço abdominal após refeições", required: true },
                { id: crypto.randomUUID(), type: "text", label: "Ritmo Intestinal (ex: 1x ao dia)", required: true }
              ]
            }
          ]
        }
      ];

      const { data, error } = await supabase
        .from('anamnesis_templates')
        .insert(baseTemplates)
        .select();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anamnesisTemplates'] });
      toast({ title: "Templates adicionados", description: "Os modelos base foram criados com sucesso." });
    }
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
