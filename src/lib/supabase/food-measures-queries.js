/**
 * Queries do Supabase para o sistema de medidas caseiras
 *
 * Arquitetura:
 * - household_measures: medidas genéricas (34 medidas disponíveis)
 * - food_household_measures: associações específicas por alimento
 */

import { supabase } from '@/lib/customSupabaseClient';
import { calculateNutrition } from '@/lib/utils/nutrition-calculations';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

/**
 * Busca todas as medidas genéricas ativas
 * @returns {Promise<{data: Array, error: object}>}
 */
export const getAllHouseholdMeasures = async () => {
  try {
    const { data, error } = await supabase
      .from('household_measures')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('Erro ao buscar medidas caseiras', error);
    return { data: null, error };
  }
};

/**
 * Busca medidas caseiras cadastradas para um alimento específico
 * @param {number} foodId - ID do alimento
 * @returns {Promise<{data: Array, error: object}>}
 */
export const getFoodMeasures = async (foodId) => {
  try {
    const { data, error } = await supabase
      .from('food_household_measures')
      .select(`
        id,
        food_id,
        measure_id,
        quantity,
        grams,
        created_at,
        updated_at,
        measure:household_measures(
          id,
          name,
          code,
          category,
          description,
          ml_equivalent,
          grams_equivalent,
          order_index
        )
      `)
      .eq('food_id', foodId)
      .order('measure(order_index)', { ascending: true });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('Erro ao buscar medidas do alimento', error);
    return { data: null, error };
  }
};

/**
 * Busca uma medida específica por ID
 * @param {number} id - ID da food_household_measure
 * @returns {Promise<{data: object, error: object}>}
 */
export const getFoodMeasureById = async (id) => {
  try {
    const { data, error } = await supabase
      .from('food_household_measures')
      .select(`
        *,
        measure:household_measures(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    logSupabaseError('Erro ao buscar medida', error);
    return { data: null, error };
  }
};

/**
 * Cria nova associação alimento + medida caseira
 * REQUER: Usuário ser nutricionista (validar antes de chamar)
 * @param {object} payload - { food_id, measure_id, quantity?, grams }
 * @returns {Promise<{data: object, error: object}>}
 */
export const createFoodMeasure = async (payload) => {
  try {
    // Validações
    if (!payload.food_id) {
      throw new Error('food_id é obrigatório');
    }
    if (!payload.measure_id) {
      throw new Error('measure_id é obrigatório');
    }
    if (!payload.grams || payload.grams <= 0) {
      throw new Error('grams deve ser maior que 0');
    }

    const insertData = {
      food_id: payload.food_id,
      measure_id: payload.measure_id,
      quantity: payload.quantity || 1,
      grams: payload.grams,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('food_household_measures')
      .insert([insertData])
      .select(`
        *,
        measure:household_measures(*)
      `)
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    logSupabaseError('Erro ao criar medida caseira', error);
    return { data: null, error };
  }
};

/**
 * Atualiza uma medida caseira existente
 * REQUER: Usuário ser nutricionista (validar antes de chamar)
 * @param {number} id - ID da food_household_measure
 * @param {object} payload - { grams?, quantity? }
 * @returns {Promise<{data: object, error: object}>}
 */
export const updateFoodMeasure = async (id, payload) => {
  try {
    if (payload.grams !== undefined && payload.grams <= 0) {
      throw new Error('grams deve ser maior que 0');
    }
    if (payload.quantity !== undefined && payload.quantity <= 0) {
      throw new Error('quantity deve ser maior que 0');
    }

    const updateData = {
      ...payload,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('food_household_measures')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        measure:household_measures(*)
      `)
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    logSupabaseError('Erro ao atualizar medida caseira', error);
    return { data: null, error };
  }
};

/**
 * Deleta uma medida caseira
 * REQUER: Usuário ser nutricionista (validar antes de chamar)
 * Nota: Não remove a medida genérica, apenas a associação com o alimento
 * @param {number} id - ID da food_household_measure
 * @returns {Promise<{data: boolean, error: object}>}
 */
export const deleteFoodMeasure = async (id) => {
  try {
    const { error } = await supabase
      .from('food_household_measures')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { data: true, error: null };
  } catch (error) {
    logSupabaseError('Erro ao deletar medida caseira', error);
    return { data: false, error };
  }
};

/**
 * Calcula valores nutricionais com base em quantidade e medida
 * Versão atualizada para usar food_household_measures
 * @param {object} food - Alimento da tabela foods
 * @param {number} quantity - Quantidade
 * @param {number|null} measureId - ID da household_measure (null = gramas direto)
 * @param {Array} foodMeasures - Medidas cadastradas para o alimento (opcional, para evitar re-fetch)
 * @returns {Promise<{grams, calories, protein, carbs, fat, fiber, sodium}>}
 */
export const calculateNutritionFromMeasure = async (food, quantity, measureId, foodMeasures = null) => {
  try {
    let totalGrams = 0;

    if (measureId === null || measureId === 'gram') {
      // Usuário digitou em gramas direto
      totalGrams = quantity;
    } else {
      // Buscar medidas do alimento se não foram fornecidas
      if (!foodMeasures) {
        const { data } = await getFoodMeasures(food.id);
        foodMeasures = data || [];
      }

      // Procurar medida específica cadastrada
      const foodMeasure = foodMeasures.find(m => m.measure_id === measureId);

      if (foodMeasure) {
        // Usar conversão específica do alimento
        totalGrams = foodMeasure.grams * (quantity / foodMeasure.quantity);
      } else {
        // Fallback: usar conversão padrão da medida genérica
        const { data: measure } = await supabase
          .from('household_measures')
          .select('grams_equivalent')
          .eq('id', measureId)
          .single();

        if (measure && measure.grams_equivalent) {
          totalGrams = measure.grams_equivalent * quantity;
        } else {
          // Último fallback: usar portion_size do alimento
          totalGrams = (food.portion_size || 100) * quantity;
        }
      }
    }

    // Se não conseguiu determinar peso, retornar zeros
    if (!totalGrams || totalGrams <= 0) {
      return {
        grams: 0,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: null,
        sodium: null
      };
    }

    // Calcular todos os nutrientes (recalcula calorias baseado nos macros)
    return calculateNutrition(food, totalGrams);
  } catch (error) {
    logSupabaseError('Erro ao calcular nutrição', error);
    return {
      grams: 0,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: null,
      sodium: null
    };
  }
};

/**
 * Verifica se um alimento tem medidas caseiras cadastradas
 * @param {number} foodId - ID do alimento
 * @returns {Promise<boolean>}
 */
export const foodHasMeasures = async (foodId) => {
  try {
    const { count, error } = await supabase
      .from('food_household_measures')
      .select('id', { count: 'exact', head: true })
      .eq('food_id', foodId);

    if (error) throw error;

    return count > 0;
  } catch (error) {
    logSupabaseError('Erro ao verificar medidas do alimento', error);
    return false;
  }
};
