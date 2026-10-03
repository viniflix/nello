import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/customSupabaseClient';
import QuickFoodCreateDialog from './QuickFoodCreateDialog';
import { getSubstitutionAnalysis } from '@/lib/utils/foodSubstitution';
import { AlertCircle, FolderSync } from 'lucide-react';
import { formatNutrient } from '@/lib/utils';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { captureOperationalError } from '@/infrastructure/observability/telemetry';
import { Events, track } from '@/infrastructure/analytics/posthog';
import { foodPer100Grams, calculateNutrition } from '@/lib/utils/nutrition-calculations';
import { calculateEquivalentGrams } from '@/lib/utils/nutritionCalculations';
import { foodSuggestionQueries, mergeFoodSuggestions } from '@/lib/utils/foodSuggestions';

const SelectorSurface = ({ embedded, isOpen, onClose, children }) => embedded
    ? <section aria-label="Busca de alimentos" className="flex h-full min-h-[300px] flex-col gap-3">{children}</section>
    : <Dialog open={isOpen} onOpenChange={onClose}><DialogContent className="flex h-[94dvh] max-h-[calc(100dvh-1rem)] w-[96vw] max-w-[1440px] flex-col overflow-hidden">{children}</DialogContent></Dialog>;

const FoodSelector = ({ isOpen, onClose, onSelect, targetGroup, targetCalories, originalFood, mealType, embedded = false, searchInputRef, selectedFoodId = null }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [foods, setFoods] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedFood, setSelectedFood] = useState(null);
    const [sourceFilter, setSourceFilter] = useState(null);
    const [quickCreateOpen, setQuickCreateOpen] = useState(false);
    const [onlySameGroup, setOnlySameGroup] = useState(!!targetGroup);
    const [searchError, setSearchError] = useState(null);
    const [retryKey, setRetryKey] = useState(0);
    const requestId = useRef(0);
    const suggesting = searchTerm.trim().length === 0;
    const originalName = originalFood?.food?.name;
    const excludedId = originalFood?.food_id || originalFood?.food?.id;

    const sources = [
        { value: null, label: 'Todos' },
        { value: 'TACO', label: 'TACO' },
        { value: 'IBGE', label: 'IBGE' },
        { value: 'USDA', label: 'USDA' },
        { value: 'TUCUNDUVA', label: 'Tucunduva' },
        { value: 'TBCA', label: 'TBCA' },
        { value: 'custom', label: 'Personalizados' }
    ];

    useEffect(() => {
        const currentRequest = ++requestId.current;
        if (!isOpen || (!suggesting && searchTerm.trim().length < 2)) {
            setFoods([]);
            setLoading(false);
            setSearchError(null);
            return undefined;
        }
        setLoading(true);
        setSearchError(null);
        const controller = new AbortController();
        const timer = setTimeout(async () => {
          const started = performance.now();
          try {
            const queries = suggesting ? foodSuggestionQueries(mealType, targetGroup, originalName) : [searchTerm.trim().slice(0,120)];
            const results = await Promise.all(queries.map(term => supabase.rpc('search_foods_ranked', {
                p_query: term, p_source: sourceFilter,
                p_group: onlySameGroup && targetGroup ? targetGroup : null, p_limit: suggesting ? (originalName ? 3 : 2) : 50, p_offset: 0,
            }).abortSignal(controller.signal)));
            const failure = results.find(result => result.error);
            if (failure) throw failure.error;
            if (requestId.current === currentRequest) setFoods(suggesting ? mergeFoodSuggestions(results, excludedId) : (results[0].data || []).filter(food => food.id !== excludedId));
          } catch (error) {
            if (requestId.current === currentRequest) {
              setSearchError(toPortugueseError(error, 'Não foi possível buscar alimentos. Tente novamente.'));
              captureOperationalError(error, { operation: 'food_selector.search', module: 'meal_plan', source: 'supabase' });
            }
          } finally {
            if (requestId.current === currentRequest) {
              setLoading(false);
              track(Events.DATA_LOAD_TIMING, { operation: 'food_search', duration_ms: Math.round(performance.now() - started) });
            }
          }
        }, 300);
        return () => { clearTimeout(timer); requestId.current += 1; controller.abort(); };
    }, [isOpen, searchTerm, suggesting, mealType, originalName, excludedId, sourceFilter, onlySameGroup, targetGroup, retryKey]);

    const handleSelect = () => {
        if (selectedFood) {
            onSelect(selectedFood);
            handleClose();
        }
    };

    const handleClose = () => {
        setSearchTerm('');
        setFoods([]);
        setSelectedFood(null);
        setSourceFilter(null);
        onClose();
    };

    const handleFoodCreated = async (newFood) => {
        // Close quick create dialog
        setQuickCreateOpen(false);

        // Add the new food to the list (at the top)
        setFoods([newFood, ...foods]);

        // Automatically select it
        setSelectedFood(newFood);
        if (embedded) onSelect(newFood);

        // Optionally refresh search to ensure consistency
        if (searchTerm) setRetryKey(value => value + 1);
    };

    return (
        <>
            <SelectorSurface embedded={embedded} isOpen={isOpen} onClose={handleClose}>
                {!embedded && <DialogHeader className="shrink-0">
                    <DialogTitle>Buscar Alimento</DialogTitle>
                    <DialogDescription>
                        {targetCalories
                            ? `Buscando substitutos para ~${Math.round(targetCalories)} kcal${targetGroup ? ` do grupo ${targetGroup}` : ''}`
                            : 'Procure alimentos por nome nas bases de dados nutricionais'
                        }
                    </DialogDescription>
                </DialogHeader>}

                <div className="flex-1 min-h-0 flex flex-col space-y-4 overflow-hidden">
                    {/* Barra de busca */}
                    <div className="shrink-0 space-y-2">
                        <Label htmlFor="search">{embedded ? '1 · Escolha o alimento' : 'Nome do Alimento'}</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                ref={searchInputRef}
                                id="search"
                                placeholder="Digite pelo menos 2 caracteres..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Filtro de fonte */}
                    <div className="shrink-0 flex gap-2 flex-wrap items-center">
                        {sources.map((source) => (
                            <Button type="button" size="sm" aria-pressed={sourceFilter === source.value}
                                key={source.value || 'all'}
                                variant={sourceFilter === source.value ? 'default' : 'outline'}
                                className="cursor-pointer"
                                onClick={() => setSourceFilter(source.value)}
                            >
                                {source.label}
                            </Button>
                        ))}

                        {targetGroup && (
                            <Button type="button" size="sm" aria-pressed={onlySameGroup}
                                variant={onlySameGroup ? 'default' : 'outline'}
                                className="ml-2"
                                onClick={() => setOnlySameGroup(!onlySameGroup)}
                            >
                                {onlySameGroup ? 'Apenas ' : 'Filtrar por '}{targetGroup}
                            </Button>
                        )}
                    </div>

                    {/* Lista de resultados */}
                    {suggesting && <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"><p className="font-semibold">{originalFood ? 'Alternativas para comparar' : 'Alimentos comuns nesta refeição'}</p><p className="text-xs">{originalFood ? 'Selecione uma opção e confira a porção e os nutrientes.' : 'Escolha uma opção rápida ou pesquise qualquer outro alimento.'}</p></div>}
                    <div className="flex-1 min-h-0 rounded-lg border bg-background p-2 overflow-y-auto" aria-live="polite" aria-busy={loading}>
                        {loading && (
                            <div className="text-center py-8 text-muted-foreground">
                                Buscando...
                            </div>
                        )}

                        {!loading && !suggesting && searchTerm.trim().length < 2 && (
                            <div className="text-center py-8 text-muted-foreground">
                                Digite pelo menos 2 caracteres para buscar
                            </div>
                        )}

                        {!loading && searchError && (
                            <div role="alert" className="text-center py-8 space-y-3">
                                <p className="text-destructive">{searchError}</p>
                                <Button variant="outline" onClick={() => setRetryKey(value => value + 1)}>Tentar novamente</Button>
                            </div>
                        )}

                        {!loading && !searchError && (suggesting || searchTerm.trim().length >= 2) && foods.length === 0 && (
                            <div className="text-center py-8 space-y-4">
                                <p className="text-muted-foreground">
                                    {suggesting ? 'Sem opções rápidas nesta base. Pesquise pelo nome ou escolha outra base.' : 'Nenhum alimento encontrado'}
                                </p>
                                <Button
                                    variant="outline"
                                    onClick={() => setQuickCreateOpen(true)}
                                    className="mx-auto"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    {suggesting ? 'Cadastrar alimento personalizado' : `Cadastrar '${searchTerm}' agora`}
                                </Button>
                            </div>
                        )}

                        {!loading && !searchError && foods.length > 0 && (
                            <div className="space-y-2">
                                {foods.map((food) => {
                                    const candidateBasis = foodPer100Grams(food);
                                    const equivalentGrams = originalFood && candidateBasis ? calculateEquivalentGrams(originalFood.calories, food) : 0;
                                    const analysis = originalFood && candidateBasis && equivalentGrams > 0 ? getSubstitutionAnalysis({ ...originalFood, group: originalFood.food?.group }, { ...candidateBasis, ...calculateNutrition(candidateBasis, equivalentGrams) }) : null;

                                    return (
                                        <button type="button" aria-pressed={(embedded ? selectedFoodId : selectedFood?.id) === food.id}
                                            key={food.id}
                                            className={`
                                                w-full text-left p-3 border rounded-xl transition-colors
                                                ${(embedded ? selectedFoodId : selectedFood?.id) === food.id
                                                    ? 'bg-primary/10 border-primary'
                                                    : 'bg-white hover:border-primary/50 hover:bg-primary/5'
                                                }
                                            `}
                                            onClick={() => { setSelectedFood(food); if (embedded) onSelect(food); }}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-semibold">{food.name}</h4>
                                                        {(embedded ? selectedFoodId : selectedFood?.id) === food.id && (
                                                            <Check className="h-4 w-4 text-primary" />
                                                        )}
                                                        {analysis && (
                                                            <div className="flex gap-1">
                                                                {analysis.isRecommended ? (
                                                                    <Badge className="h-4 text-xs bg-green-100 text-green-700 border-green-200">
                                                                        Macros próximos
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="outline" className="h-4 text-xs bg-amber-50 text-amber-700 border-amber-200">
                                                                        Variação
                                                                    </Badge>
                                                                )}
                                                                {!analysis.groupMatch && (
                                                                    <Badge variant="outline" className="h-4 text-xs border-dashed">
                                                                        <FolderSync className="h-2 w-2 mr-1" />
                                                                        Grupo Dif.
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2 mt-1">
                                                        <Badge variant="outline" className="text-xs h-4">
                                                            {food.source || 'N/A'}
                                                        </Badge>
                                                        {food.group && (
                                                            <span className="text-xs text-muted-foreground">
                                                                {food.group}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {analysis && !analysis.isRecommended && (
                                                        <div className="mt-1.5 text-xs text-destructive flex items-center gap-1 font-medium">
                                                            <AlertCircle className="h-2.5 w-2.5" />
                                                            {analysis.reason}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="ml-4 text-right text-sm">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <div className="font-bold">{food.calories == null ? 'Não informado' : `${formatNutrient(food.calories)} kcal`}</div>
                                                        <span className="text-xs text-muted-foreground">por {food.source?.toLowerCase() === 'custom' && Number(food.portion_size) > 0 ? food.portion_size : 100} g</span>
                                                    </div>
                                                    <div className="text-muted-foreground text-xs mt-1 tabular-nums">
                                                        P:{(food.protein || 0).toFixed(1)} C:{(food.carbs || 0).toFixed(1)} G:{(food.fat || 0).toFixed(1)}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {embedded ? <Button type="button" variant="outline" className="shrink-0 justify-start gap-2" onClick={() => setQuickCreateOpen(true)}><Plus className="h-4 w-4" />Cadastrar alimento personalizado</Button> : <DialogFooter className="shrink-0 mt-4">
                    <Button variant="outline" onClick={handleClose}>
                        <X className="h-4 w-4 mr-2" />
                        Cancelar
                    </Button>
                    <Button onClick={handleSelect} disabled={!selectedFood}>
                        <Check className="h-4 w-4 mr-2" />
                        Selecionar
                    </Button>
                </DialogFooter>}
            </SelectorSurface>

            {/* Quick Create Dialog */}
            <QuickFoodCreateDialog
                open={quickCreateOpen}
                onOpenChange={setQuickCreateOpen}
                initialName={searchTerm}
                onFoodCreated={handleFoodCreated}
            />
        </>
    );
};

export default FoodSelector;
