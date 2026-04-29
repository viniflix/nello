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

/**
 * Seletor de medidas em cascata (3 etapas):
 * 1. Selecionar grupo de medidas (Volume, Unidade, Peso, Minhas Medidas)
 * 2. Selecionar medida específica do grupo
 * 3. Informar quantidade
 *
 * Suporta medidas do sistema (household_measures) e medidas personalizadas
 * do nutricionista (nutritionist_custom_measures).
 */
const CascadeMeasureSelector = ({
    food,
    quantity,
    unit,
    onQuantityChange,
    onUnitChange,
    onMeasureChange,
    onNutritionCalculated
}) => {
    // Buscar medidas do sistema + medidas personalizadas do nutricionista
    const { data: allMeasures = [], isLoading } = useAllMeasures();

    // Buscar medidas específicas do alimento (conversões por alimento)
    const { data: foodMeasures = [], isLoading: loadingFood } = useFoodMeasures(food?.id);

    const [measures, setMeasures] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');

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

    const handleCategoryChange = (category) => {
        setSelectedCategory(category);
        // Limpar seleção de medida ao trocar categoria
        onUnitChange('');
        if (onMeasureChange) {
            onMeasureChange(null);
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

    // Agrupar medidas por categoria
    const groupedMeasures = measures.reduce((acc, measure) => {
        const category = measure.category || 'other';
        if (!acc[category]) acc[category] = [];
        acc[category].push(measure);
        return acc;
    }, {});

    // Labels das categorias
    const categoryLabels = {
        volume: 'Volume',
        weight: 'Peso',
        unit: 'Unidade',
        other: 'Outras',
        custom: 'Minhas Medidas',
    };

    // Ícones/Descrições das categorias
    const categoryDescriptions = {
        volume: 'Colheres, xícaras, copos, etc.',
        weight: 'Gramas',
        unit: 'Unidades, fatias, porções, etc.',
        other: 'Outras medidas',
        custom: 'Medidas criadas por você',
    };

    // Obter categorias disponíveis
    const availableCategories = Object.keys(groupedMeasures);

    // Obter medidas da categoria selecionada
    const currentCategoryMeasures = selectedCategory ? groupedMeasures[selectedCategory] || [] : [];

    return (
        <div className="space-y-4">
            {/* Passo 1: Selecionar Grupo de Medidas */}
            <div className="space-y-2">
                <Label className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        1
                    </span>
                    Grupo de Medida <span className="text-destructive">*</span>
                </Label>
                <Select
                    value={selectedCategory}
                    onValueChange={handleCategoryChange}
                    disabled={!food || loading}
                >
                    <SelectTrigger>
                        <SelectValue placeholder={loading ? "Carregando..." : "Selecione o tipo de medida"} />
                    </SelectTrigger>
                    <SelectContent>
                        {availableCategories.map((category) => (
                            <SelectItem key={category} value={category}>
                                <div className="flex flex-col">
                                    <span className="font-semibold">{categoryLabels[category] || category}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {categoryDescriptions[category]}
                                    </span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Passo 2: Selecionar Medida Específica */}
            <div className="space-y-2">
                <Label className="flex items-center gap-2">
                    <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        selectedCategory ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                        2
                    </span>
                    Medida <span className="text-destructive">*</span>
                </Label>
                <Select
                    value={unit}
                    onValueChange={handleUnitChange}
                    disabled={!selectedCategory || loading}
                >
                    <SelectTrigger>
                        <SelectValue placeholder={
                            !selectedCategory
                                ? "Primeiro selecione o grupo"
                                : "Selecione a medida específica"
                        } />
                    </SelectTrigger>
                    <SelectContent
                        className="max-h-[300px]"
                        position="popper"
                        sideOffset={5}
                    >
                        <div className="overflow-y-auto max-h-[280px]">
                            {currentCategoryMeasures.map((measure) => (
                                <SelectItem
                                    key={measure.code}
                                    value={measure.code}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex flex-col">
                                            <span className="font-medium flex items-center gap-1.5">
                                                {measure.name}
                                                {measure.source === 'custom' && (
                                                    <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">
                                                        Pessoal
                                                    </span>
                                                )}
                                            </span>
                                            {measure.description && (
                                                <span className="text-xs text-muted-foreground">
                                                    {measure.description}
                                                </span>
                                            )}
                                            {measure.source === 'custom' && (
                                                <span className="text-xs text-emerald-600 font-medium">
                                                    1 unidade = {measure.grams_equivalent}g
                                                </span>
                                            )}
                                        </div>
                                        {measure.hasSpecificConversion && (
                                            <span className="ml-2 text-xs text-primary font-bold">★</span>
                                        )}
                                    </div>
                                </SelectItem>
                            ))}
                        </div>
                    </SelectContent>
                </Select>

                {/* Legenda para conversão específica */}
                {currentCategoryMeasures.some(m => m.hasSpecificConversion) && (
                    <p className="text-xs text-muted-foreground">
                        ★ = Conversão específica para este alimento
                    </p>
                )}
            </div>

            {/* Passo 3: Informar Quantidade */}
            <div className="space-y-2">
                <Label htmlFor="quantity" className="flex items-center gap-2">
                    <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        unit ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                        3
                    </span>
                    Quantidade <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="quantity"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={!unit ? "Primeiro selecione a medida" : "Ex: 2"}
                    value={quantity}
                    onChange={(e) => onQuantityChange(e.target.value)}
                    disabled={!unit}
                />
            </div>

        </div>
    );
};

export default CascadeMeasureSelector;
