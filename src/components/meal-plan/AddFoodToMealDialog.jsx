import React, { useState, useEffect, useRef } from 'react';
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
import { PremiumPortionSelector } from '@/components/nutrition';
import { formatNutrient } from '@/lib/utils';
import { useShadowDraft } from '@/hooks/useShadowDraft';
import { ShadowRecovery, ShadowSaveStatus } from '@/components/ui/shadow-save-status';

const AddFoodToMealDialog = ({ isOpen, onClose, onAdd, mealName, initialData = null, ownerId, shadowKey }) => {
    const [selectedFood, setSelectedFood] = useState(null);
    const [portion, setPortion] = useState({ quantity: 100, measureId: null, measureCode: 'gram' });
    const [notes, setNotes] = useState('');
    const [patientDescription, setPatientDescription] = useState('');
    const [calculatedNutrition, setCalculatedNutrition] = useState(null);
    const [showFoodSelector, setShowFoodSelector] = useState(false);
    const [errors, setErrors] = useState({});
    const [isApplying, setIsApplying] = useState(false);
    const touchedRef = useRef(false);
    const shadow = useShadowDraft({ ownerId, draftKey: shadowKey, enabled: isOpen && Boolean(ownerId && shadowKey) });
    useEffect(() => {
        if (isOpen && shadow.ready && touchedRef.current) {
            shadow.queue({ selectedFood, portion, notes, patientDescription, calculatedNutrition });
        }
    }, [isOpen, shadow.ready, shadow.queue, selectedFood, portion, notes, patientDescription, calculatedNutrition]);
    const restoreShadow = () => {
        const value = shadow.restore();
        if (!value) return;
        touchedRef.current = true;
        setSelectedFood(value.selectedFood || null);
        setPortion(value.portion || { quantity: 100, measureId: null, measureCode: 'gram' });
        setNotes(value.notes || '');
        setPatientDescription(value.patientDescription || '');
        setCalculatedNutrition(value.calculatedNutrition || null);
    };

    // Popular campos quando está editando
    useEffect(() => {
        if (initialData) {
            setSelectedFood(initialData.food);
            // Suporta legado (unit numérico) e novo formato (unit = code string)
            const unitCode = initialData.unit === 'gram' || !initialData.unit
                ? 'gram'
                : initialData.unit;
            setPortion({
                quantity: initialData.quantity || 100,
                measureId: unitCode,
                measureCode: unitCode,
                measure: initialData.measure || null
            });
            setNotes(initialData.notes || '');
            setPatientDescription(initialData.patient_description || '');
            setCalculatedNutrition({
                calories: initialData.calories || 0,
                protein: initialData.protein || 0,
                carbs: initialData.carbs || 0,
                fat: initialData.fat || 0
            });
        }
    }, [initialData]);

    const handleFoodSelect = (food) => {
        touchedRef.current = true;
        setSelectedFood(food);
        setShowFoodSelector(false);
        // Resetar porção ao trocar alimento
        setPortion({ quantity: 100, measureId: null, measureCode: 'gram', measure: null });
        setCalculatedNutrition(null);
    };

    // Receber nutrição calculada do PortionSelector (fonte única de verdade)
    const handleNutritionChange = (nutrition) => {
        touchedRef.current = true;
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

    const handleAdd = async () => {
        if (isApplying) return;
        if (!validate()) return;

        const unitCode = portion.measureCode || portion.measureId || 'gram';
        const foodData = {
            food_id: selectedFood.id,
            food: selectedFood,
            quantity: portion.quantity,
            unit: unitCode,
            measure: portion.measure || null,
            calories: calculatedNutrition?.calories || 0,
            protein: calculatedNutrition?.protein || 0,
            carbs: calculatedNutrition?.carbs || 0,
            fat: calculatedNutrition?.fat || 0,
            notes: notes.trim() || null,
            patient_description: patientDescription.trim() || null
        };

        setIsApplying(true);
        try {
            const saved = await onAdd(foodData);
            if (saved === false) throw new Error('Não foi possível adicionar o alimento.');
            await shadow.discard();
            handleClose();
        } catch {
            setErrors((current) => ({ ...current, save: 'Não foi possível adicionar o alimento. O rascunho foi mantido.' }));
        } finally {
            setIsApplying(false);
        }
    };

    const handleClose = () => {
        touchedRef.current = false;
        setSelectedFood(null);
        setPortion({ quantity: 100, measureId: null, measureCode: 'gram', measure: null });
        setNotes('');
        setPatientDescription('');
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

                    {ownerId && shadowKey && <div className="space-y-2">
                        <ShadowRecovery recovery={shadow.recovery} onRestore={restoreShadow} onDiscard={() => { void shadow.discardRecovery(); }} />
                        <ShadowSaveStatus status={shadow.status} onRetry={shadow.flush} />
                    </div>}

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
                                            Base 100g: {formatNutrient(selectedFood.calories)} kcal |
                                            P: {formatNutrient(selectedFood.protein)}g |
                                            C: {formatNutrient(selectedFood.carbs)}g |
                                            G: {formatNutrient(selectedFood.fat)}g
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

                        {/* Nome para o Paciente */}
                        <div className="space-y-2">
                            <Label htmlFor="patientDescription">Descrição para o paciente</Label>
                            <p className="text-[11px] text-muted-foreground">
                                O nome abaixo será exibido no material do plano alimentar do paciente. Ajuste se quiser usar a nomenclatura mais familiar para ele.
                            </p>
                            <div className="relative">
                                <Textarea
                                    id="patientDescription"
                                    rows={1}
                                    placeholder={selectedFood ? `Ex: ${selectedFood.name}` : "Ex: Banana prata média"}
                                    value={patientDescription}
                                    onChange={(e) => { touchedRef.current = true; setPatientDescription(e.target.value); }}
                                    className="pr-20"
                                />
                                {patientDescription && (
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        className="absolute right-2 top-2 h-7 text-[10px] text-muted-foreground hover:text-primary border hover:bg-primary/5"
                                        onClick={() => { touchedRef.current = true; setPatientDescription(''); }}
                                    >
                                        Restaurar nome original
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Seletor de Porção (Premium) */}
                        <div className="space-y-2">
                            <PremiumPortionSelector
                                food={selectedFood}
                                value={portion}
                                onChange={(value) => { touchedRef.current = true; setPortion(value); }}
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
                                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 sm:gap-4">
                                        <div>
                                            <div className="text-muted-foreground text-xs">Calorias</div>
                                            <div className="font-bold text-lg">{Math.round(calculatedNutrition.calories)}</div>
                                            <div className="text-xs text-muted-foreground">kcal</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-xs">Proteínas</div>
                                            <div className="font-bold text-lg">{(calculatedNutrition.protein || 0).toFixed(1)}</div>
                                            <div className="text-xs text-muted-foreground">g</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-xs">Carboidratos</div>
                                            <div className="font-bold text-lg">{(calculatedNutrition.carbs || 0).toFixed(1)}</div>
                                            <div className="text-xs text-muted-foreground">g</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-xs">Gorduras</div>
                                            <div className="font-bold text-lg">{(calculatedNutrition.fat || 0).toFixed(1)}</div>
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
                                onChange={(e) => { touchedRef.current = true; setNotes(e.target.value); }}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        {errors.save && <p role="alert" className="text-xs text-destructive">{errors.save}</p>}
                        <Button variant="outline" onClick={handleClose} disabled={isApplying}>
                            <X className="h-4 w-4 mr-2" />
                            Cancelar
                        </Button>
                        <Button onClick={handleAdd} disabled={isApplying}>
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
