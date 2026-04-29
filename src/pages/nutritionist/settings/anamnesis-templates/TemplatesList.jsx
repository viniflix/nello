import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TemplatesList() {
    const navigate = useNavigate();

    return (
        <div className="container mx-auto p-6 max-w-7xl space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Biblioteca de Formulários</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Gerencie seus moldes e templates personalizados de anamnese.
                    </p>
                </div>
                <Button className="gap-2" onClick={() => navigate('new')}>
                    <Plus className="w-4 h-4" />
                    Novo Formulário
                </Button>
            </div>

            <div className="bg-muted/30 border border-dashed rounded-lg p-12 text-center">
                <h3 className="text-lg font-medium text-muted-foreground mb-2">Em Construção (Sprint 3)</h3>
                <p className="text-sm text-muted-foreground">
                    A listagem global de JSONB templates do construtor visual será exibida aqui.
                </p>
            </div>
        </div>
    );
}
