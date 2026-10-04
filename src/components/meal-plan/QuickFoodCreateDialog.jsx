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
            <DialogContent data-meal-plan-dialog className="max-w-4xl max-h-[95dvh] overflow-y-auto max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:border-0 max-sm:bg-white [overflow-wrap:anywhere]">
                <DialogHeader>
                    <DialogTitle className="flex items-start gap-2 font-sans leading-snug tracking-normal">
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
