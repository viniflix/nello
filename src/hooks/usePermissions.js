import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getPermissionsByRole, canAccessModule } from '@/lib/supabase/permissions-queries';

/**
 * Hook que retorna permissões do usuário atual baseado no role
 */
export function usePermissions() {
    const { user } = useAuth();
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);

    const role = user?.profile?.role || user?.profile?.user_type || 'patient';

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!role) {
                setPermissions([]);
                setLoading(false);
                return;
            }
            setLoading(true);
            const { data } = await getPermissionsByRole(role);
            if (!cancelled) {
                setPermissions(data || []);
            }
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [role]);

    const can = useMemo(() => ({
        view: (module) => canAccessModule(permissions, module, 'view'),
        edit: (module) => canAccessModule(permissions, module, 'edit'),
        delete: (module) => canAccessModule(permissions, module, 'delete')
    }), [permissions]);

    return { permissions, loading, can, role };
}
