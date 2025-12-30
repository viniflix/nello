import React, { useRef } from 'react';
import { Plus } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import SmartFoodForm from '@/components/nutrition/SmartFoodForm';

/**
 * QuickFoodCreateDialog - Dialog para criar alimentos customizados
 * 
 * Usa SmartFoodForm com wizard completo (5 passos)
 * O próprio SmartFoodForm gerencia os botões de navegação
 */
export default function QuickFoodCreateDialog({ 
    open, 
    onOpenChange, 
    initialName = '',
    onFoodCreated 
}) {
    const formRef = useRef(null);

    // Handle form submission (SmartFoodForm handles the actual save)
    const handleFoodCreated = (food) => {
        if (onFoodCreated) {
            onFoodCreated(food);
        }
        handleClose();
    };

    const handleClose = () => {
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5" />
                        Cadastrar Alimento Personalizado
                    </DialogTitle>
                    <DialogDescription>
                        Preencha o formulário passo a passo para criar um alimento customizado. Você pode buscar produtos no OpenFoodFacts ou preencher manualmente.
                    </DialogDescription>
                </DialogHeader>

                <SmartFoodForm
                    ref={formRef}
                    mode="full"
                    initialName={initialName}
                    onSuccess={handleFoodCreated}
                />
            </DialogContent>
        </Dialog>
    );
}
