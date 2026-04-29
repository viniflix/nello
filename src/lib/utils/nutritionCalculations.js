/**
 * src/lib/utils/nutritionCalculations.js
 * Utilitários para cálculos nutricionais avançados, conversões e equivalências.
 */

/**
 * Calcula a quantidade necessária do substituto para igualar as calorias do alimento original.
 * @param {number} originalKcal Calorias totais da porção original
 * @param {object} substituteFood Dados do alimento substituto (tabela foods)
 * @returns {number} Quantidade em gramas do substituto necessária
 */
export function calculateEquivalentGrams(originalKcal, substituteFood) {
    if (!originalKcal || !substituteFood || substituteFood.calories <= 0) return 0;
    
    // Todos os valores na tabela foods são baseados em portion_size (geralmente 100g)
    const portion = substituteFood.portion_size || 100;
    
    // Kcal por 1 grama do substituto
    const kcalPerGram = substituteFood.calories / portion;
    
    // Quantos gramas eu preciso para atingir a originalKcal?
    return originalKcal / kcalPerGram;
}

/**
 * Tenta converter uma quantidade em gramas para a medida caseira mais lógica.
 * 
 * @param {number} targetGrams Quantidade alvo em gramas
 * @param {array} foodMeasures Medidas específicas cadastradas para este alimento (tabela food_household_measures)
 * @param {array} allMeasures Todas as medidas genéricas (tabela household_measures)
 * @returns {object} { quantity: number, measureId: number|string, unitName: string, isApproximate: boolean }
 */
export function convertGramsToMeasure(targetGrams, foodMeasures = [], allMeasures = []) {
    if (!targetGrams || targetGrams <= 0) {
        return { quantity: 0, measureId: 'grams', unitName: 'g', isApproximate: false };
    }

    let bestMatch = null;
    let minDifference = Infinity;

    // 1. Tentar com as medidas específicas do alimento primeiro (mais precisas)
    for (const fm of foodMeasures) {
        // Quantos gramas tem 1 unidade desta medida?
        const gramsPerUnit = fm.grams / fm.quantity;
        
        // Quantas unidades eu precisaria?
        const rawUnits = targetGrams / gramsPerUnit;
        
        // Vamos testar se arredondando fica perto. Aceitaremos erro de até 15% 
        // ex: 2.8 colheres -> arredonda para 3. Diferença de 0.2 colheres.
        const roundedUnits = Math.round(rawUnits * 2) / 2; // Arredonda para 0.5 mais próximo
        
        if (roundedUnits > 0) {
            const simulatedGrams = roundedUnits * gramsPerUnit;
            const diffRatio = Math.abs(simulatedGrams - targetGrams) / targetGrams;
            
            if (diffRatio < minDifference) {
                minDifference = diffRatio;
                const measureInfo = allMeasures.find(m => m.id === fm.measure_id);
                bestMatch = {
                    quantity: roundedUnits,
                    measureId: fm.measure_id,
                    unitName: measureInfo ? measureInfo.name : 'unidade',
                    isApproximate: diffRatio > 0.05 // Se diferença > 5%, marca como aproximado (~)
                };
            }
        }
    }

    // Se achou uma medida específica com erro menor que 20%, usa ela.
    if (bestMatch && minDifference <= 0.2) {
        return bestMatch;
    }

    // 2. Se não achou específica boa, tentar as genéricas que têm grams_equivalent
    for (const gm of allMeasures) {
        if (!gm.grams_equivalent) continue;
        
        const rawUnits = targetGrams / gm.grams_equivalent;
        const roundedUnits = Math.round(rawUnits * 2) / 2; // Arredonda para 0.5 mais próximo
        
        if (roundedUnits > 0) {
            const simulatedGrams = roundedUnits * gm.grams_equivalent;
            const diffRatio = Math.abs(simulatedGrams - targetGrams) / targetGrams;
            
            // Só aceitamos medidas genéricas se o erro for menor que 15% e for melhor que o anterior
            if (diffRatio < minDifference && diffRatio <= 0.15) {
                minDifference = diffRatio;
                bestMatch = {
                    quantity: roundedUnits,
                    measureId: gm.id,
                    unitName: gm.name,
                    isApproximate: diffRatio > 0.05
                };
            }
        }
    }

    if (bestMatch) {
        return bestMatch;
    }

    // 3. Fallback para gramas se nenhuma medida se encaixar bem
    return {
        quantity: Math.round(targetGrams),
        measureId: 'grams',
        unitName: 'g',
        isApproximate: false
    };
}

/**
 * Calcula a diferença (desvio) de macros e calorias entre a porção original e a porção substituta calculada.
 * @param {number} originalKcal 
 * @param {number} originalProtein 
 * @param {number} originalCarbs 
 * @param {number} originalFat 
 * @param {object} substituteFood 
 * @param {number} substituteGrams 
 * @returns {object} { hasDeviation: boolean, messages: array }
 */
export function checkMacroDeviations(originalKcal, originalProtein, originalCarbs, originalFat, substituteFood, substituteGrams) {
    if (!substituteFood || !substituteGrams) return { hasDeviation: false, messages: [] };

    const portion = substituteFood.portion_size || 100;
    const ratio = substituteGrams / portion;

    const subKcal = substituteFood.calories * ratio;
    const subProtein = substituteFood.protein * ratio;
    const subCarbs = substituteFood.carbs * ratio;
    const subFat = substituteFood.fat * ratio;

    const messages = [];
    let hasDeviation = false;

    // Tolerâncias (em gramas ou kcal)
    const KCAL_TOLERANCE = 50; // Se variar mais que 50kcal
    const MACRO_TOLERANCE = 5; // Se variar mais que 5g de macronutriente

    if (Math.abs(subKcal - originalKcal) > KCAL_TOLERANCE) {
        hasDeviation = true;
        const diff = Math.round(subKcal - originalKcal);
        messages.push(`Kcal: ${diff > 0 ? '+' : ''}${diff}`);
    }

    if (Math.abs(subProtein - originalProtein) > MACRO_TOLERANCE) {
        hasDeviation = true;
        const diff = Math.round(subProtein - originalProtein);
        messages.push(`Prot: ${diff > 0 ? '+' : ''}${diff}g`);
    }

    if (Math.abs(subCarbs - originalCarbs) > MACRO_TOLERANCE) {
        hasDeviation = true;
        const diff = Math.round(subCarbs - originalCarbs);
        messages.push(`Carb: ${diff > 0 ? '+' : ''}${diff}g`);
    }

    if (Math.abs(subFat - originalFat) > MACRO_TOLERANCE) {
        hasDeviation = true;
        const diff = Math.round(subFat - originalFat);
        messages.push(`Gord: ${diff > 0 ? '+' : ''}${diff}g`);
    }

    return {
        hasDeviation,
        messages
    };
}
