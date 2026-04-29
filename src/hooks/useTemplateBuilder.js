import { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';

export function useTemplateBuilder(type, templateId = null) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tags: [],
    meals: [], // Para dietas
    foods: [], // Para refeições independentes
    ingredients: [], // Para receitas
    yield_quantity: 1,
    yield_unit: 'portion',
    preparation_method: ''
  });

  const saveDietTemplate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Criar Template Principal
      const { data: template, error: templateError } = await supabase
        .from('diet_templates')
        .insert({
          user_id: user.id,
          name: formData.name,
          description: formData.description,
          tags: formData.tags
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // 2. Inserir Refeições e Alimentos associados
      for (let i = 0; i < formData.meals.length; i++) {
        const meal = formData.meals[i];
        const { data: savedMeal, error: mealError } = await supabase
          .from('diet_template_meals')
          .insert({
            template_id: template.id,
            name: meal.name,
            time: meal.time,
            order_index: i
          })
          .select()
          .single();

        if (mealError) throw mealError;

        if (meal.foods && meal.foods.length > 0) {
          const foodsToInsert = meal.foods.map((food, fIdx) => ({
            meal_id: savedMeal.id,
            food_id: food.food_id,
            quantity: food.quantity,
            unit: food.unit,
            observation: food.observation || '',
            order_index: fIdx
          }));

          const { error: foodsError } = await supabase
            .from('diet_template_foods')
            .insert(foodsToInsert);

          if (foodsError) throw foodsError;
        }
      }

      toast({ title: 'Sucesso', description: 'Dieta Padrão salva com sucesso!' });
      navigate('/nutritionist/templates');
    } catch (err) {
      console.error('Error saving diet template:', err);
      toast({ title: 'Erro', description: 'Erro ao salvar dieta padrão.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const saveMealTemplate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: template, error: templateError } = await supabase
        .from('meal_templates')
        .insert({
          user_id: user.id,
          name: formData.name,
          description: formData.description,
          tags: formData.tags
        })
        .select()
        .single();

      if (templateError) throw templateError;

      if (formData.foods && formData.foods.length > 0) {
        const foodsToInsert = formData.foods.map((food, fIdx) => ({
          meal_template_id: template.id,
          food_id: food.food_id,
          quantity: food.quantity,
          unit: food.unit,
          observation: food.observation || '',
          order_index: fIdx
        }));

        const { error: foodsError } = await supabase
          .from('meal_template_foods')
          .insert(foodsToInsert);

        if (foodsError) throw foodsError;
      }

      toast({ title: 'Sucesso', description: 'Refeição isolada salva com sucesso!' });
      navigate('/nutritionist/templates');
    } catch (err) {
      console.error('Error saving meal template:', err);
      toast({ title: 'Erro', description: 'Erro ao salvar refeição isolada.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const saveRecipe = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          user_id: user.id,
          name: formData.name,
          description: formData.description,
          preparation_method: formData.preparation_method,
          yield_quantity: formData.yield_quantity,
          yield_unit: formData.yield_unit
        })
        .select()
        .single();

      if (recipeError) throw recipeError;

      if (formData.ingredients && formData.ingredients.length > 0) {
        const ingredientsToInsert = formData.ingredients.map(ing => ({
          recipe_id: recipe.id,
          food_id: ing.food_id,
          quantity: ing.quantity,
          unit: ing.unit
        }));

        const { error: ingredientsError } = await supabase
          .from('recipe_ingredients')
          .insert(ingredientsToInsert);

        if (ingredientsError) throw ingredientsError;
      }

      toast({ title: 'Sucesso', description: 'Receita salva com sucesso!' });
      navigate('/nutritionist/templates');
    } catch (err) {
      console.error('Error saving recipe:', err);
      toast({ title: 'Erro', description: 'Erro ao salvar receita.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast({ title: 'Erro', description: 'O nome do template é obrigatório.', variant: 'destructive' });
      return;
    }

    if (type === 'diet') await saveDietTemplate();
    else if (type === 'meal') await saveMealTemplate();
    else if (type === 'recipe') await saveRecipe();
  };

  return {
    loading,
    formData,
    setFormData,
    handleSave
  };
}
