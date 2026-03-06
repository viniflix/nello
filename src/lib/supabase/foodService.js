import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

/**
 * Food Service - Centralized food search with pagination
 * 
 * Uses search_foods RPC for optimized server-side search
 * Falls back to direct query with .range() if RPC is unavailable
 */

const ITEMS_PER_PAGE = 20;

/**
 * Busca medidas caseiras de um alimento (lazy load)
 * food_measures: reference_food_id ou nutritionist_food_id (label, weight_in_grams)
 * @param {string} foodId - ID do alimento (uuid, da view foods)
 * @returns {Promise<Array>} Lista de medidas {label, weight_in_grams, id}
 */
export async function getFoodMeasures(foodId) {
  if (!foodId) return [];
  try {
    const { data, error } = await supabase
      .from('food_measures')
      .select('id, label, weight_in_grams, reference_food_id, nutritionist_food_id')
      .or(`reference_food_id.eq.${foodId},nutritionist_food_id.eq.${foodId}`);
    if (error) throw error;
    return (data || []).map((m) => ({
      id: m.id,
      label: m.label,
      weight_in_grams: m.weight_in_grams,
      grams: m.weight_in_grams,
      quantity: 1
    }));
  } catch (error) {
    logSupabaseError('Error fetching food measures', error);
    return [];
  }
}

/**
 * Search foods with pagination (sem food_measures - use getFoodMeasures quando precisar)
 * @param {string} searchTerm - Search query
 * @param {number} page - Page number (0-indexed)
 * @param {string} source - Optional source filter
 * @param {boolean} includeMeasures - Se true, inclui food_measures (mais lento)
 * @returns {Promise<{data: Array, hasMore: boolean, total: number}>}
 */
export async function searchFoodsPaginated(searchTerm, page = 0, source = null, includeMeasures = false) {
  if (!searchTerm || searchTerm.trim().length < 2) {
    return { data: [], hasMore: false, total: 0 };
  }

  const offset = page * ITEMS_PER_PAGE;
  const limit = ITEMS_PER_PAGE;
  // view foods não tem relação direta com food_measures; use getFoodMeasures(id) quando precisar
  const selectFields = 'id, name, group, description, source, calories, protein, carbs, fat, fiber, sodium, portion_size';

  try {
    let query = supabase
      .from('foods')
      .select(selectFields, { count: 'exact' })
      .eq('is_active', true)
      .ilike('name', `%${searchTerm.trim()}%`)
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (source) {
      query = query.eq('source', source);
    }

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    return {
      data: data || [],
      hasMore: (offset + limit) < (count || 0),
      total: count || 0
    };
  } catch (error) {
    logSupabaseError('Error searching foods', error);
    throw error;
  }
}

/**
 * Search foods (simple, non-paginated - for backward compatibility)
 * @param {string} searchTerm - Search query
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>}
 */
export async function searchFoods(searchTerm, limit = 20) {
  const result = await searchFoodsPaginated(searchTerm, 0, null);
  return result.data.slice(0, limit);
}

/**
 * Create a new custom food (insert em nutritionist_foods)
 * @param {Object} foodData - { name, calories, protein, carbs, fat, nutritionist_id, ... }
 * @returns {Promise<{data: Object, error: Object}>}
 */
export async function createFood(foodData) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const nutritionistId = foodData.nutritionist_id || user?.id;
    if (!nutritionistId) {
      throw new Error('nutritionist_id é obrigatório para criar alimento custom');
    }

    const insertPayload = {
      nutritionist_id: nutritionistId,
      name: foodData.name,
      brand: foodData.description || foodData.brand || null,
      barcode: foodData.barcode || null,
      base_qty: foodData.portion_size ?? 100,
      base_unit: foodData.base_unit || 'g',
      energy_kcal: foodData.calories ?? 0,
      protein_g: foodData.protein ?? 0,
      carbohydrate_g: foodData.carbs ?? 0,
      lipid_g: foodData.fat ?? 0,
      fiber_g: foodData.fiber ?? 0,
      sodium_mg: foodData.sodium ?? null,
      saturated_fat_g: foodData.saturated_fat ?? 0,
      monounsaturated_fat_g: foodData.monounsaturated_fat ?? 0,
      polyunsaturated_fat_g: foodData.polyunsaturated_fat ?? 0,
      trans_fat_g: foodData.trans_fat ?? 0,
      cholesterol_mg: foodData.cholesterol ?? 0,
      sugar_g: foodData.sugar ?? 0,
      calcium_mg: foodData.calcium ?? null,
      iron_mg: foodData.iron ?? null,
      is_active: foodData.is_active ?? true
    };

    const { data, error } = await supabase
      .from('nutritionist_foods')
      .insert([insertPayload])
      .select('id, name, brand, barcode, base_qty, base_unit, energy_kcal, protein_g, carbohydrate_g, lipid_g, fiber_g, sodium_mg')
      .single();

    if (error) throw error;

    // Retornar no formato da view foods para compatibilidade
    const mapped = {
      id: data.id,
      name: data.name,
      group: null,
      description: data.brand,
      source: 'custom',
      calories: data.energy_kcal,
      protein: data.protein_g,
      carbs: data.carbohydrate_g,
      fat: data.lipid_g,
      fiber: data.fiber_g,
      sodium: data.sodium_mg,
      portion_size: data.base_qty
    };

    return { data: mapped, error: null };
  } catch (error) {
    logSupabaseError('Error creating food', error);
    return { data: null, error };
  }
}

