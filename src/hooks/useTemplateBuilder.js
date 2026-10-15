import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/infrastructure/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { getDietTemplateWithMeals, getFoodsMapByIds } from '@/lib/supabase/template-queries';
import { useShadowDraft } from '@/hooks/useShadowDraft';

/**
 * Hook para criar e editar templates de nutrição.
 * @param {string} type - 'diet' | 'meal' | 'recipe'
 * @param {string|null} templateId - UUID para modo de edição, null para criação
 */
const emptyForm = () => ({ name: '', description: '', tags: [], meals: [], foods: [], ingredients: [],
  yield_quantity: 1, yield_unit: 'portion', preparation_method: '' });

export function useTemplateBuilder(type, templateId = null) {
  const { user } = useAuth();
  const ownerId = user?.id;
  const scope = JSON.stringify([ownerId || null, type, templateId]);
  const scopeRef = useRef(scope);
  const loadSequence = useRef(0);
  const saveSequence = useRef(0);
  if (scopeRef.current !== scope) {
    loadSequence.current += 1;
    saveSequence.current += 1;
    scopeRef.current = scope;
  }
  const saveLock = useRef(false);
  useEffect(() => () => { saveSequence.current += 1; loadSequence.current += 1; }, []);
  const [stateScope, setStateScope] = useState(scope);
  const [loadError, setLoadError] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(Boolean(templateId));
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState(null);
  const isEditMode = Boolean(templateId);

  const [formData, setFormDataState] = useState(emptyForm);
  const touchedRef = useRef(false);
  // Reset before committing the new context, so neither UI nor shadow receives the old draft.
  if (stateScope !== scope) {
    setStateScope(scope);
    setFormDataState(emptyForm());
    setLoadedUpdatedAt(null);
    setIsLoadingTemplate(Boolean(templateId && ownerId));
    setLoading(false);
    setLoadError(false);
    touchedRef.current = false;
    saveLock.current = false;
  }
  const shadow = useShadowDraft({
    ownerId,
    draftKey: `protocol:${type}:${templateId || 'new'}`,
    enabled: Boolean(ownerId && type)
  });
  const { ready: shadowReady, queue: queueShadow } = shadow;
  const setFormData = (next) => {
    touchedRef.current = true;
    setFormDataState(next);
  };
  useEffect(() => {
    if (touchedRef.current && !isLoadingTemplate && !loadError && shadowReady) queueShadow({ formData });
  }, [formData, isLoadingTemplate, loadError, shadowReady, queueShadow]);
  const restoreShadow = () => {
    const value = shadow.restore();
    if (value?.formData) {
      touchedRef.current = true;
      setFormDataState(value.formData);
    }
  };

  // Carregar dados do template em modo de edição
  useEffect(() => {
    const generation = ++loadSequence.current;
    const isCurrent = () => scopeRef.current === scope && loadSequence.current === generation;
    if (!templateId || !ownerId) {
      setIsLoadingTemplate(false);
      return;
    }
    loadTemplate(templateId, isCurrent);
    return () => { loadSequence.current += 1; saveSequence.current += 1; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, ownerId, type, scope, loadRevision]);

  const loadTemplate = async (id, isCurrent) => {
    setIsLoadingTemplate(true);
    setLoadError(false);
    try {
      if (type === 'diet') {
        const { data, error } = await getDietTemplateWithMeals(id);
        if (!isCurrent()) return;
        if (error) throw error;
        if (!data) throw new Error('template_not_found');
        if (!touchedRef.current) {
          setFormDataState({
            name: data.name || '',
            description: data.description || '',
            tags: data.tags || [],
            meals: (data.meals || []).map(m => ({
              _id: m.id,
              name: m.name,
              time: m.time || m.meal_time || '12:00',
              foods: (m.foods || []).map(f => ({
                _id: f.id,
                food_id: f.food_id,
                name: f.food?.name || '',
                food: f.food,
                quantity: f.quantity,
                unit: f.unit,
                measure: null,
                observation: f.observation || '',
              })),
            })),
            foods: [],
            ingredients: [],
            yield_quantity: 1,
            yield_unit: 'portion',
            preparation_method: '',
          });
        }
      } else if (type === 'meal') {
        const { data: mealData, error } = await supabase
          .from('meal_templates')
          .select(`
            id, name, description, tags, updated_at,
            meal_template_foods (
              id, food_id, quantity, unit, observation, order_index
            )
          `)
          .eq('id', id)
          .single();

        if (!isCurrent()) return;
        if (error) throw error;
        if (!mealData) throw new Error('template_not_found');

        // Fetch food details
        const foodIds = (mealData.meal_template_foods || []).map(f => f.food_id);
        const foodsMap = await getFoodsMapByIds(foodIds);
        if (!isCurrent() || touchedRef.current) return;
        setLoadedUpdatedAt(mealData.updated_at);

        setFormDataState({
          name: mealData.name || '',
          description: mealData.description || '',
          tags: mealData.tags || [],
          meals: [],
          foods: (mealData.meal_template_foods || [])
            .sort((a, b) => a.order_index - b.order_index)
            .map(f => {
              const foodDetails = foodsMap[f.food_id];
              return {
                _id: f.id,
                food_id: f.food_id,
                name: foodDetails?.name || '',
                food: foodDetails,
                quantity: f.quantity,
                unit: f.unit,
                observation: f.observation || '',
              };
            }),
          ingredients: [],
          yield_quantity: 1,
          yield_unit: 'portion',
          preparation_method: '',
        });
      } else if (type === 'recipe') {
        const { data: recipeData, error } = await supabase
          .from('recipes')
          .select(`
            id, name, description, preparation_method, yield_quantity, yield_unit, updated_at,
            recipe_ingredients (
              id, food_id, quantity, unit
            )
          `)
          .eq('id', id)
          .single();

        if (!isCurrent()) return;
        if (error) throw error;
        if (!recipeData) throw new Error('template_not_found');

        // Fetch food details
        const foodIds = (recipeData.recipe_ingredients || []).map(f => f.food_id);
        const foodsMap = await getFoodsMapByIds(foodIds);
        if (!isCurrent() || touchedRef.current) return;
        setLoadedUpdatedAt(recipeData.updated_at);

        setFormDataState({
          name: recipeData.name || '',
          description: recipeData.description || '',
          tags: [],
          meals: [],
          foods: [],
          ingredients: (recipeData.recipe_ingredients || []).map(f => {
            const foodDetails = foodsMap[f.food_id];
            return {
              _id: f.id,
              food_id: f.food_id,
              name: foodDetails?.name || '',
              food: foodDetails,
              quantity: f.quantity,
              unit: f.unit,
              observation: '',
            };
          }),
          yield_quantity: recipeData.yield_quantity || 1,
          yield_unit: recipeData.yield_unit || 'portion',
          preparation_method: recipeData.preparation_method || '',
        });
      }
    } catch (err) {
      if (!isCurrent()) return;
      setLoadError(true);
      logDiagnostic('error', 'hooks/useTemplateBuilder.js:184', '[useTemplateBuilder] Error loading template:', err.message);
      toast({ title: 'Erro', description: 'Não foi possível carregar o template.', variant: 'destructive' });
    } finally {
      if (isCurrent()) setIsLoadingTemplate(false);
    }
  };

  // ─── CREATE ────────────────────────────────────────────────────────────────

  const saveDietTemplate = async () => {
    // Preparar os dados de refeições para enviar à RPC
    const mealsForRpc = formData.meals.map((m, mIdx) => ({
      name: m.name,
      time: m.time,
      order_index: mIdx,
      foods: (m.foods || []).map((f, fIdx) => ({
        food_id: f.food_id,
        quantity: f.quantity,
        unit: f.unit,
        observation: f.observation || '',
        order_index: fIdx
      }))
    }));

    const { error: templateError } = await supabase.rpc('create_diet_template', {
      p_user_id: user.id,
      p_name: formData.name.trim(),
      p_description: formData.description.trim() || null,
      p_tags: formData.tags || [],
      p_meals: mealsForRpc
    });

    if (templateError) throw templateError;

    return 'Dieta Padrão criada com sucesso!';
  };

  const saveMealTemplate = async () => {
    const { error } = await supabase.rpc('save_meal_template', {
      p_id: null,
      p_expected_updated_at: null,
      p_name: formData.name.trim(),
      p_description: formData.description.trim() || null,
      p_tags: formData.tags || [],
      p_foods: formData.foods.map(({ food_id, quantity, unit, observation }) => ({
        food_id, quantity, unit, observation: observation || '',
      })),
    });
    if (error) throw error;

    return 'Refeição salva com sucesso!';
  };

  const saveRecipe = async () => {
    const { error } = await supabase.rpc('save_recipe_template', {
      p_id: null,
      p_expected_updated_at: null,
      p_name: formData.name.trim(),
      p_description: formData.description.trim() || null,
      p_preparation_method: formData.preparation_method || null,
      p_yield_quantity: formData.yield_quantity,
      p_yield_unit: formData.yield_unit,
      p_ingredients: formData.ingredients.map(({ food_id, quantity, unit }) => ({ food_id, quantity, unit })),
    });
    if (error) throw error;

    return 'Receita criada com sucesso!';
  };

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  const updateDietTemplate = async () => {
    // Preparar os dados de refeições para enviar à RPC
    const mealsForRpc = formData.meals.map((m, mIdx) => ({
      name: m.name,
      time: m.time,
      order_index: mIdx,
      foods: (m.foods || []).map((f, fIdx) => ({
        food_id: f.food_id,
        quantity: f.quantity,
        unit: f.unit,
        observation: f.observation || '',
        order_index: fIdx
      }))
    }));

    const { error: updateError } = await supabase.rpc('update_diet_template', {
      p_template_id: templateId,
      p_user_id: user.id,
      p_name: formData.name.trim(),
      p_description: formData.description.trim() || null,
      p_tags: formData.tags || [],
      p_meals: mealsForRpc
    });

    if (updateError) throw updateError;

    return 'Dieta Padrão atualizada com sucesso!';
  };

  const updateMealTemplate = async () => {
    const { error } = await supabase.rpc('save_meal_template', {
      p_id: templateId,
      p_expected_updated_at: loadedUpdatedAt,
      p_name: formData.name.trim(),
      p_description: formData.description.trim() || null,
      p_tags: formData.tags || [],
      p_foods: formData.foods.map(({ food_id, quantity, unit, observation }) => ({
        food_id, quantity, unit, observation: observation || '',
      })),
    });
    if (error) throw error;

    return 'Refeição atualizada com sucesso!';
  };

  const updateRecipe = async () => {
    const { error } = await supabase.rpc('save_recipe_template', {
      p_id: templateId,
      p_expected_updated_at: loadedUpdatedAt,
      p_name: formData.name.trim(),
      p_description: formData.description.trim() || null,
      p_preparation_method: formData.preparation_method || null,
      p_yield_quantity: formData.yield_quantity,
      p_yield_unit: formData.yield_unit,
      p_ingredients: formData.ingredients.map(({ food_id, quantity, unit }) => ({ food_id, quantity, unit })),
    });
    if (error) throw error;

    return 'Receita atualizada com sucesso!';
  };

  // ─── SAVE (despachador) ────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!ownerId || isLoadingTemplate || loadError || saveLock.current) return;
    const saveScope = scope;
    const generation = ++saveSequence.current;
    const isCurrent = () => scopeRef.current === saveScope && generation === saveSequence.current;
    if (!formData.name.trim()) {
      toast({ title: 'Nome obrigatório', description: 'Informe um nome para o template.', variant: 'destructive' });
      return;
    }
    if (formData.name.trim().length > 100) {
      toast({ title: 'Nome muito longo', description: 'Máximo de 100 caracteres.', variant: 'destructive' });
      return;
    }

    saveLock.current = true;
    setLoading(true);
    try {
      let message;
      if (isEditMode) {
        if (type === 'diet') message = await updateDietTemplate();
        else if (type === 'meal') message = await updateMealTemplate();
        else if (type === 'recipe') message = await updateRecipe();
      } else {
        if (type === 'diet') message = await saveDietTemplate();
        else if (type === 'meal') message = await saveMealTemplate();
        else if (type === 'recipe') message = await saveRecipe();
      }
      if (!isCurrent()) return;
      await shadow.discard();
      if (!isCurrent()) return;
      toast({ title: 'Sucesso', description: message });
      navigate('/nutritionist/templates');
    } catch (err) {
      if (!isCurrent()) return;
      logDiagnostic('error', 'hooks/useTemplateBuilder.js:347', '[useTemplateBuilder] Save error:', err.message);
      toast({ title: 'Erro ao salvar', description: err.code === 'PT409'
        ? 'Este template foi alterado em outra sessão. Sua edição foi preservada. Revise a versão atual antes de salvar novamente.'
        : err.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      if (isCurrent()) { saveLock.current = false; setLoading(false); }
    }
  };

  return {
    ownerId,
    loading,
    isLoadingTemplate,
    isEditMode,
    loadError,
    retryLoad: () => { if (!touchedRef.current) setLoadRevision(value => value + 1); },
    formData,
    setFormData,
    handleSave,
    shadow,
    restoreShadow,
  };
}
