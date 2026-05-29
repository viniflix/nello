import { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { getDietTemplateWithMeals, getFoodsMapByIds } from '@/lib/supabase/template-queries';

/**
 * Hook para criar e editar templates de nutrição.
 * @param {string} type - 'diet' | 'meal' | 'recipe'
 * @param {string|null} templateId - UUID para modo de edição, null para criação
 */
export function useTemplateBuilder(type, templateId = null) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(Boolean(templateId));
  const isEditMode = Boolean(templateId);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tags: [],
    meals: [],
    foods: [],
    ingredients: [],
    yield_quantity: 1,
    yield_unit: 'portion',
    preparation_method: '',
  });

  // Carregar dados do template em modo de edição
  useEffect(() => {
    if (!templateId || !user) {
      setIsLoadingTemplate(false);
      return;
    }
    loadTemplate(templateId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, user]);

  const loadTemplate = async (id) => {
    setIsLoadingTemplate(true);
    try {
      if (type === 'diet') {
        const { data } = await getDietTemplateWithMeals(id);
        if (data) {
          setFormData({
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
            id, name, description, tags,
            meal_template_foods (
              id, food_id, quantity, unit, observation, order_index
            )
          `)
          .eq('id', id)
          .single();

        if (error) throw error;

        // Fetch food details
        const foodIds = (mealData.meal_template_foods || []).map(f => f.food_id);
        const foodsMap = await getFoodsMapByIds(foodIds);

        setFormData({
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
            id, name, description, preparation_method, yield_quantity, yield_unit,
            recipe_ingredients (
              id, food_id, quantity, unit
            )
          `)
          .eq('id', id)
          .single();

        if (error) throw error;

        // Fetch food details
        const foodIds = (recipeData.recipe_ingredients || []).map(f => f.food_id);
        const foodsMap = await getFoodsMapByIds(foodIds);

        setFormData({
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
      console.error('[useTemplateBuilder] Error loading template:', err.message);
      toast({ title: 'Erro', description: 'Não foi possível carregar o template.', variant: 'destructive' });
    } finally {
      setIsLoadingTemplate(false);
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

    toast({ title: 'Sucesso', description: 'Dieta Padrão criada com sucesso!' });
    navigate('/nutritionist/templates');
  };

  const saveMealTemplate = async () => {
    const { data: template, error } = await supabase
      .from('meal_templates')
      .insert({
        user_id: user.id,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        tags: formData.tags,
      })
      .select()
      .single();

    if (error) throw error;

    if (formData.foods?.length > 0) {
      const { error: foodsError } = await supabase
        .from('meal_template_foods')
        .insert(formData.foods.map((food, fIdx) => ({
          meal_template_id: template.id,
          food_id: food.food_id,
          quantity: food.quantity,
          unit: food.unit,
          observation: food.observation || '',
          order_index: fIdx,
        })));
      if (foodsError) throw foodsError;
    }

    toast({ title: 'Sucesso', description: 'Refeição salva com sucesso!' });
    navigate('/nutritionist/templates');
  };

  const saveRecipe = async () => {
    const { data: recipe, error } = await supabase
      .from('recipes')
      .insert({
        user_id: user.id,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        preparation_method: formData.preparation_method || null,
        yield_quantity: formData.yield_quantity,
        yield_unit: formData.yield_unit,
      })
      .select()
      .single();

    if (error) throw error;

    if (formData.ingredients?.length > 0) {
      const { error: ingError } = await supabase
        .from('recipe_ingredients')
        .insert(formData.ingredients.map(ing => ({
          recipe_id: recipe.id,
          food_id: ing.food_id,
          quantity: ing.quantity,
          unit: ing.unit,
        })));
      if (ingError) throw ingError;
    }

    toast({ title: 'Sucesso', description: 'Receita criada com sucesso!' });
    navigate('/nutritionist/templates');
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

    toast({ title: 'Sucesso', description: 'Dieta Padrão atualizada com sucesso!' });
    navigate('/nutritionist/templates');
  };

  const updateMealTemplate = async () => {
    const { error } = await supabase
      .from('meal_templates')
      .update({ name: formData.name.trim(), description: formData.description.trim() || null, tags: formData.tags, updated_at: new Date().toISOString() })
      .eq('id', templateId)
      .eq('user_id', user.id);

    if (error) throw error;

    // Substituir alimentos: delete all + insert
    await supabase.from('meal_template_foods').delete().eq('meal_template_id', templateId);
    if (formData.foods?.length > 0) {
      await supabase.from('meal_template_foods').insert(
        formData.foods.map((f, idx) => ({
          meal_template_id: templateId,
          food_id: f.food_id,
          quantity: f.quantity,
          unit: f.unit,
          observation: f.observation || '',
          order_index: idx,
        }))
      );
    }

    toast({ title: 'Sucesso', description: 'Refeição atualizada com sucesso!' });
    navigate('/nutritionist/templates');
  };

  const updateRecipe = async () => {
    const { error } = await supabase
      .from('recipes')
      .update({
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        preparation_method: formData.preparation_method || null,
        yield_quantity: formData.yield_quantity,
        yield_unit: formData.yield_unit,
        updated_at: new Date().toISOString(),
      })
      .eq('id', templateId)
      .eq('user_id', user.id);

    if (error) throw error;

    await supabase.from('recipe_ingredients').delete().eq('recipe_id', templateId);
    if (formData.ingredients?.length > 0) {
      await supabase.from('recipe_ingredients').insert(
        formData.ingredients.map(ing => ({
          recipe_id: templateId,
          food_id: ing.food_id,
          quantity: ing.quantity,
          unit: ing.unit,
        }))
      );
    }

    toast({ title: 'Sucesso', description: 'Receita atualizada com sucesso!' });
    navigate('/nutritionist/templates');
  };

  // ─── SAVE (despachador) ────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Nome obrigatório', description: 'Informe um nome para o template.', variant: 'destructive' });
      return;
    }
    if (formData.name.trim().length > 100) {
      toast({ title: 'Nome muito longo', description: 'Máximo de 100 caracteres.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      if (isEditMode) {
        if (type === 'diet') await updateDietTemplate();
        else if (type === 'meal') await updateMealTemplate();
        else if (type === 'recipe') await updateRecipe();
      } else {
        if (type === 'diet') await saveDietTemplate();
        else if (type === 'meal') await saveMealTemplate();
        else if (type === 'recipe') await saveRecipe();
      }
    } catch (err) {
      console.error('[useTemplateBuilder] Save error:', err.message);
      toast({ title: 'Erro ao salvar', description: err.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    isLoadingTemplate,
    isEditMode,
    formData,
    setFormData,
    handleSave,
  };
}
