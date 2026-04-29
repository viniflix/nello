/**
 * PortionSelector — Seletor de Porção Redesenhado
 *
 * UX Simplificada:
 * - Um único select flat com grupos separados por header
 * - Primeiro grupo: "Gramas" (padrão, sempre visível)
 * - Segundo grupo: "Minhas Medidas" (medidas personalizadas do nutricionista)
 * - Terceiro+ grupos: medidas do sistema agrupadas por categoria
 * - Medidas com conversão específica para o alimento marcadas com ★
 *
 * Compatibilidade:
 * - Valor em 'gram' (string) = gramas direto
 * - Valor em 'code' string (ex: 'custom_xyz_abc') = medida personalizada
 * - Valor em 'code' string (ex: 'colher_sopa') = medida do sistema por code
 * - Valor numérico (legado) = medida do sistema por ID
 */

import React, { useMemo, useEffect, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useFoodMeasures } from '@/hooks/useFoodMeasures';
import { useAllMeasures } from '@/hooks/useHouseholdMeasures';

const CATEGORY_LABELS = {
    volume: 'Volume',
    weight: 'Peso',
    unit: 'Unidade',
    other: 'Outras',
};

/**
 * Resolve o código de unidade que será salvo.
 * Aceita um objeto measure e retorna o `code` para armazenamento.
 */
const getMeasureCode = (measure) => {
    if (!measure) return 'gram';
    return measure.code || String(measure.id);
};

/**
 * Calcula gramas totais a partir da seleção.
 */
const calcTotalGrams = ({ measureCode, quantity, food, foodMeasures, systemMeasures, customMeasures }) => {
    if (!food || !quantity) return 0;
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) return 0;

    if (!measureCode || measureCode === 'gram') {
        return qty; // quantidade já em gramas
    }

    // Medida personalizada (custom_*)
    if (String(measureCode).startsWith('custom_')) {
        const custom = customMeasures.find(m => m.code === measureCode);
        if (custom) return qty * custom.grams_equivalent;
        return 0;
    }

    // Buscar medida do sistema — conversão específica por alimento primeiro
    const specificConversion = foodMeasures.find(fm => {
        const sysM = systemMeasures.find(m => m.id === fm.measure_id);
        return sysM && sysM.code === measureCode;
    });
    if (specificConversion) {
        return (specificConversion.grams * qty) / specificConversion.quantity;
    }

    // Conversão padrão da medida do sistema
    const sysM = systemMeasures.find(m =>
        m.code === measureCode || String(m.id) === String(measureCode)
    );
    if (sysM?.grams_equivalent) return sysM.grams_equivalent * qty;

    // Fallback: portion_size do alimento
    return (food.portion_size || 100) * qty;
};

export function PortionSelector({
    food,
    value = { quantity: 100, measureId: null },
    onChange,
    showNutrition = true,
    className = '',
    onNutritionChange = null,
}) {
    const { systemMeasures = [], customMeasures = [], isLoading } = useAllMeasures();
    const { data: foodMeasures = [] } = useFoodMeasures(food?.id);

    // Determinar o code selecionado atualmente
    // Suporta: value.measureId numérico (legado), string code, null = grams
    const selectedCode = useMemo(() => {
        const mid = value.measureId ?? value.measureCode;
        if (!mid || mid === 'gram') return 'gram';
        // Já é um code string
        if (isNaN(Number(mid))) return String(mid);
        // É um ID numérico (legado) → encontrar o code
        const found = systemMeasures.find(m => m.id === Number(mid));
        return found ? found.code : 'gram';
    }, [value.measureId, value.measureCode, systemMeasures]);

    // Calcular gramas totais
    const totalGrams = useMemo(() => calcTotalGrams({
        measureCode: selectedCode,
        quantity: value.quantity,
        food,
        foodMeasures,
        systemMeasures,
        customMeasures,
    }), [selectedCode, value.quantity, food, foodMeasures, systemMeasures, customMeasures]);

    // Calcular nutrição
    const nutrition = useMemo(() => {
        if (!food || totalGrams <= 0) {
            return { grams: 0, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 };
        }
        const m = totalGrams / 100;
        const protein = (food.protein || 0) * m;
        const carbs = (food.carbs || 0) * m;
        const fat = (food.fat || 0) * m;
        const calories = protein * 4 + carbs * 4 + fat * 9;
        return {
            grams: totalGrams,
            calories: parseFloat(calories.toFixed(2)),
            protein: parseFloat(protein.toFixed(2)),
            carbs: parseFloat(carbs.toFixed(2)),
            fat: parseFloat(fat.toFixed(2)),
            fiber: food.fiber ? parseFloat((food.fiber * m).toFixed(2)) : 0,
            sodium: food.sodium ? parseFloat((food.sodium * m).toFixed(2)) : 0,
        };
    }, [food, totalGrams]);

    // Notificar mudança de nutrição
    useEffect(() => {
        if (onNutritionChange) onNutritionChange(nutrition);
    }, [nutrition, onNutritionChange]);

    // Medidas do sistema agrupadas, marcando as com conversão específica
    const groupedSystem = useMemo(() => {
        const specificIds = new Set(foodMeasures.map(fm => fm.measure_id));
        const groups = {};
        systemMeasures.forEach(m => {
            const cat = m.category || 'other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push({ ...m, hasSpecific: specificIds.has(m.id) });
        });
        return groups;
    }, [systemMeasures, foodMeasures]);

    const handleQuantityChange = useCallback((e) => {
        onChange({ ...value, quantity: parseFloat(e.target.value) || 0 });
    }, [onChange, value]);

    const handleMeasureChange = useCallback((code) => {
        if (code === 'gram') {
            onChange({ ...value, measureId: null, measureCode: 'gram', measure: null });
            return;
        }
        // Medida personalizada
        if (String(code).startsWith('custom_')) {
            const custom = customMeasures.find(m => m.code === code);
            onChange({
                ...value,
                measureId: code,
                measureCode: code,
                measure: custom ? { ...custom, source: 'custom' } : null,
            });
            return;
        }
        // Medida do sistema
        const sys = systemMeasures.find(m => m.code === code);
        onChange({
            ...value,
            measureId: code,
            measureCode: code,
            measure: sys ? { ...sys, source: 'system' } : null,
        });
    }, [onChange, value, customMeasures, systemMeasures]);

    const hasSpecificConversions = foodMeasures.length > 0;

    // Label que aparece no trigger do select
    const triggerLabel = useMemo(() => {
        if (selectedCode === 'gram') return 'g (gramas)';
        if (String(selectedCode).startsWith('custom_')) {
            const c = customMeasures.find(m => m.code === selectedCode);
            return c ? `${c.name} ✦` : selectedCode;
        }
        const s = systemMeasures.find(m => m.code === selectedCode);
        return s ? s.name : selectedCode;
    }, [selectedCode, customMeasures, systemMeasures]);

    return (
        <div className={`space-y-2 ${className}`}>
            <Label>Porção</Label>

            <div className="flex items-center gap-2">
                {/* Quantidade */}
                <Input
                    type="number"
                    value={value.quantity}
                    onChange={handleQuantityChange}
                    min={0}
                    step={0.5}
                    className="w-24 shrink-0"
                    placeholder="0"
                    disabled={!food}
                />

                {/* Seletor de Medida — flat, todos os grupos no mesmo select */}
                <Select
                    value={selectedCode}
                    onValueChange={handleMeasureChange}
                    disabled={!food || isLoading}
                >
                    <SelectTrigger className="flex-1 min-w-0">
                        <SelectValue placeholder={isLoading ? 'Carregando...' : 'Selecione a medida'}>
                            {triggerLabel}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-[320px]">
                        <div className="overflow-y-auto max-h-[300px]">

                            {/* ── Opção padrão: gramas ── */}
                            <SelectItem value="gram">
                                <span className="font-medium">g — Gramas</span>
                            </SelectItem>

                            {/* ── Minhas Medidas (personalizadas) ── */}
                            {customMeasures.length > 0 && (
                                <>
                                    <div className="px-2 pt-2 pb-1 text-xs font-bold text-emerald-700 uppercase tracking-wider sticky top-0 bg-popover border-t mt-1">
                                        ✦ Minhas Medidas
                                    </div>
                                    {customMeasures.map(m => (
                                        <SelectItem key={m.code} value={m.code} className="pl-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium">{m.name}</span>
                                                <span className="text-xs text-emerald-600">
                                                    1 unidade = {m.grams_equivalent}g
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </>
                            )}

                            {/* ── Medidas do sistema, agrupadas por categoria ── */}
                            {Object.entries(groupedSystem).map(([cat, measures]) => (
                                <React.Fragment key={cat}>
                                    <div className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-popover border-t mt-1">
                                        {CATEGORY_LABELS[cat] || cat}
                                    </div>
                                    {measures.map(m => (
                                        <SelectItem key={m.code} value={m.code} className="pl-4">
                                            <div className="flex items-center justify-between w-full gap-2">
                                                <span>{m.name}</span>
                                                {m.hasSpecific && (
                                                    <span className="text-xs text-amber-600 font-bold shrink-0">★</span>
                                                )}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </React.Fragment>
                            ))}

                        </div>
                    </SelectContent>
                </Select>

                {/* Total em gramas + kcal */}
                {showNutrition && food && totalGrams > 0 && (
                    <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
                        ≈ {nutrition.grams.toFixed(0)}g | {Math.round(nutrition.calories)} kcal
                    </span>
                )}
            </div>

            {/* Legenda */}
            {food && !isLoading && hasSpecificConversions && (
                <p className="text-xs text-muted-foreground">
                    ★ = Conversão cadastrada para este alimento
                </p>
            )}
        </div>
    );
}

export default PortionSelector;
