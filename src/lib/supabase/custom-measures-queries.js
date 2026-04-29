/**
 * Queries CRUD para medidas caseiras personalizadas do nutricionista.
 *
 * Tabela: nutritionist_custom_measures
 * - Cada nutricionista pode ter até 20 medidas pessoais.
 * - Toda medida define grams_equivalent (base para cálculos nutricionais).
 * - Ao excluir uma medida em uso, um trigger SQL converte automaticamente
 *   os registros em meal_plan_foods para gramas.
 */

import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

const MAX_CUSTOM_MEASURES = 20;

/**
 * Gera um code único para a medida baseado no nome + timestamp.
 * Formato: custom_<slug>_<ts6>
 */
const generateMeasureCode = (name) => {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 30);
  const ts = Date.now().toString(36).slice(-6);
  return `custom_${slug}_${ts}`;
};

/**
 * Busca todas as medidas personalizadas ativas do nutricionista logado.
 * @returns {Promise<{data: Array, error: object}>}
 */
export const getCustomMeasures = async () => {
  try {
    const { data, error } = await supabase
      .from('nutritionist_custom_measures')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('Erro ao buscar medidas personalizadas', error);
    return { data: [], error };
  }
};

/**
 * Busca todas as medidas (ativas e inativas) do nutricionista logado.
 * Usado para a tela de gerenciamento.
 * @returns {Promise<{data: Array, error: object}>}
 */
export const getAllCustomMeasures = async () => {
  try {
    const { data, error } = await supabase
      .from('nutritionist_custom_measures')
      .select('*')
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError('Erro ao buscar medidas personalizadas', error);
    return { data: [], error };
  }
};

/**
 * Conta quantas medidas o nutricionista já possui.
 * @returns {Promise<number>}
 */
export const countCustomMeasures = async () => {
  try {
    const { count, error } = await supabase
      .from('nutritionist_custom_measures')
      .select('id', { count: 'exact', head: true });

    if (error) throw error;
    return count || 0;
  } catch (error) {
    logSupabaseError('Erro ao contar medidas', error);
    return 0;
  }
};

/**
 * Cria uma nova medida caseira personalizada.
 * Valida limite de 20 antes de inserir (dupla validação: RLS também bloqueia).
 *
 * @param {{name: string, grams_equivalent: number, category?: string, description?: string}} payload
 * @returns {Promise<{data: object, error: object}>}
 */
export const createCustomMeasure = async (payload) => {
  try {
    const { name, grams_equivalent, category = 'volume', description } = payload;

    if (!name || name.trim().length < 2) {
      throw new Error('Nome deve ter pelo menos 2 caracteres.');
    }
    if (!grams_equivalent || Number(grams_equivalent) <= 0) {
      throw new Error('Equivalência em gramas deve ser maior que 0.');
    }

    // Verificar limite antes de tentar inserir (UX melhor que esperar erro do RLS)
    const count = await countCustomMeasures();
    if (count >= MAX_CUSTOM_MEASURES) {
      throw new Error(`Limite de ${MAX_CUSTOM_MEASURES} medidas personalizadas atingido.`);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado.');

    const code = generateMeasureCode(name.trim());

    const { data, error } = await supabase
      .from('nutritionist_custom_measures')
      .insert([{
        nutritionist_id: user.id,
        name: name.trim(),
        code,
        grams_equivalent: Number(grams_equivalent),
        category,
        description: description?.trim() || null,
        order_index: count,
      }])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('Erro ao criar medida personalizada', error);
    return { data: null, error };
  }
};

/**
 * Atualiza uma medida caseira personalizada.
 * Nota: o `code` não pode ser alterado (é referência em meal_plan_foods.unit).
 *
 * @param {number} id
 * @param {{name?: string, grams_equivalent?: number, category?: string, description?: string, is_active?: boolean}} payload
 * @returns {Promise<{data: object, error: object}>}
 */
export const updateCustomMeasure = async (id, payload) => {
  try {
    const { name, grams_equivalent, category, description, is_active } = payload;

    if (name !== undefined && name.trim().length < 2) {
      throw new Error('Nome deve ter pelo menos 2 caracteres.');
    }
    if (grams_equivalent !== undefined && Number(grams_equivalent) <= 0) {
      throw new Error('Equivalência em gramas deve ser maior que 0.');
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (grams_equivalent !== undefined) updateData.grams_equivalent = Number(grams_equivalent);
    if (category !== undefined) updateData.category = category;
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('nutritionist_custom_measures')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('Erro ao atualizar medida personalizada', error);
    return { data: null, error };
  }
};

/**
 * Exclui uma medida personalizada.
 * O trigger SQL `trg_ncm_before_delete` converte automaticamente
 * todos os meal_plan_foods que usavam esta medida para gramas.
 *
 * @param {number} id
 * @returns {Promise<{data: boolean, error: object}>}
 */
export const deleteCustomMeasure = async (id) => {
  try {
    const { error } = await supabase
      .from('nutritionist_custom_measures')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { data: true, error: null };
  } catch (error) {
    logSupabaseError('Erro ao excluir medida personalizada', error);
    return { data: false, error };
  }
};
