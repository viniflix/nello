import { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { getDietTemplateWithMeals } from '@/lib/supabase/template-queries';

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
        const { data, error } = await supabase
          .from('meal_templates')
          .select(`
            id, name, description, tags,
            meal_template_foods (
              id, food_id, quantity, unit, observation, order_index,
              food:food_id ( id, name, calories, protein, carbs, fat )
            )
          `)
          .eq('id', id)
          .single();

        if (error) throw error;
        setFormData({
          name: data.name || '',
          description: data.description || '',
          tags: data.tags || [],
          meals: [],
          foods: (data.meal_template_foods || [])
            .sort((a, b) => a.order_index - b.order_index)
            .map(f => ({
              _id: f.id,
              food_id: f.food_id,
              name: f.food?.name || '',
              food: f.food,
              quantity: f.quantity,
              unit: f.unit,
              observation: f.observation || '',
            })),
          ingredients: [],
          yield_quantity: 1,
          yield_unit: 'portion',
          preparation_method: '',
        });
      } else if (type === 'recipe') {
        const { data, error } = await supabase
          .from('recipes')
          .select(`
            id, name, description, preparation_method, yield_quantity, yield_unit,
            recipe_ingredients (
              id, food_id, quantity, unit,
              food:food_id ( id, name, calories, protein, carbs, fat )
            )
          `)
          .eq('id', id)
          .single();

        if (error) throw error;
        setFormData({
          name: data.name || '',
          description: data.description || '',
          tags: [],
          meals: [],
          foods: [],
          ingredients: (data.recipe_ingredients || []).map(f => ({
            _id: f.id,
            food_id: f.food_id,
            name: f.food?.name || '',
            food: f.food,
            quantity: f.quantity,
            unit: f.unit,
            observation: '',
          })),
          yield_quantity: data.yield_quantity || 1,
          yield_unit: data.yield_unit || 'portion',
          preparation_method: data.preparation_method || '',
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
    const { data: template, error: templateError } = await supabase
      .from('diet_templates')
      .insert({
        user_id: user.id,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        tags: formData.tags,
      })
      .select()
      .single();

    if (templateError) throw templateError;

    for (let i = 0; i < formData.meals.length; i++) {
      const meal = formData.meals[i];
      const { data: savedMeal, error: mealError } = await supabase
        .from('diet_template_meals')
        .insert({ template_id: template.id, name: meal.name, time: meal.time, order_index: i })
        .select()
        .single();

      if (mealError) throw mealError;

      if (meal.foods?.length > 0) {
        const { error: foodsError } = await supabase
          .from('diet_template_foods')
          .insert(meal.foods.map((food, fIdx) => ({
            meal_id: savedMeal.id,
            food_id: food.food_id,
            quantity: food.quantity,
            unit: food.unit,
            observation: food.observation || '',
            order_index: fIdx,
          })));
        if (foodsError) throw foodsError;
      }
    }

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
    // 1. UPDATE template principal
    const { error: updateError } = await supabase
      .from('diet_templates')
      .update({
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        tags: formData.tags,
        updated_at: new Date().toISOString(),
      })
      .eq('id', templateId)
      .eq('user_id', user.id);

    if (updateError) throw updateError;

    // 2. Refeições: obter IDs existentes no banco
    const { data: existingMeals } = await supabase
      .from('diet_template_meals')
      .select('id')
      .eq('template_id', templateId);

    const existingMealIds = new Set((existingMeals || []).map(m => m.id));
    const currentMealIds = new Set(formData.meals.filter(m => m._id).map(m => m._id));

    // Deletar refeições removidas
    const mealsToDelete = [...existingMealIds].filter(id => !currentMealIds.has(id));
    if (mealsToDelete.length > 0) {
      await supabase.from('diet_template_meals').delete().in('id', mealsToDelete);
    }

    // Upsert refeições e alimentos
    for (let i = 0; i < formData.meals.length; i++) {
      const meal = formData.meals[i];
      let mealId = meal._id;

      if (mealId) {
        // UPDATE refeição existente
        await supabase
          .from('diet_template_meals')
          .update({ name: meal.name, time: meal.time, order_index: i })
          .eq('id', mealId);
      } else {
        // INSERT nova refeição
        const { data: newMeal } = await supabase
          .from('diet_template_meals')
          .insert({ template_id: templateId, name: meal.name, time: meal.time, order_index: i })
          .select()
          .single();
        mealId = newMeal.id;
      }

      // Alimentos da refeição: obter IDs existentes
      const { data: existingFoods } = await supabase
        .from('diet_template_foods')
        .select('id')
        .eq('meal_id', mealId);

      const existingFoodIds = new Set((existingFoods || []).map(f => f.id));
      const currentFoodIds = new Set(meal.foods.filter(f => f._id).map(f => f._id));

      // Deletar alimentos removidos
      const foodsToDelete = [...existingFoodIds].filter(id => !currentFoodIds.has(id));
      if (foodsToDelete.length > 0) {
        await supabase.from('diet_template_foods').delete().in('id', foodsToDelete);
      }

      // Upsert alimentos
      for (let fIdx = 0; fIdx < meal.foods.length; fIdx++) {
        const food = meal.foods[fIdx];
        if (food._id) {
          await supabase
            .from('diet_template_foods')
            .update({ food_id: food.food_id, quantity: food.quantity, unit: food.unit, observation: food.observation || '', order_index: fIdx })
            .eq('id', food._id);
        } else {
          await supabase
            .from('diet_template_foods')
            .insert({ meal_id: mealId, food_id: food.food_id, quantity: food.quantity, unit: food.unit, observation: food.observation || '', order_index: fIdx });
        }
      }
    }

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
