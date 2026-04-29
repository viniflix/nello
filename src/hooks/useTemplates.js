import { useState, useCallback, useEffect, useRef } from 'react';
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
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const lastFetched = useRef(null);
  const CACHE_TTL = 30_000; // 30 segundos

  const fetchTemplates = useCallback(async (force = false) => {
    if (!user) return;

    // Cache simples: evitar refetch desnecessário
    const now = Date.now();
    if (!force && lastFetched.current && now - lastFetched.current < CACHE_TTL) return;

    setLoading(true);
    setError(null);
    try {
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
      setTemplates(data || []);
      lastFetched.current = Date.now();
    } catch (err) {
      console.error(`[useTemplates] Error fetching ${type} templates:`, err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, type]);

  useEffect(() => {
    fetchTemplates(true); // force no mount ou mudança de tipo
  }, [fetchTemplates]);

  const deleteTemplate = async (templateId) => {
    if (!user) return false;

    try {
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

      setTemplates(prev => prev.filter(t => t.id !== templateId));
      lastFetched.current = null; // invalidar cache após delete
      return true;
    } catch (err) {
      console.error(`[useTemplates] Error deleting ${type} template:`, err.message);
      return false;
    }
  };

  return {
    templates,
    loading,
    error,
    fetchTemplates,
    deleteTemplate,
  };
}
