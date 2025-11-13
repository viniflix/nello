import React, { useState } from 'react';
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
import CascadeMeasureSelector from './CascadeMeasureSelector';

const AddFoodToMealDialog = ({ isOpen, onClose, onAdd, mealName }) => {
    const [selectedFood, setSelectedFood] = useState(null);
    const [quantity, setQuantity] = useState('');
    const [unit, setUnit] = useState('');
    const [selectedMeasure, setSelectedMeasure] = useState(null);
    const [notes, setNotes] = useState('');
    const [calculatedNutrition, setCalculatedNutrition] = useState(null);
    const [showFoodSelector, setShowFoodSelector] = useState(false);
    const [errors, setErrors] = useState({});

    const handleFoodSelect = (food) => {
        setSelectedFood(food);
        setShowFoodSelector(false);
        // Resetar quantidade e unidade ao trocar alimento
        setQuantity('');
        setUnit('');
        setCalculatedNutrition(null);
    };

    const handleNutritionCalculated = (nutrition) => {
        setCalculatedNutrition(nutrition);
    };

    const validate = () => {
        const newErrors = {};

        if (!selectedFood) {
            newErrors.food = 'Selecione um alimento';
        }

        if (!quantity || parseFloat(quantity) <= 0) {
            newErrors.quantity = 'Quantidade deve ser maior que zero';
        }

        if (!unit) {
            newErrors.unit = 'Selecione uma medida';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleAdd = () => {
        if (!validate()) return;

        const foodData = {
            food_id: selectedFood.id,
            food: selectedFood, // Para exibição
            quantity: parseFloat(quantity),
            unit,
            measure: selectedMeasure, // Objeto measure completo para tradução
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
        setQuantity('');
        setUnit('');
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
                        <DialogTitle>Adicionar Alimento</DialogTitle>
                        <DialogDescription>
                            {mealName ? `Adicionar alimento à refeição: ${mealName}` : 'Adicionar novo alimento'}
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

                        {/* Seletor de Quantidade e Medida em Cascata */}
                        <div className="space-y-2">
                            <CascadeMeasureSelector
                                food={selectedFood}
                                quantity={quantity}
                                unit={unit}
                                onQuantityChange={setQuantity}
                                onUnitChange={setUnit}
                                onMeasureChange={setSelectedMeasure}
                                onNutritionCalculated={handleNutritionCalculated}
                            />
                            {errors.quantity && (
                                <p className="text-xs text-destructive">{errors.quantity}</p>
                            )}
                            {errors.unit && (
                                <p className="text-xs text-destructive">{errors.unit}</p>
                            )}
                        </div>

                        {/* Valores Nutricionais Calculados */}
                        {calculatedNutrition && (
                            <Alert className="bg-primary/5">
                                <AlertDescription>
                                    <div className="font-semibold mb-2">Valores Nutricionais (porção):</div>
                                    <div className="grid grid-cols-4 gap-4 text-sm">
                                        <div>
                                            <div className="text-muted-foreground">Calorias</div>
                                            <div className="font-bold text-lg">{calculatedNutrition.calories}</div>
                                            <div className="text-xs text-muted-foreground">kcal</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Proteínas</div>
                                            <div className="font-bold text-lg">{calculatedNutrition.protein}</div>
                                            <div className="text-xs text-muted-foreground">g</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Carboidratos</div>
                                            <div className="font-bold text-lg">{calculatedNutrition.carbs}</div>
                                            <div className="text-xs text-muted-foreground">g</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Gorduras</div>
                                            <div className="font-bold text-lg">{calculatedNutrition.fat}</div>
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
                            Adicionar
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
