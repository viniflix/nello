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
import { supabase } from '@/lib/customSupabaseClient';
import { calculateNutrition } from '@/lib/supabase/meal-plan-queries';

const MeasureSelector = ({ food, quantity, unit, onQuantityChange, onUnitChange, onMeasureChange, onNutritionCalculated }) => {
    const [measures, setMeasures] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadMeasures();
    }, [food]);

    useEffect(() => {
        if (food && quantity && unit) {
            calculateAndUpdate();
        }
    }, [food, quantity, unit]);

    const loadMeasures = async () => {
        setLoading(true);
        try {
            // Buscar medidas padrão
            const { data: standardMeasures, error } = await supabase
                .from('household_measures')
                .select('*')
                .eq('is_active', true)
                .order('order_index', { ascending: true });

            if (error) throw error;

            // Verificar se há conversões específicas para este alimento
            if (food) {
                const { data: specificConversions } = await supabase
                    .from('food_measure_conversions')
                    .select('measure_code, household_measures(name, description)')
                    .eq('food_id', food.id);

                // Marcar medidas que têm conversão específica
                const measuresWithFlags = (standardMeasures || []).map(measure => ({
                    ...measure,
                    hasSpecificConversion: (specificConversions || []).some(
                        conv => conv.measure_code === measure.code
                    )
                }));

                setMeasures(measuresWithFlags);
            } else {
                setMeasures(standardMeasures || []);
            }
        } catch (error) {
            console.error('Erro ao carregar medidas:', error);
            setMeasures([]);
        } finally {
            setLoading(false);
        }
    };

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
        other: 'Outras'
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
                                                <span>{measure.name}</span>
                                                {measure.hasSpecificConversion && (
                                                    <span className="ml-2 text-xs text-primary">★</span>
                                                )}
                                            </div>
                                            {measure.description && (
                                                <div className="text-xs text-muted-foreground">
                                                    {measure.description}
                                                </div>
                                            )}
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
