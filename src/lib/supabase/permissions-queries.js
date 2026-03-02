import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

/**
 * Busca permissões por role
 * @param {string} role - nutritionist | patient | secretary | team | super_admin
 */
export const getPermissionsByRole = async (role) => {
    try {
        const { data, error } = await supabase
            .from('permissions')
            .select('*')
            .eq('role', role);

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar permissões', error);
        return { data: [], error };
    }
};

/**
 * Verifica se o role tem permissão para a ação no módulo
 */
export const canAccessModule = (permissions, module, action = 'view') => {
    const perm = (permissions || []).find((p) => p.module === module);
    if (!perm) return false;
    if (action === 'view') return perm.can_view === true;
    if (action === 'edit') return perm.can_edit === true;
    if (action === 'delete') return perm.can_delete === true;
    return false;
};
