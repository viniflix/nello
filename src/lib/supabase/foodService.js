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
 * Search foods with pagination
 * @param {string} searchTerm - Search query
 * @param {number} page - Page number (0-indexed)
 * @param {string} source - Optional source filter
 * @returns {Promise<{data: Array, hasMore: boolean, total: number}>}
 */
export async function searchFoodsPaginated(searchTerm, page = 0, source = null) {
  if (!searchTerm || searchTerm.trim().length < 2) {
    return { data: [], hasMore: false, total: 0 };
  }

  const offset = page * ITEMS_PER_PAGE;
  const limit = ITEMS_PER_PAGE;

  try {
    // Use direct query with .range() for efficient server-side pagination
    // The search_foods RPC doesn't support offset, so we use direct query for pagination
    // Include food_measures relation for household measures
    let query = supabase
      .from('foods')
      .select('id, name, group, description, source, calories, protein, carbs, fat, fiber, sodium, food_measures(*)', { count: 'exact' })
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
 * Create a new custom food
 * @param {Object} foodData - Food data (name, calories, protein, carbs, fat, etc.)
 * @returns {Promise<{data: Object, error: Object}>}
 */
export async function createFood(foodData) {
  try {
    // Select all fields that FoodSelector expects
    const { data, error } = await supabase
      .from('foods')
      .insert([foodData])
      .select('id, name, group, description, source, calories, protein, carbs, fat, fiber, sodium, portion_size')
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    logSupabaseError('Error creating food', error);
    return { data: null, error };
  }
}

