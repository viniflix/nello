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
      let tableName = '';
      if (type === 'diet') tableName = 'diet_templates';
      else if (type === 'meal') tableName = 'meal_templates';
      else if (type === 'recipe') tableName = 'recipes';
      else throw new Error('Invalid template type');

      const { data, error: fetchError } = await supabase
        .from(tableName)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

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
      let tableName = '';
      if (type === 'diet') tableName = 'diet_templates';
      else if (type === 'meal') tableName = 'meal_templates';
      else if (type === 'recipe') tableName = 'recipes';
      
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', templateId)
        .eq('user_id', user.id);

      if (error) throw error;
      
      // Update local state
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
