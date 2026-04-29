import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TemplateBuilder() {
    const navigate = useNavigate();

    return (
        <div className="container mx-auto p-6 max-w-7xl space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Editor de Formulário</h1>
                </div>
            </div>

            <div className="bg-muted/30 border border-dashed rounded-lg p-12 text-center h-[50vh] flex flex-col items-center justify-center">
                <h3 className="text-lg font-medium text-muted-foreground mb-2">Em Construção (Sprint 3)</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                    O canvas visual do formbuilder será construído aqui. Painel esquerdo para itens, painel central de layout, painel direito de propriedades e bind de Zod Validation estática.
                </p>
            </div>
        </div>
    );
}
