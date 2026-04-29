import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { calculateNutrition } from '@/lib/supabase/meal-plan-queries';
import { useAllMeasures } from '@/hooks/useHouseholdMeasures';
import { useFoodMeasures } from '@/hooks/useFoodMeasures';

const MeasureSelector = ({ food, quantity, unit, onQuantityChange, onUnitChange, onMeasureChange, onNutritionCalculated }) => {
    // Buscar medidas do sistema + medidas personalizadas do nutricionista
    const { data: allMeasures = [], isLoading } = useAllMeasures();

    // Buscar medidas específicas do alimento usando hook
    const { data: foodMeasures = [], isLoading: loadingFood } = useFoodMeasures(food?.id);

    const [measures, setMeasures] = useState([]);

    const loading = isLoading || loadingFood;

    useEffect(() => {
        if (allMeasures.length > 0) {
            const measuresWithFlags = allMeasures.map(measure => ({
                ...measure,
                hasSpecificConversion: measure.source === 'system'
                    ? foodMeasures.some(fm => fm.measure_id === measure.id)
                    : false,
            }));
            setMeasures(measuresWithFlags);
        }
    }, [allMeasures, foodMeasures]);

    useEffect(() => {
        if (food && quantity && unit) {
            calculateAndUpdate();
        }
    }, [food, quantity, unit]);

    const calculateAndUpdate = async () => {
        if (!food || !quantity || !unit) return;

        const nutrition = await calculateNutrition(food, parseFloat(quantity), unit);

        if (onNutritionCalculated) {
            onNutritionCalculated(nutrition);
        }
    };

    const handleUnitChange = (selectedUnit) => {
        onUnitChange(selectedUnit);

        // Se temos onMeasureChange, passar o objeto measure completo
        if (onMeasureChange) {
            const selectedMeasure = measures.find(m => m.code === selectedUnit);
            onMeasureChange(selectedMeasure || null);
        }
    };

    const groupedMeasures = measures.reduce((acc, measure) => {
        const category = measure.category || 'other';
        if (!acc[category]) acc[category] = [];
        acc[category].push(measure);
        return acc;
    }, {});

    const categoryLabels = {
        volume: 'Medidas de Volume',
        weight: 'Medidas de Peso',
        unit: 'Unidades',
        other: 'Outras',
        custom: 'Minhas Medidas',
    };

    return (
        <div className="grid grid-cols-2 gap-4">
            {/* Quantidade */}
            <div className="space-y-2">
                <Label htmlFor="quantity">
                    Quantidade <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="quantity"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Ex: 2"
                    value={quantity}
                    onChange={(e) => onQuantityChange(e.target.value)}
                    disabled={!food}
                />
            </div>

            {/* Medida */}
            <div className="space-y-2">
                <Label htmlFor="measure">
                    Medida <span className="text-destructive">*</span>
                </Label>
                <Select
                    value={unit}
                    onValueChange={handleUnitChange}
                    disabled={!food || loading}
                >
                    <SelectTrigger id="measure">
                        <SelectValue placeholder={loading ? "Carregando..." : "Selecione a medida"} />
                    </SelectTrigger>
                    <SelectContent
                        className="max-h-[300px]"
                        position="popper"
                        sideOffset={5}
                    >
                        <div className="overflow-y-auto max-h-[280px]">
                            {Object.entries(groupedMeasures).map(([category, categoryMeasures]) => (
                                <React.Fragment key={category}>
                                    {/* Cabeçalho da categoria */}
                                    <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground sticky top-0 bg-popover">
                                        {categoryLabels[category] || category}
                                    </div>

                                    {/* Medidas da categoria */}
                                    {categoryMeasures.map((measure) => (
                                        <SelectItem
                                            key={measure.code}
                                            value={measure.code}
                                            className="pl-6"
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <span className="flex items-center gap-1.5">
                                                    {measure.name}
                                                    {measure.source === 'custom' && (
                                                        <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">
                                                            Pessoal
                                                        </span>
                                                    )}
                                                </span>
                                                {measure.hasSpecificConversion && (
                                                    <span className="ml-2 text-xs text-primary">★</span>
                                                )}
                                            </div>
                                            {measure.source === 'custom' ? (
                                                <div className="text-xs text-emerald-600 font-medium">
                                                    1 unidade = {measure.grams_equivalent}g
                                                </div>
                                            ) : measure.description ? (
                                                <div className="text-xs text-muted-foreground">
                                                    {measure.description}
                                                </div>
                                            ) : null}
                                        </SelectItem>
                                    ))}
                                </React.Fragment>
                            ))}
                        </div>
                    </SelectContent>
                </Select>

                {/* Legenda para conversão específica */}
                {measures.some(m => m.hasSpecificConversion) && (
                    <p className="text-xs text-muted-foreground">
                        ★ = Conversão específica para este alimento
                    </p>
                )}
            </div>
        </div>
    );
};

export default MeasureSelector;
