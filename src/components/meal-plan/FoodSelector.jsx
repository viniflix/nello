import React, { useState, useEffect } from 'react';
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

const FoodSelector = ({ isOpen, onClose, onSelect, targetGroup, targetCalories, originalFood }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [foods, setFoods] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedFood, setSelectedFood] = useState(null);
    const [sourceFilter, setSourceFilter] = useState(null);
    const [quickCreateOpen, setQuickCreateOpen] = useState(false);
    const [onlySameGroup, setOnlySameGroup] = useState(!!targetGroup);

    const sources = [
        { value: null, label: 'Todos' },
        { value: 'TACO', label: 'TACO' },
        { value: 'IBGE', label: 'IBGE' },
        { value: 'USDA', label: 'USDA' },
        { value: 'Tucunduva', label: 'Tucunduva' },
        { value: 'TBCA', label: 'TBCA' },
        { value: 'custom', label: 'Personalizados' }
    ];

    useEffect(() => {
        if (isOpen) {
            searchFoods();
        }
    }, [isOpen, searchTerm, sourceFilter, onlySameGroup]);

    const searchFoods = async () => {
        // Não buscar se o termo for curto demais
        if (searchTerm.length < 2) {
            setFoods([]);
            return;
        }

        // Evitar chamadas redundantes se já estiver carregando
        if (loading) return;

        setLoading(true);
        try {
            let query = supabase
                .from('foods')
                .select('id, name, group, description, source, calories, protein, carbs, fat, fiber, sodium')
                .eq('is_active', true)
                .ilike('name', `%${searchTerm}%`)
                .order('name', { ascending: true })
                .limit(50);

            if (sourceFilter) {
                query = query.eq('source', sourceFilter);
            }

            if (onlySameGroup && targetGroup) {
                query = query.eq('group', targetGroup);
            }

            const { data, error } = await query;

            if (error) throw error;
            setFoods(data || []);
        } catch (error) {
            console.error('Erro ao buscar alimentos:', error);
            setFoods([]);
        } finally {
            setLoading(false);
        }
    };

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
        
        // Optionally refresh search to ensure consistency
        if (searchTerm) {
            await searchFoods();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader className="shrink-0">
                    <DialogTitle>Buscar Alimento</DialogTitle>
                    <DialogDescription>
                        {targetCalories 
                            ? `Buscando substitutos para ~${Math.round(targetCalories)} kcal${targetGroup ? ` do grupo ${targetGroup}` : ''}`
                            : 'Procure alimentos por nome nas bases de dados nutricionais'
                        }
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col space-y-4 overflow-hidden">
                    {/* Barra de busca */}
                    <div className="shrink-0 space-y-2">
                        <Label htmlFor="search">Nome do Alimento</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
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
                            <Badge
                                key={source.value || 'all'}
                                variant={sourceFilter === source.value ? 'default' : 'outline'}
                                className="cursor-pointer"
                                onClick={() => setSourceFilter(source.value)}
                            >
                                {source.label}
                            </Badge>
                        ))}
                        
                        {targetGroup && (
                            <Badge
                                variant={onlySameGroup ? 'default' : 'outline'}
                                className={`cursor-pointer border-amber-300 ml-2 ${onlySameGroup ? 'bg-amber-500 hover:bg-amber-600' : 'text-amber-700'}`}
                                onClick={() => setOnlySameGroup(!onlySameGroup)}
                            >
                                {onlySameGroup ? 'Apenas ' : 'Filtrar por '}{targetGroup}
                            </Badge>
                        )}
                    </div>

                    {/* Lista de resultados */}
                    <div className="flex-1 min-h-0 border rounded-md p-4 overflow-y-auto">
                        {loading && (
                            <div className="text-center py-8 text-muted-foreground">
                                Buscando...
                            </div>
                        )}

                        {!loading && searchTerm.length < 2 && (
                            <div className="text-center py-8 text-muted-foreground">
                                Digite pelo menos 2 caracteres para buscar
                            </div>
                        )}

                        {!loading && searchTerm.length >= 2 && foods.length === 0 && (
                            <div className="text-center py-8 space-y-4">
                                <p className="text-muted-foreground">
                                    Nenhum alimento encontrado
                                </p>
                                <Button
                                    variant="outline"
                                    onClick={() => setQuickCreateOpen(true)}
                                    className="mx-auto"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Cadastrar '{searchTerm}' agora
                                </Button>
                            </div>
                        )}

                        {!loading && foods.length > 0 && (
                            <div className="space-y-2">
                                {foods.map((food) => {
                                    const analysis = originalFood ? getSubstitutionAnalysis({
                                        calories: (originalFood.calories / originalFood.quantity) * 100,
                                        protein: (originalFood.protein / originalFood.quantity) * 100,
                                        carbs: (originalFood.carbs / originalFood.quantity) * 100,
                                        fat: (originalFood.fat / originalFood.quantity) * 100,
                                        group: originalFood.food?.group
                                    }, food) : null;

                                    return (
                                        <div
                                            key={food.id}
                                            className={`
                                                p-3 border rounded-xl cursor-pointer transition-colors
                                                ${selectedFood?.id === food.id
                                                    ? 'bg-primary/10 border-primary'
                                                    : 'hover:bg-muted'
                                                }
                                            `}
                                            onClick={() => setSelectedFood(food)}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-semibold">{food.name}</h4>
                                                        {selectedFood?.id === food.id && (
                                                            <Check className="h-4 w-4 text-primary" />
                                                        )}
                                                        {analysis && (
                                                            <div className="flex gap-1">
                                                                {analysis.isRecommended ? (
                                                                    <Badge className="h-4 text-[9px] bg-green-100 text-green-700 border-green-200">
                                                                        Equivalente
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="outline" className="h-4 text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                                                                        Variação
                                                                    </Badge>
                                                                )}
                                                                {!analysis.groupMatch && (
                                                                    <Badge variant="outline" className="h-4 text-[9px] border-dashed">
                                                                        <FolderSync className="h-2 w-2 mr-1" />
                                                                        Grupo Dif.
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2 mt-1">
                                                        <Badge variant="outline" className="text-[10px] h-4">
                                                            {food.source || 'N/A'}
                                                        </Badge>
                                                        {food.group && (
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {food.group}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {analysis && !analysis.isRecommended && (
                                                        <div className="mt-1.5 text-[10px] text-destructive flex items-center gap-1 font-medium">
                                                            <AlertCircle className="h-2.5 w-2.5" />
                                                            {analysis.reason}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="ml-4 text-right text-sm">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <div className="font-bold">{food.calories} kcal</div>
                                                    </div>
                                                    <div className="text-muted-foreground text-[10px] mt-1 tabular-nums">
                                                        P:{food.protein.toFixed(1)} C:{food.carbs.toFixed(1)} G:{food.fat.toFixed(1)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="shrink-0 mt-4">
                    <Button variant="outline" onClick={handleClose}>
                        <X className="h-4 w-4 mr-2" />
                        Cancelar
                    </Button>
                    <Button onClick={handleSelect} disabled={!selectedFood}>
                        <Check className="h-4 w-4 mr-2" />
                        Selecionar
                    </Button>
                </DialogFooter>
            </DialogContent>

            {/* Quick Create Dialog */}
            <QuickFoodCreateDialog
                open={quickCreateOpen}
                onOpenChange={setQuickCreateOpen}
                initialName={searchTerm}
                onFoodCreated={handleFoodCreated}
            />
        </Dialog>
    );
};

export default FoodSelector;
