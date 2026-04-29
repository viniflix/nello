import React, { useState, useEffect } from 'react';
import { Search, FileText, Loader2, ChevronRight, Check } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { useTemplates } from '@/hooks/useTemplates';
import { getDietTemplateWithMeals } from '@/lib/supabase/template-queries';

/**
 * Dialog para importar refeições específicas de um protocolo (template de dieta)
 * para o plano alimentar que está sendo criado/editado.
 */
export default function ImportMealFromProtocolDialog({ open, onOpenChange, nutritionistId, onImport }) {
    const { toast } = useToast();
    const { templates, loading: loadingTemplates, fetchTemplates } = useTemplates('diet');

    const [searchTerm, setSearchTerm]           = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [templateMeals, setTemplateMeals]     = useState([]);
    const [loadingMeals, setLoadingMeals]       = useState(false);
    const [selectedMealIds, setSelectedMealIds] = useState(new Set());
    const [importing, setImporting]             = useState(false);

    useEffect(() => { if (open) { fetchTemplates(); setSelectedTemplate(null); setTemplateMeals([]); setSelectedMealIds(new Set()); setSearchTerm(''); } }, [open, fetchTemplates]);

    useEffect(() => {
        if (!selectedTemplate) { setTemplateMeals([]); setSelectedMealIds(new Set()); return; }
    const load = async () => {
            setLoadingMeals(true);
            try {
                const { data } = await getDietTemplateWithMeals(selectedTemplate.id);
                const meals = data?.meals || [];
                setTemplateMeals(meals);
                // Pré-seleciona todas
                setSelectedMealIds(new Set(meals.map(m => m.id ?? m.tempId)));
            } catch (err) {
                console.error('[ImportMealFromProtocolDialog] Error loading template meals:', err.message);
            } finally {
                setLoadingMeals(false);
            }
        };
        load();
    }, [selectedTemplate]);

    const toggleMeal = (id) => setSelectedMealIds(prev => {
        const s = new Set(prev);
        s.has(id) ? s.delete(id) : s.add(id);
        return s;
    });

    const handleImport = async () => {
        if (!selectedTemplate || selectedMealIds.size === 0) return;
        setImporting(true);
        try {
            const mealsToImport = templateMeals.filter(m => selectedMealIds.has(m.id ?? m.tempId));
            await onImport(mealsToImport);
            toast({ title: 'Refeições importadas!', description: `${mealsToImport.length} refeição(ões) adicionada(s) ao plano.` });
        } catch (err) {
            toast({ title: 'Erro ao importar', description: err.message, variant: 'destructive' });
        } finally {
            setImporting(false);
        }
    };

    const filtered = (templates || []).filter(t =>
        !searchTerm || t.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-emerald-600" />
                        Importar Refeições de um Protocolo
                    </DialogTitle>
                    <DialogDescription>
                        Selecione um protocolo e marque as refeições que deseja adicionar ao plano atual.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-1 gap-5 overflow-hidden mt-2 min-h-0">
                    {/* Coluna esquerda: lista de protocolos */}
                    <div className="w-2/5 flex flex-col border-r pr-5 min-h-0">
                        <div className="relative mb-3 flex-shrink-0">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar protocolo..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <ScrollArea className="flex-1">
                            {loadingTemplates ? (
                                <div className="flex items-center justify-center py-10">
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 text-sm">
                                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                    Nenhum protocolo encontrado
                                </div>
                            ) : (
                                <div className="space-y-2 pr-2">
                                    {filtered.map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => setSelectedTemplate(t)}
                                            className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                                                selectedTemplate?.id === t.id
                                                    ? 'border-emerald-500 bg-emerald-50'
                                                    : 'border-slate-200 hover:border-emerald-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-slate-800 truncate">{t.name}</p>
                                                {t.description && (
                                                    <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{t.description}</p>
                                                )}
                                            </div>
                                            {selectedTemplate?.id === t.id && <ChevronRight className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>

                    {/* Coluna direita: refeições do protocolo selecionado */}
                    <div className="flex-1 flex flex-col min-h-0">
                        {!selectedTemplate ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                <FileText className="w-12 h-12 opacity-20" />
                                <p className="text-sm">Selecione um protocolo à esquerda</p>
                            </div>
                        ) : loadingMeals ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                            </div>
                        ) : templateMeals.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                <p className="text-sm">Este protocolo não tem refeições.</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                                    <p className="text-sm font-semibold text-slate-700">
                                        Refeições de <span className="text-emerald-700">{selectedTemplate.name}</span>
                                    </p>
                                    <button
                                        onClick={() => setSelectedMealIds(
                                            selectedMealIds.size === templateMeals.length
                                                ? new Set()
                                                : new Set(templateMeals.map(m => m.id ?? m.tempId))
                                        )}
                                        className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                                    >
                                        {selectedMealIds.size === templateMeals.length ? 'Desmarcar todas' : 'Selecionar todas'}
                                    </button>
                                </div>
                                <ScrollArea className="flex-1">
                                    <div className="space-y-2 pr-2">
                                        {templateMeals.map(meal => {
                                            const id = meal.id ?? meal.tempId;
                                            return (
                                                <div
                                                    key={id}
                                                    onClick={() => toggleMeal(id)}
                                                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                                        selectedMealIds.has(id)
                                                            ? 'border-emerald-400 bg-emerald-50'
                                                            : 'border-slate-200 hover:border-slate-300'
                                                    }`}
                                                >
                                                    <Checkbox
                                                        checked={selectedMealIds.has(id)}
                                                        onCheckedChange={() => toggleMeal(id)}
                                                        className="mt-0.5 flex-shrink-0"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-slate-800 truncate">{meal.name}</p>
                                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                            {meal.meal_time && (
                                                                <Badge variant="outline" className="text-xs py-0">{meal.meal_time}</Badge>
                                                            )}
                                                            {meal.foods?.length > 0 && (
                                                                <span className="text-xs text-slate-400">{meal.foods.length} alimento(s)</span>
                                                            )}
                                                            {meal.calories > 0 && (
                                                                <span className="text-xs text-slate-500 font-medium">{Math.round(meal.calories)} kcal</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {selectedMealIds.has(id) && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </>
                        )}
                    </div>
                </div>

                <DialogFooter className="pt-4 border-t">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={!selectedTemplate || selectedMealIds.size === 0 || importing}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                        {importing ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importando...</>
                        ) : (
                            `Importar ${selectedMealIds.size > 0 ? `${selectedMealIds.size} ` : ''}refeição(ões)`
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
