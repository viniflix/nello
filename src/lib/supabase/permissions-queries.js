import { clinicalClient as supabase } from '@/infrastructure/supabase/domainClients';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

/**
 * Busca permissões por role
 * @param {string} role - nutritionist | patient | secretary | team | super_admin
 */
export const getPermissionsByRole = async (role) => {
    try {
        const { data, error } = await supabase
            .from('permissions')
            .select('role,module,can_view,can_edit,can_delete')
            .eq('role', role).order('module').limit(100);

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_permissoes", error);
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
