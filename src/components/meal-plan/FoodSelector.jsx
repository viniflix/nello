import React, { useState, useEffect } from 'react';
import { Search, X, Check } from 'lucide-react';
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

const FoodSelector = ({ isOpen, onClose, onSelect }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [foods, setFoods] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedFood, setSelectedFood] = useState(null);
    const [sourceFilter, setSourceFilter] = useState(null);

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
    }, [isOpen, searchTerm, sourceFilter]);

    const searchFoods = async () => {
        if (searchTerm.length < 2) {
            setFoods([]);
            return;
        }

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

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-3xl max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle>Buscar Alimento</DialogTitle>
                    <DialogDescription>
                        Procure alimentos por nome nas bases de dados nutricionais
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Barra de busca */}
                    <div className="space-y-2">
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
                    <div className="flex gap-2 flex-wrap">
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
                    </div>

                    {/* Lista de resultados */}
                    <ScrollArea className="h-[400px] border rounded-md p-4">
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
                            <div className="text-center py-8 text-muted-foreground">
                                Nenhum alimento encontrado
                            </div>
                        )}

                        {!loading && foods.length > 0 && (
                            <div className="space-y-2">
                                {foods.map((food) => (
                                    <div
                                        key={food.id}
                                        className={`
                                            p-3 border rounded-lg cursor-pointer transition-colors
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
                                                </div>
                                                <div className="flex gap-2 mt-1">
                                                    <Badge variant="outline" className="text-xs">
                                                        {food.source || 'N/A'}
                                                    </Badge>
                                                    {food.group && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {food.group}
                                                        </span>
                                                    )}
                                                </div>
                                                {food.description && (
                                                    <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                                                        {food.description}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="ml-4 text-right text-sm">
                                                <div className="font-semibold">{food.calories} kcal</div>
                                                <div className="text-muted-foreground text-xs">
                                                    P: {food.protein}g | C: {food.carbs}g | G: {food.fat}g
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>

                <DialogFooter>
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
        </Dialog>
    );
};

export default FoodSelector;
