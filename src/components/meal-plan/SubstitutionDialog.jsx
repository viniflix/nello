import React, { useState, useEffect } from 'react';
import { Search, X, Trash2, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import FoodSelector from './FoodSelector';
import { getSuggestedSubstitutes } from '@/lib/supabase/meal-plan-queries';
import { Loader2, ChevronDown, ChevronUp, Scale, Info } from 'lucide-react';
import { getSubstitutionAnalysis, formatDiff } from '@/lib/utils/foodSubstitution';
import { Progress } from '@/components/ui/progress';

const SubstitutionDialog = ({ isOpen, onClose, originalFood, initialSubstitutes = [], onSave }) => {
    const [substitutes, setSubstitutes] = useState([]);
    const [showFoodSelector, setShowFoodSelector] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [allSuggestionsPool, setAllSuggestionsPool] = useState([]); // Buffer para devolver à lista
    const [expandedId, setExpandedId] = useState(null);

    // Efeito para carregar o estado inicial quando o diálogo abrir para um alimento específico
    useEffect(() => {
        if (isOpen && originalFood) {
            setSubstitutes(initialSubstitutes || []);
            loadSuggestions();
        } else if (!isOpen) {
            // Limpar estados ao fechar para evitar vazamento de memória ou flashes de dados antigos
            setSuggestions([]);
            setLoadingSuggestions(false);
        }
    }, [isOpen, originalFood?.id, originalFood?.tempId]);

    const loadSuggestions = async () => {
        if (!originalFood?.food?.group || loadingSuggestions) return;
        
        setLoadingSuggestions(true);
        try {
            const baseKcal = (originalFood.calories / originalFood.quantity) * 100;
            const { data } = await getSuggestedSubstitutes(originalFood.food.group, baseKcal);
            const pool = data || [];
            setAllSuggestionsPool(pool);
            
            // Filtrar itens que já estão na lista de substitutos iniciais
            const filtered = pool.filter(item => 
                !initialSubstitutes.some(s => String(s.id) === String(item.id))
            );
            setSuggestions(filtered);
        } catch (error) {
            console.error('Erro ao carregar sugestões:', error);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    const handleAddSubstitute = (food) => {
        if (!food) return;
        // Evitar duplicatas (usando String para maior segurança no match de IDs)
        if (substitutes.some(s => String(s.id) === String(food.id))) {
            setShowFoodSelector(false);
            return;
        }
        setSubstitutes(prev => [...prev, food]);
        // Se estava nas sugestões, remove de lá para não confundir
        setSuggestions(prev => prev.filter(s => String(s.id) !== String(food.id)));
        setShowFoodSelector(false);
    };

    const handleRemoveSubstitute = (foodId) => {
        const removed = substitutes.find(s => s.id === foodId);
        setSubstitutes(prev => prev.filter(s => s.id !== foodId));
        
        // Se este item estava no pool original de sugestões, devolve ele
        if (removed && allSuggestionsPool.some(s => String(s.id) === String(removed.id))) {
            setSuggestions(prev => [...prev, removed].sort((a, b) => a.calories - b.calories));
        }
    };

    const renderDelta = (val, limit = 2) => {
        if (Math.abs(val) < 0.1) return <span className="text-[10px] text-green-600 font-mono">OK</span>;
        const isOver = Math.abs(val) > limit;
        return (
            <span className={`text-[10px] px-1 rounded flex items-center gap-0.5 font-mono ${
                isOver 
                ? 'bg-destructive/10 text-destructive font-bold border border-destructive/20' 
                : 'bg-muted text-muted-foreground border border-transparent'
            }`}>
                {val > 0 ? '+' : '-'}{Math.abs(val).toFixed(1)}
                {isOver && val > 0 && <Plus className="h-2 w-2" />}
                {isOver && val < 0 && <X className="h-2 w-2 rotate-45" />}
            </span>
        );
    };

    const handleSave = () => {
        onSave(substitutes);
        onClose();
    };

    const renderSubstitutionDetail = (subFood, analysis) => {
        const originalBase = {
            kcal: (originalFood.calories / originalFood.quantity) * 100,
            p: (originalFood.protein / originalFood.quantity) * 100,
            c: (originalFood.carbs / originalFood.quantity) * 100,
            g: (originalFood.fat / originalFood.quantity) * 100
        };

        const macros = [
            { label: 'Prot', orig: originalBase.p, sub: subFood.protein, color: 'bg-blue-500' },
            { label: 'Carb', orig: originalBase.c, sub: subFood.carbs, color: 'bg-amber-500' },
            { label: 'Gord', orig: originalBase.g, sub: subFood.fat, color: 'bg-rose-500' }
        ];

        return (
            <div className="mt-4 p-4 bg-muted/50 rounded-xl border border-dashed animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2 mb-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <Scale className="h-3 w-3" />
                    Comparativo Detalhado (Base 100g)
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Visualização de Macros */}
                    <div className="space-y-4">
                        {macros.map(m => {
                            const max = Math.max(m.orig, m.sub, 1);
                            return (
                                <div key={m.label} className="space-y-1.5">
                                    <div className="flex justify-between text-[10px] font-bold uppercase">
                                        <span>{m.label}</span>
                                        <span className={Math.abs(m.sub - m.orig) > 2 ? 'text-destructive' : 'text-green-600'}>
                                            {m.sub.toFixed(1)}g vs {m.orig.toFixed(1)}g
                                        </span>
                                    </div>
                                    <div className="relative h-2 w-full bg-muted rounded-full overflow-hidden">
                                        <div 
                                            className={`absolute left-0 top-0 h-full ${m.color} opacity-30`} 
                                            style={{ width: `${(m.orig / max) * 100}%` }}
                                        />
                                        <div 
                                            className={`absolute left-0 top-0 h-full ${m.color}`} 
                                            style={{ width: `${(m.sub / max) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Vantagens / Observações */}
                    <div className="flex flex-col justify-center bg-background p-3 rounded-lg border text-xs space-y-3">
                        <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Análise Clínica:</p>
                                <p className="text-muted-foreground leading-relaxed mt-0.5">
                                    {analysis.isRecommended 
                                        ? "Esta substituição mantém o equilíbrio nutricional planejado." 
                                        : `Variação expressiva identificada: ${analysis.reason}.`}
                                </p>
                            </div>
                        </div>
                        {subFood.fiber > (originalFood.fiber || 0) && (
                            <div className="flex items-center gap-2 text-green-600 font-semibold">
                                <Plus className="h-3 w-3" />
                                Maior teor de fibras (+{(subFood.fiber - (originalFood.fiber || 0)).toFixed(1)}g)
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Substituições de Alimento</DialogTitle>
                        <DialogDescription>
                            Diferença tolerada de ±30 kcal e ±2g de macros para ser considerado ideal.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                        {/* Alimento Original */}
                        {originalFood && (
                            <div className="p-4 bg-muted rounded-lg border">
                                <Label className="text-xs uppercase text-muted-foreground font-bold">Alimento Referência (Base 100g)</Label>
                                <div className="mt-1 flex justify-between items-center">
                                    <div>
                                        <div className="font-semibold">{originalFood.patient_description || originalFood.food?.name}</div>
                                        <div className="text-sm text-muted-foreground italic">Valores proporcionais para comparação</div>
                                    </div>
                                    <div className="flex gap-4 text-xs font-mono">
                                        <div className="text-center p-1 px-2 bg-background rounded">
                                            <div className="text-muted-foreground text-[10px]">Kcal</div>
                                            <div className="font-bold">{Math.round((originalFood.calories / originalFood.quantity) * 100)}</div>
                                        </div>
                                        <div className="text-center p-1 px-2 bg-background rounded">
                                            <div className="text-muted-foreground text-[10px]">P</div>
                                            <div className="font-bold">{((originalFood.protein / originalFood.quantity) * 100).toFixed(1)}</div>
                                        </div>
                                        <div className="text-center p-1 px-2 bg-background rounded">
                                            <div className="text-muted-foreground text-[10px]">C</div>
                                            <div className="font-bold">{((originalFood.carbs / originalFood.quantity) * 100).toFixed(1)}</div>
                                        </div>
                                        <div className="text-center p-1 px-2 bg-background rounded">
                                            <div className="text-muted-foreground text-[10px]">G</div>
                                            <div className="font-bold">{((originalFood.fat / originalFood.quantity) * 100).toFixed(1)}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SUGESTÕES AUTOMÁTICAS */}
                        {loadingSuggestions ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Buscando sugestões de mesmo grupo...
                            </div>
                        ) : suggestions.length > 0 && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs uppercase text-muted-foreground font-bold">Alimentos Sugeridos ({originalFood?.food?.group})</Label>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {suggestions.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => handleAddSubstitute(s)}
                                            className="text-left p-2 border rounded-lg bg-card hover:bg-green-50 hover:border-green-200 transition-all group"
                                        >
                                            <div className="text-[11px] font-semibold truncate leading-tight group-hover:text-green-700">{s.name}</div>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[10px] text-muted-foreground">{Math.round(s.calories)} kcal</span>
                                                <Plus className="h-3 w-3 text-muted-foreground group-hover:text-green-600" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <Label className="text-base font-semibold">Lista de Substitutos:</Label>
                                <Button size="sm" onClick={() => setShowFoodSelector(true)}>
                                    <Search className="h-4 w-4 mr-2" />
                                    Buscar Alimento
                                </Button>
                            </div>

                            {substitutes.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed rounded-xl text-muted-foreground bg-muted/20">
                                    Nenhum substituto selecionado. Busque alimentos para comparar.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 max-h-[450px] overflow-y-auto pr-2">
                                    {substitutes.map(sub => {
                                        const analysis = getSubstitutionAnalysis({
                                            calories: (originalFood.calories / originalFood.quantity) * 100,
                                            protein: (originalFood.protein / originalFood.quantity) * 100,
                                            carbs: (originalFood.carbs / originalFood.quantity) * 100,
                                            fat: (originalFood.fat / originalFood.quantity) * 100,
                                            fiber: (originalFood.fiber / originalFood.quantity) * 100,
                                            group: originalFood.food?.group
                                        }, sub);
                                        
                                        const isExpanded = expandedId === sub.id;

                                        return (
                                            <div key={sub.id} className={`flex flex-col p-3 border rounded-xl transition-all ${analysis.isRecommended ? 'bg-green-50/20 border-green-100' : 'bg-card'}`}>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : sub.id)}>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold">{sub.name}</span>
                                                            {analysis.isRecommended ? (
                                                                <Badge className="h-5 text-[10px] bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
                                                                    Equivalente Nutricional
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="h-5 text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                                                    Variação Significativa
                                                                </Badge>
                                                            )}
                                                            {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground mt-1 flex gap-4 items-center">
                                                            <div className="flex items-center gap-1.5 p-0.5 rounded">
                                                                <span className="font-bold text-foreground">{sub.calories} kcal</span>
                                                                {renderDelta(analysis.diffs.calories, 30)}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 p-0.5 rounded">
                                                                <span>P: {sub.protein.toFixed(1)}g</span>
                                                                {renderDelta(analysis.diffs.protein, 2)}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 p-0.5 rounded">
                                                                <span>C: {sub.carbs.toFixed(1)}g</span>
                                                                {renderDelta(analysis.diffs.carbs, 2)}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 p-0.5 rounded">
                                                                <span>G: {sub.fat.toFixed(1)}g</span>
                                                                {renderDelta(analysis.diffs.fat, 2)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                                                            className="h-8 w-8 p-0"
                                                        >
                                                            <Info className="h-4 w-4 text-muted-foreground" />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            onClick={() => handleRemoveSubstitute(sub.id)}
                                                            className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>

                                                {isExpanded && renderSubstitutionDetail(sub, analysis)}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>


                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                        <Button onClick={handleSave}>Salvar Substituições</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <FoodSelector
                isOpen={showFoodSelector}
                onClose={() => setShowFoodSelector(false)}
                onSelect={handleAddSubstitute}
                targetGroup={originalFood?.food?.group}
                targetCalories={(originalFood?.calories / originalFood?.quantity) * 100}
                originalFood={originalFood}
            />
        </>
    );
};

export default SubstitutionDialog;
