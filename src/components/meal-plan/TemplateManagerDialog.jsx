import React, { useState, useEffect } from 'react';
import { Search, FileText, Tag, Loader2, Copy } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { useTemplates } from '@/hooks/useTemplates';
import { cloneDietTemplateToPatient } from '@/lib/supabase/template-queries';
import { getMealPlanById } from '@/lib/supabase/meal-plan-queries';

export default function TemplateManagerDialog({ 
    open, 
    onOpenChange, 
    patientId, 
    nutritionistId,
    onTemplateApplied 
}) {
    const { toast } = useToast();
    const { templates, loading: loadingTemplates, fetchTemplates } = useTemplates('diet');
    
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredTemplates, setFilteredTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [applying, setApplying] = useState(false);

    useEffect(() => {
        if (open) {
            fetchTemplates();
        }
    }, [open, fetchTemplates]);

    useEffect(() => {
        let filtered = templates || [];
        if (searchTerm) {
            filtered = filtered.filter(t => 
                t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }
        setFilteredTemplates(filtered);
    }, [templates, searchTerm]);

    const handleApplyTemplate = async () => {
        if (!selectedTemplate || !patientId || !nutritionistId) return;

        setApplying(true);
        try {
            // Importa o template via RPC (Deep Copy no PostgreSQL)
            const newPlanId = await cloneDietTemplateToPatient(
                selectedTemplate.id, 
                patientId, 
                nutritionistId,
                selectedTemplate.name
            );

            toast({
                title: 'Template Aplicado!',
                description: `A dieta "${selectedTemplate.name}" foi importada com sucesso.`,
            });

            if (onTemplateApplied) {
                // Buscar o plano completo para atualizar o estado pai
                const { data: newPlan } = await getMealPlanById(newPlanId);
                onTemplateApplied(newPlan || { id: newPlanId });
            }

            onOpenChange(false);
        } catch (error) {
            console.error('Erro ao aplicar template:', error);
            toast({
                title: 'Erro',
                description: 'Falha ao importar o template. Verifique sua conexão.',
                variant: 'destructive'
            });
        } finally {
            setApplying(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-emerald-600" />
                        Importar Dieta Padrão
                    </DialogTitle>
                    <DialogDescription>
                        Selecione um template para aplicar ao paciente. Isso substituirá o plano atual não salvo.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-1 gap-6 overflow-hidden mt-4">
                    {/* Esquerda: Lista de Templates */}
                    <div className="w-1/2 flex flex-col border-r pr-6">
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar templates..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        <ScrollArea className="flex-1">
                            {loadingTemplates ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                                </div>
                            ) : filteredTemplates.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>Nenhum template encontrado</p>
                                </div>
                            ) : (
                                <div className="space-y-3 pr-3">
                                    {filteredTemplates.map(template => (
                                        <div
                                            key={template.id}
                                            onClick={() => setSelectedTemplate(template)}
                                            className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                                selectedTemplate?.id === template.id
                                                    ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                                                    : 'border-slate-200 hover:border-emerald-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            <h3 className="font-semibold text-slate-800">{template.name}</h3>
                                            {template.description && (
                                                <p className="text-sm text-slate-500 line-clamp-2 mt-1">
                                                    {template.description}
                                                </p>
                                            )}
                                            {template.tags && template.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-3">
                                                    {template.tags.map((tag, idx) => (
                                                        <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                                                            <Tag className="w-3 h-3 mr-1" />
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>

                    {/* Direita: Preview e Ação */}
                    <div className="w-1/2 flex flex-col justify-center items-center p-6 bg-slate-50 rounded-xl border border-slate-100">
                        {selectedTemplate ? (
                            <div className="text-center w-full max-w-sm">
                                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Copy className="w-8 h-8 text-emerald-600" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2">{selectedTemplate.name}</h3>
                                <p className="text-slate-500 mb-8">
                                    Você está prestes a importar este template completo para o paciente. Todas as refeições e alimentos serão copiados.
                                </p>
                                
                                <Button
                                    onClick={handleApplyTemplate}
                                    disabled={applying || !patientId}
                                    className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                    {applying ? (
                                        <>
                                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                            Importando...
                                        </>
                                    ) : (
                                        'Confirmar Importação'
                                    )}
                                </Button>
                            </div>
                        ) : (
                            <div className="text-center text-slate-400">
                                <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>Selecione um template à esquerda para continuar</p>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
