/**
 * PortionSelector - Seletor inteligente de porção
 * Mostra TODAS as medidas genéricas (household_measures)
 * Marca com ★ as que têm conversão específica cadastrada
 */

import React, { useMemo, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { useFoodMeasures } from '@/hooks/useFoodMeasures';
import { useHouseholdMeasures } from '@/hooks/useHouseholdMeasures';

/**
 * @param {object} props
 * @param {object} props.food - Alimento selecionado (da tabela foods)
 * @param {object} props.value - { quantity: number, measureId: number | null }
 * @param {function} props.onChange - Callback quando valor mudar
 * @param {boolean} props.showNutrition - Mostrar informações nutricionais (default: true)
 * @param {string} props.className - Classes CSS adicionais
 */
export function PortionSelector({
    food,
    value = { quantity: 100, measureId: null },
    onChange,
    showNutrition = true,
    className = '',
    onNutritionChange = null  // NOVO: callback para passar nutrição calculada
}) {
    // Buscar TODAS as medidas genéricas (34 medidas)
    const { data: allMeasures = [], isLoading: loadingAll } = useHouseholdMeasures();

    // Buscar medidas específicas para este alimento
    const { data: foodMeasures = [], isLoading: loadingFood } = useFoodMeasures(food?.id);

    const isLoading = loadingAll || loadingFood;

    // Combinar medidas genéricas com flag de conversão específica
    const measuresWithFlags = useMemo(() => {
        return allMeasures.map(measure => ({
            ...measure,
            hasSpecificConversion: foodMeasures.some(fm => fm.measure_id === measure.id)
        }));
    }, [allMeasures, foodMeasures]);

    // Detectar se está usando fallback (portion_size)
    const isUsingFallback = useMemo(() => {
        if (!value.measureId || value.measureId === 'grams') return false;

        const specificMeasure = foodMeasures.find(m => m.measure_id === value.measureId);
        if (specificMeasure) return false;

        const genericMeasure = allMeasures.find(m => m.id === value.measureId);
        if (genericMeasure && genericMeasure.grams_equivalent) return false;

        return !!genericMeasure; // Usando fallback se a medida existe mas não tem conversão
    }, [value.measureId, foodMeasures, allMeasures]);

    // Calcular peso total em gramas
    const totalGrams = useMemo(() => {
        if (!food || !value.quantity) return 0;

        if (value.measureId === null || value.measureId === 'grams') {
            // Quantidade já é em gramas
            return value.quantity;
        }

        // 1. Buscar conversão específica em food_household_measures
        const specificMeasure = foodMeasures.find(m => m.measure_id === value.measureId);
        if (specificMeasure) {
            // Usar conversão específica (mais preciso)
            return (specificMeasure.grams * value.quantity) / specificMeasure.quantity;
        }

        // 2. Buscar conversão padrão em household_measures
        const genericMeasure = allMeasures.find(m => m.id === value.measureId);
        if (genericMeasure && genericMeasure.grams_equivalent) {
            // Usar conversão padrão (ex: colher = 20g)
            return genericMeasure.grams_equivalent * value.quantity;
        }

        // 3. Fallback para medidas sem grams_equivalent (unidade, fatia, porção)
        // Usa portion_size do alimento (geralmente 100g)
        // Isso permite funcionalidade básica mesmo sem conversão cadastrada
        if (genericMeasure) {
            console.warn(`Usando portion_size como fallback para medida "${genericMeasure.name}"`);
            return (food.portion_size || 100) * value.quantity;
        }

        // 4. Medida não encontrada
        console.error(`Medida ${value.measureId} não encontrada`);
        return 0;
    }, [food, value, foodMeasures, allMeasures]);

    // Calcular todos os nutrientes (recalcula calorias baseado nos macros)
    const nutrition = useMemo(() => {
        if (!food || totalGrams === 0) {
            return {
                grams: 0,
                calories: 0,
                protein: 0,
                carbs: 0,
                fat: 0,
                fiber: 0,
                sodium: 0
            };
        }

        const multiplier = totalGrams / 100;
        const protein = (food.protein || 0) * multiplier;
        const carbs = (food.carbs || 0) * multiplier;
        const fat = (food.fat || 0) * multiplier;
        
        // RECALCULAR calorias baseado nos macros (não usar food.calories diretamente)
        // Fórmula: (Proteína × 4) + (Carboidratos × 4) + (Gorduras × 9)
        const calories = (protein * 4) + (carbs * 4) + (fat * 9);

        return {
            grams: totalGrams,
            calories: parseFloat(calories.toFixed(2)),
            protein: parseFloat(protein.toFixed(2)),
            carbs: parseFloat(carbs.toFixed(2)),
            fat: parseFloat(fat.toFixed(2)),
            fiber: food.fiber ? parseFloat((food.fiber * multiplier).toFixed(2)) : 0,
            sodium: food.sodium ? parseFloat((food.sodium * multiplier).toFixed(2)) : 0
        };
    }, [food, totalGrams]);

    // Notificar mudanças de nutrição (para o componente pai)
    useEffect(() => {
        if (onNutritionChange) {
            onNutritionChange(nutrition);
        }
    }, [nutrition, onNutritionChange]);

    const handleQuantityChange = (newQuantity) => {
        onChange({
            ...value,
            quantity: parseFloat(newQuantity) || 0
        });
    };

    const handleMeasureChange = (newMeasureId) => {
        onChange({
            ...value,
            measureId: newMeasureId === 'grams' ? null : parseInt(newMeasureId)
        });
    };

    // Agrupar medidas por categoria
    const groupedMeasures = useMemo(() => {
        return measuresWithFlags.reduce((acc, measure) => {
            const category = measure.category || 'other';
            if (!acc[category]) acc[category] = [];
            acc[category].push(measure);
            return acc;
        }, {});
    }, [measuresWithFlags]);

    const categoryLabels = {
        volume: 'Medidas de Volume',
        weight: 'Medidas de Peso',
        unit: 'Unidades',
        other: 'Outras'
    };

    return (
        <div className={`space-y-2 ${className}`}>
            <Label>Porção</Label>

            <div className="flex items-center gap-2">
                {/* Input numérico */}
                <Input
                    type="number"
                    value={value.quantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    min={0}
                    step={0.5}
                    className="w-24"
                    placeholder="0"
                    disabled={!food}
                />

                {/* Dropdown de medidas */}
                <Select
                    value={value.measureId?.toString() ?? 'grams'}
                    onValueChange={handleMeasureChange}
                    disabled={!food || isLoading}
                >
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder={isLoading ? "Carregando..." : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                        {/* Opção padrão: gramas */}
                        <SelectItem value="grams">g</SelectItem>

                        {/* TODAS as medidas genéricas, agrupadas por categoria */}
                        <div className="overflow-y-auto max-h-[280px]">
                            {Object.entries(groupedMeasures).map(([category, categoryMeasures]) => (
                                <React.Fragment key={category}>
                                    {/* Cabeçalho da categoria */}
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground sticky top-0 bg-popover">
                                        {categoryLabels[category] || category}
                                    </div>

                                    {/* Medidas da categoria */}
                                    {categoryMeasures.map((measure) => (
                                        <SelectItem
                                            key={measure.id}
                                            value={measure.id.toString()}
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

                {/* Informação calculada */}
                {showNutrition && food && totalGrams > 0 && (
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                        ≈ {nutrition.grams.toFixed(0)}g | {Math.round(nutrition.calories)} kcal
                    </span>
                )}
            </div>

            {/* Legenda para conversão específica */}
            {food && !isLoading && foodMeasures.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    ★ = Conversão específica para este alimento
                </p>
            )}

            {/* Aviso quando usando fallback */}
            {isUsingFallback && (
                <div className="text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 p-2 rounded border border-amber-200 dark:border-amber-800">
                    ⚠️ Estimativa aproximada ({food.portion_size || 100}g por unidade).
                    Para maior precisão, cadastre a conversão específica.
                </div>
            )}
        </div>
    );
}

export default PortionSelector;
