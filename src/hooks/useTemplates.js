import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export function useTemplates(type = 'diet') {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTemplates = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      let data, fetchError;

      if (type === 'diet') {
        // Templates de dieta completa ficam em meal_plans com is_template = true
        ({ data, error: fetchError } = await supabase
          .from('meal_plans')
          .select('id, name, description, template_tags, active_days, created_at, updated_at')
          .eq('is_template', true)
          .eq('nutritionist_id', user.id)
          .order('created_at', { ascending: false }));

        // Normaliza para o formato esperado pelos componentes (campo "tags")
        if (data) {
          data = data.map(t => ({ ...t, tags: t.template_tags || [] }));
        }
      } else if (type === 'meal') {
        ({ data, error: fetchError } = await supabase
          .from('meal_templates')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }));
      } else if (type === 'recipe') {
        ({ data, error: fetchError } = await supabase
          .from('recipes')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }));
      } else {
        throw new Error('Invalid template type');
      }

      if (fetchError) throw fetchError;
      setTemplates(data || []);
    } catch (err) {
      console.error(`Error fetching ${type} templates:`, err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, type]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const deleteTemplate = async (templateId) => {
    if (!user) return false;

    try {
      let deleteError;

      if (type === 'diet') {
        // Templates de dieta ficam em meal_plans
        ({ error: deleteError } = await supabase
          .from('meal_plans')
          .delete()
          .eq('id', templateId)
          .eq('is_template', true)
          .eq('nutritionist_id', user.id));
      } else {
        const tableName = type === 'meal' ? 'meal_templates' : 'recipes';
        ({ error: deleteError } = await supabase
          .from(tableName)
          .delete()
          .eq('id', templateId)
          .eq('user_id', user.id));
      }

      if (deleteError) throw deleteError;

      setTemplates(prev => prev.filter(t => t.id !== templateId));
      return true;
    } catch (err) {
      console.error(`Error deleting ${type} template:`, err);
      return false;
    }
  };

  return {
    templates,
    loading,
    error,
    fetchTemplates,
    deleteTemplate
  };
}
