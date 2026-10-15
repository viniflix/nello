import {getTemplateCatalogPage} from '@/lib/supabase/template-catalog-queries';
import {useMemo} from 'react';
import {useQueryResource} from '@/hooks/useQueryResource';
import {queryRead} from '@/lib/utils/readPolicy';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/infrastructure/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook para gerenciar templates de nutrição.
 * Fontes de dados:
 *   - diet: diet_templates + diet_template_meals + diet_template_foods
 *   - meal: meal_templates + meal_template_foods
 *   - recipe: recipes + recipe_ingredients
 */
export function useTemplates(type = 'diet', { enabled = true, search = '' } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const queryKey=['templates',type,user?.id,String(search).trim().slice(0,100)];
  const catalog=useInfiniteQuery({
    queryKey,
    queryFn:queryRead(({signal,pageParam})=>getTemplateCatalogPage(user.id,type,{search,cursor:pageParam,signal})),
    initialPageParam:null,getNextPageParam:page=>page.nextCursor||undefined,
    enabled:!!user&&enabled,staleTime:30000,
  });
  const resource=useQueryResource(catalog,JSON.stringify([user?.id,type,search,'catalogue']),null);
  const templates=useMemo(()=>{
    const seen=new Set();return(resource.data?.pages||[]).flatMap(page=>page.items).filter(item=>{
      if(seen.has(item.id))return false;seen.add(item.id);return true;
    });
  },[resource.data]);
  const fetchTemplates=catalog.refetch,loading=catalog.isPending&&!!user&&enabled,error=catalog.error;

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
      queryClient.setQueriesData({queryKey:['templates', type, user?.id]}, (old) => {
        if (!old) return old;
        return {...old,pages:old.pages.map(page=>({...page,items:page.items.filter(t=>t.id!==deletedId)}))};
      });
      // Invalida para garantir sincronia no background
      queryClient.invalidateQueries({ queryKey: ['templates', type, user?.id] });
    },
    onError: (err) => {
      logDiagnostic('error', 'hooks/useTemplates.js:137', `[useTemplates] Error deleting ${type} template:`, err.message);
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
    hasMore:Boolean(catalog.hasNextPage),loadingMore:catalog.isFetchingNextPage,loadMore:catalog.fetchNextPage,
    error: error?.message || null,
    fetchTemplates,
    deleteTemplate,
  };
}
