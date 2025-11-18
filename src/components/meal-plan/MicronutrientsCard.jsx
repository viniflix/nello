/**
 * MicronutrientsCard - Card de Micronutrientes com DRI
 * Mostra vitaminas e minerais do plano comparado com valores DRI
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

/**
 * Valores DRI (Dietary Reference Intake) para adultos
 * Fonte: Dietary Reference Intakes (DRIs) - IOM/USDA
 * Valores médios para adultos de 19-50 anos
 */
const DRI_VALUES = {
    // Vitaminas
    vitamin_a: { value: 900, unit: 'mcg RAE', name: 'Vitamina A' }, // 900 mcg RAE para homens, 700 para mulheres
    vitamin_c: { value: 90, unit: 'mg', name: 'Vitamina C' }, // 90 mg para homens, 75 para mulheres
    vitamin_d: { value: 15, unit: 'mcg', name: 'Vitamina D' }, // 15 mcg (600 UI)
    vitamin_e: { value: 15, unit: 'mg', name: 'Vitamina E' }, // 15 mg α-tocoferol
    vitamin_b12: { value: 2.4, unit: 'mcg', name: 'Vitamina B12' },
    folate: { value: 400, unit: 'mcg DFE', name: 'Folato' }, // 400 mcg DFE

    // Minerais
    calcium: { value: 1000, unit: 'mg', name: 'Cálcio' },
    iron: { value: 8, unit: 'mg', name: 'Ferro' }, // 8 mg para homens, 18 mg para mulheres
    magnesium: { value: 400, unit: 'mg', name: 'Magnésio' }, // 400 mg para homens, 310 para mulheres
    phosphorus: { value: 700, unit: 'mg', name: 'Fósforo' },
    potassium: { value: 3400, unit: 'mg', name: 'Potássio' }, // 3400 mg para homens, 2600 para mulheres
    zinc: { value: 11, unit: 'mg', name: 'Zinco' }, // 11 mg para homens, 8 para mulheres

    // Outros
    fiber: { value: 25, unit: 'g', name: 'Fibras' }, // 25-38g dependendo do sexo
    sodium: { value: 2300, unit: 'mg', name: 'Sódio', isLimit: true }, // Limite máximo
};

/**
 * Calcula totais de micronutrientes do plano
 */
const calculateMicronutrients = (plan) => {
    if (!plan || !plan.meals) return {};

    const totals = {};

    // Inicializar todos os micronutrientes com 0
    Object.keys(DRI_VALUES).forEach(nutrient => {
        totals[nutrient] = 0;
    });

    // Somar micronutrientes de todos os alimentos
    plan.meals.forEach(meal => {
        if (meal.foods) {
            meal.foods.forEach(foodItem => {
                if (foodItem.food) {
                    Object.keys(DRI_VALUES).forEach(nutrient => {
                        const value = parseFloat(foodItem.food[nutrient]) || 0;
                        if (value > 0) {
                            // Calcular baseado na quantidade
                            const multiplier = foodItem.quantity / 100; // foods está em base 100g
                            totals[nutrient] += value * multiplier;
                        }
                    });
                }
            });
        }
    });

    return totals;
};

/**
 * Calcula status de adequação
 */
const getAdequacyStatus = (value, dri, isLimit = false) => {
    if (!value || !dri) return 'unknown';

    const percentage = (value / dri) * 100;

    if (isLimit) {
        // Para nutrientes com limite máximo (ex: sódio)
        if (percentage <= 100) return 'adequate'; // Verde
        if (percentage <= 150) return 'adjust'; // Amarelo
        return 'inadequate'; // Vermelho (excesso)
    } else {
        // Para nutrientes com meta mínima
        if (percentage >= 100) return 'adequate'; // Verde (atingiu)
        if (percentage >= 75) return 'adjust'; // Amarelo (próximo)
        return 'inadequate'; // Vermelho (insuficiente)
    }
};

/**
 * Retorna cor baseada no status
 */
const getAdequacyBadge = (status, isLimit = false) => {
    switch (status) {
        case 'adequate':
            return 'default'; // Verde
        case 'adjust':
            return 'secondary'; // Amarelo
        case 'inadequate':
            return 'destructive'; // Vermelho
        default:
            return 'outline';
    }
};

/**
 * Retorna texto do status
 */
const getStatusText = (status, isLimit = false) => {
    if (isLimit) {
        switch (status) {
            case 'adequate': return 'Adequado';
            case 'adjust': return 'Atenção';
            case 'inadequate': return 'Excesso';
            default: return '-';
        }
    } else {
        switch (status) {
            case 'adequate': return 'Adequado';
            case 'adjust': return 'Abaixo';
            case 'inadequate': return 'Insuficiente';
            default: return '-';
        }
    }
};

/**
 * Componente principal
 */
export function MicronutrientsCard({ plan }) {
    const totals = useMemo(() => calculateMicronutrients(plan), [plan]);

    // Agrupar por categoria
    const vitamins = ['vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_b12', 'folate'];
    const minerals = ['calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc'];
    const others = ['fiber', 'sodium'];

    const renderNutrientRow = (nutrient) => {
        const driInfo = DRI_VALUES[nutrient];
        const value = totals[nutrient] || 0;
        const status = getAdequacyStatus(value, driInfo.value, driInfo.isLimit);
        const percentage = driInfo.value ? (value / driInfo.value * 100) : 0;

        return (
            <TableRow key={nutrient}>
                <TableCell className="font-medium">{driInfo.name}</TableCell>
                <TableCell className="text-right">{value.toFixed(1)}</TableCell>
                <TableCell className="text-right">{driInfo.value}</TableCell>
                <TableCell className="text-center">{driInfo.unit}</TableCell>
                <TableCell className="text-right">
                    {percentage.toFixed(0)}%
                </TableCell>
                <TableCell className="text-center">
                    <Badge variant={getAdequacyBadge(status, driInfo.isLimit)}>
                        {getStatusText(status, driInfo.isLimit)}
                    </Badge>
                </TableCell>
            </TableRow>
        );
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Micronutrientes e Valores DRI</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Comparação com Dietary Reference Intakes (DRIs) para adultos
                </p>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Vitaminas */}
                <div>
                    <h3 className="font-semibold mb-3 text-lg">Vitaminas</h3>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nutriente</TableHead>
                                <TableHead className="text-right">Prescrito</TableHead>
                                <TableHead className="text-right">DRI</TableHead>
                                <TableHead className="text-center">Unidade</TableHead>
                                <TableHead className="text-right">% DRI</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {vitamins.map(renderNutrientRow)}
                        </TableBody>
                    </Table>
                </div>

                {/* Minerais */}
                <div>
                    <h3 className="font-semibold mb-3 text-lg">Minerais</h3>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nutriente</TableHead>
                                <TableHead className="text-right">Prescrito</TableHead>
                                <TableHead className="text-right">DRI</TableHead>
                                <TableHead className="text-center">Unidade</TableHead>
                                <TableHead className="text-right">% DRI</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {minerals.map(renderNutrientRow)}
                        </TableBody>
                    </Table>
                </div>

                {/* Outros */}
                <div>
                    <h3 className="font-semibold mb-3 text-lg">Outros Nutrientes</h3>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nutriente</TableHead>
                                <TableHead className="text-right">Prescrito</TableHead>
                                <TableHead className="text-right">Recomendação</TableHead>
                                <TableHead className="text-center">Unidade</TableHead>
                                <TableHead className="text-right">% Rec.</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {others.map(renderNutrientRow)}
                        </TableBody>
                    </Table>
                </div>

                {/* Legenda */}
                <div className="text-xs text-muted-foreground space-y-1 border-t pt-4">
                    <p><strong>DRI:</strong> Dietary Reference Intake (Ingestão Dietética de Referência)</p>
                    <p><strong>Adequado:</strong> Atinge 100% ou mais da recomendação</p>
                    <p><strong>Abaixo:</strong> Entre 75-99% da recomendação</p>
                    <p><strong>Insuficiente:</strong> Menos de 75% da recomendação</p>
                    <p><strong>Atenção/Excesso (Sódio):</strong> Acima do limite recomendado</p>
                    <p className="text-amber-600"><strong>Nota:</strong> Valores DRI são médias para adultos de 19-50 anos. Ajuste conforme necessidades individuais.</p>
                </div>
            </CardContent>
        </Card>
    );
}

export default MicronutrientsCard;
