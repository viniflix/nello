import React, { useState, useRef } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import SmartFoodForm from '@/components/nutrition/SmartFoodForm';

/**
 * QuickFoodCreateDialog - Dialog rápido para criar alimentos customizados
 * 
 * Refatorado para usar SmartFoodForm (unified component)
 * Mantém a mesma interface externa para compatibilidade
 */
export default function QuickFoodCreateDialog({ 
    open, 
    onOpenChange, 
    initialName = '',
    onFoodCreated 
}) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const formRef = useRef(null);

    // Handle form submission (SmartFoodForm handles the actual save)
    const handleFoodCreated = (food) => {
        setIsSubmitting(false);
        if (onFoodCreated) {
            onFoodCreated(food);
        }
        handleClose();
    };

    const handleSubmit = () => {
        if (formRef.current) {
            setIsSubmitting(true);
            formRef.current.submit();
        }
    };

    const handleClose = () => {
        setIsSubmitting(false);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5" />
                        Cadastrar Alimento Rápido
                    </DialogTitle>
                    <DialogDescription>
                        Crie um alimento customizado com busca por código de barras e cálculo automático
                    </DialogDescription>
                </DialogHeader>

                <SmartFoodForm
                    ref={formRef}
                    mode="compact"
                    initialName={initialName}
                    onSuccess={handleFoodCreated}
                />

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                        <X className="h-4 w-4 mr-2" />
                        Cancelar
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Criando...
                            </>
                        ) : (
                            <>
                                <Plus className="h-4 w-4 mr-2" />
                                Criar Alimento
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
