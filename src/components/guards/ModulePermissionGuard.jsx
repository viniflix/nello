import React from 'react';
import { Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Oculta o conteúdo se o usuário não tiver permissão de visualização no módulo.
 * Super_admin e nutritionist têm acesso total via permissions.
 */
export function ModulePermissionGuard({ children, module, action = 'view' }) {
    const { can, loading } = usePermissions();

    if (loading) return null;

    const hasAccess = action === 'view' ? can.view(module) : action === 'edit' ? can.edit(module) : can.delete(module);

    if (!hasAccess) {
        return (
            <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-3">
                        <Lock className="h-6 w-6 text-amber-600" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">Acesso restrito</h3>
                    <p className="text-sm text-muted-foreground">
                        Você não tem permissão para acessar este módulo.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return children;
}
