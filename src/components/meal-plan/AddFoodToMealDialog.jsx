import React, { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import FoodSelector from './FoodSelector';
import { PortionSelector } from '@/components/nutrition';

const AddFoodToMealDialog = ({ isOpen, onClose, onAdd, mealName, initialData = null }) => {
    const [selectedFood, setSelectedFood] = useState(null);
    const [portion, setPortion] = useState({ quantity: 100, measureId: null });
    const [notes, setNotes] = useState('');
    const [calculatedNutrition, setCalculatedNutrition] = useState(null);
    const [showFoodSelector, setShowFoodSelector] = useState(false);
    const [errors, setErrors] = useState({});

    // Popular campos quando está editando
    useEffect(() => {
        if (initialData) {
            setSelectedFood(initialData.food);
            setPortion({
                quantity: initialData.quantity || 100,
                measureId: initialData.unit === 'gram' ? null : initialData.unit
            });
            setNotes(initialData.notes || '');
            setCalculatedNutrition({
                calories: initialData.calories || 0,
                protein: initialData.protein || 0,
                carbs: initialData.carbs || 0,
                fat: initialData.fat || 0
            });
        }
    }, [initialData]);

    const handleFoodSelect = (food) => {
        setSelectedFood(food);
        setShowFoodSelector(false);
        // Resetar porção ao trocar alimento
        setPortion({ quantity: 100, measureId: null });
        setCalculatedNutrition(null);
    };

    // Receber nutrição calculada do PortionSelector (fonte única de verdade)
    const handleNutritionChange = (nutrition) => {
        setCalculatedNutrition(nutrition);
    };

    const validate = () => {
        const newErrors = {};

        if (!selectedFood) {
            newErrors.food = 'Selecione um alimento';
        }

        if (!portion.quantity || portion.quantity <= 0) {
            newErrors.portion = 'Quantidade deve ser maior que zero';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleAdd = () => {
        if (!validate()) return;

        const foodData = {
            food_id: selectedFood.id,
            food: selectedFood, // Para exibição
            quantity: portion.quantity,
            unit: portion.measureId || 'gram', // ID da medida ou 'gram'
            calories: calculatedNutrition?.calories || 0,
            protein: calculatedNutrition?.protein || 0,
            carbs: calculatedNutrition?.carbs || 0,
            fat: calculatedNutrition?.fat || 0,
            notes: notes.trim() || null
        };

        onAdd(foodData);
        handleClose();
    };

    const handleClose = () => {
        setSelectedFood(null);
        setPortion({ quantity: 100, measureId: null });
        setNotes('');
        setCalculatedNutrition(null);
        setErrors({});
        onClose();
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={handleClose}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{initialData ? 'Editar Alimento' : 'Adicionar Alimento'}</DialogTitle>
                        <DialogDescription>
                            {initialData
                                ? `Editar alimento: ${initialData.food?.name || ''}`
                                : mealName
                                    ? `Adicionar alimento à refeição: ${mealName}`
                                    : 'Adicionar novo alimento'
                            }
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Seletor de Alimento */}
                        <div className="space-y-2">
                            <Label>
                                Alimento <span className="text-destructive">*</span>
                            </Label>
                            {selectedFood ? (
                                <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                                    <div className="flex-1">
                                        <div className="font-semibold">{selectedFood.name}</div>
                                        <div className="text-sm text-muted-foreground">
                                            {selectedFood.group} • {selectedFood.source}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            Base 100g: {selectedFood.calories} kcal |
                                            P: {selectedFood.protein}g |
                                            C: {selectedFood.carbs}g |
                                            G: {selectedFood.fat}g
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowFoodSelector(true)}
                                    >
                                        Trocar
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => setShowFoodSelector(true)}
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Buscar Alimento
                                </Button>
                            )}
                            {errors.food && (
                                <p className="text-xs text-destructive">{errors.food}</p>
                            )}
                        </div>

                        {/* Seletor de Porção (Novo - Mais Simples) */}
                        <div className="space-y-2">
                            <PortionSelector
                                food={selectedFood}
                                value={portion}
                                onChange={setPortion}
                                showNutrition={false}
                                onNutritionChange={handleNutritionChange}
                            />
                            {errors.portion && (
                                <p className="text-xs text-destructive">{errors.portion}</p>
                            )}
                        </div>

                        {/* Valores Nutricionais Calculados */}
                        {calculatedNutrition && (
                            <Alert className="bg-primary/5">
                                <AlertDescription>
                                    <div className="font-semibold mb-2">Valores Nutricionais:</div>
                                    <div className="grid grid-cols-4 gap-4 text-sm">
                                        <div>
                                            <div className="text-muted-foreground text-xs">Calorias</div>
                                            <div className="font-bold text-lg">{Math.round(calculatedNutrition.calories)}</div>
                                            <div className="text-xs text-muted-foreground">kcal</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-xs">Proteínas</div>
                                            <div className="font-bold text-lg">{calculatedNutrition.protein.toFixed(1)}</div>
                                            <div className="text-xs text-muted-foreground">g</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-xs">Carboidratos</div>
                                            <div className="font-bold text-lg">{calculatedNutrition.carbs.toFixed(1)}</div>
                                            <div className="text-xs text-muted-foreground">g</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-xs">Gorduras</div>
                                            <div className="font-bold text-lg">{calculatedNutrition.fat.toFixed(1)}</div>
                                            <div className="text-xs text-muted-foreground">g</div>
                                        </div>
                                    </div>
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Observações */}
                        <div className="space-y-2">
                            <Label htmlFor="notes">Observações (opcional)</Label>
                            <Textarea
                                id="notes"
                                rows={2}
                                placeholder="Ex: sem sal, sem açúcar, etc."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={handleClose}>
                            <X className="h-4 w-4 mr-2" />
                            Cancelar
                        </Button>
                        <Button onClick={handleAdd}>
                            <Plus className="h-4 w-4 mr-2" />
                            {initialData ? 'Atualizar' : 'Adicionar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Food Selector Dialog */}
            <FoodSelector
                isOpen={showFoodSelector}
                onClose={() => setShowFoodSelector(false)}
                onSelect={handleFoodSelect}
            />
        </>
    );
};

export default AddFoodToMealDialog;
