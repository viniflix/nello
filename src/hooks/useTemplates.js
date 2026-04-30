import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook para gerenciar templates de nutrição.
 * Fontes de dados:
 *   - diet: diet_templates + diet_template_meals + diet_template_foods
 *   - meal: meal_templates + meal_template_foods
 *   - recipe: recipes + recipe_ingredients
 */
export function useTemplates(type = 'diet') {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Buscar os templates
  const {
    data: templates = [],
    isLoading: loading,
    error,
    refetch: fetchTemplates,
  } = useQuery({
    queryKey: ['templates', type, user?.id],
    queryFn: async () => {
      if (!user) return [];

      let data, fetchError;

      if (type === 'diet') {
        // Fonte única: diet_templates com contagem de refeições e alimentos
        ({ data, error: fetchError } = await supabase
          .from('diet_templates')
          .select(`
            id, name, description, tags, created_at, updated_at,
            diet_template_meals (
              id,
              diet_template_foods ( id )
            )
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }));

        if (data) {
          data = data.map(t => ({
            ...t,
            meal_count: t.diet_template_meals?.length || 0,
            food_count: t.diet_template_meals?.reduce(
              (acc, m) => acc + (m.diet_template_foods?.length || 0), 0
            ) || 0,
          }));
        }
      } else if (type === 'meal') {
        ({ data, error: fetchError } = await supabase
          .from('meal_templates')
          .select(`
            id, name, description, tags, created_at, updated_at,
            meal_template_foods ( id )
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }));

        if (data) {
          data = data.map(t => ({
            ...t,
            food_count: t.meal_template_foods?.length || 0,
          }));
        }
      } else if (type === 'recipe') {
        ({ data, error: fetchError } = await supabase
          .from('recipes')
          .select(`
            id, name, description, yield_quantity, yield_unit, base_calories, created_at, updated_at,
            recipe_ingredients ( id )
          `)
          .eq('user_id', user.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false }));

        if (data) {
          data = data.map(t => ({
            ...t,
            food_count: t.recipe_ingredients?.length || 0,
          }));
        }
      } else {
        throw new Error('Invalid template type');
      }

      if (fetchError) throw fetchError;
      return data || [];
    },
    enabled: !!user,
    staleTime: 30000, // 30 segundos
  });

  // Mutação para deletar template
  const deleteMutation = useMutation({
    mutationFn: async (templateId) => {
      if (!user) throw new Error('User not authenticated');

      let deleteError;

      if (type === 'diet') {
        ({ error: deleteError } = await supabase
          .from('diet_templates')
          .delete()
          .eq('id', templateId)
          .eq('user_id', user.id));
      } else if (type === 'meal') {
        ({ error: deleteError } = await supabase
          .from('meal_templates')
          .delete()
          .eq('id', templateId)
          .eq('user_id', user.id));
      } else if (type === 'recipe') {
        // Soft delete em recipes
        ({ error: deleteError } = await supabase
          .from('recipes')
          .update({ is_deleted: true })
          .eq('id', templateId)
          .eq('user_id', user.id));
      }

      if (deleteError) throw deleteError;
      return templateId;
    },
    onSuccess: (deletedId) => {
      // Atualiza o cache manualmente para UX instantânea
      queryClient.setQueryData(['templates', type, user?.id], (old) => {
        if (!old) return old;
        return old.filter(t => t.id !== deletedId);
      });
      // Invalida para garantir sincronia no background
      queryClient.invalidateQueries({ queryKey: ['templates', type, user?.id] });
    },
    onError: (err) => {
      console.error(`[useTemplates] Error deleting ${type} template:`, err.message);
    }
  });

  // Wrapper para manter a compatibilidade da API (retorna boolean)
  const deleteTemplate = async (templateId) => {
    try {
      await deleteMutation.mutateAsync(templateId);
      return true;
    } catch {
      return false;
    }
  };

  return {
    templates,
    loading,
    error: error?.message || null,
    fetchTemplates,
    deleteTemplate,
  };
}
