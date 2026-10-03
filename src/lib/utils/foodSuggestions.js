const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const breakfast = ['pão francês', 'ovo cozido', 'banana', 'leite', 'aveia', 'requeijão'];
const mainMeal = ['arroz cozido', 'feijão cozido', 'frango grelhado', 'carne bovina', 'batata cozida', 'alface'];
const snack = ['iogurte', 'banana', 'maçã', 'pão integral', 'queijo', 'castanha'];

/** Catalog discovery only: no prescription or automatic addition to the diet. */
export function foodSuggestionQueries(mealType, group, originalName) {
    if (group || originalName) {
        const value = normalize(group || originalName);
        if (/cerea|massa|panifica|pao|arroz|aveia|tapioca/.test(value)) return ['pão', 'arroz cozido', 'aveia', 'tapioca', 'batata'];
        if (/leite|latic|queijo|iogurte/.test(value)) return ['requeijão', 'queijo', 'iogurte', 'leite'];
        if (/carne|aves|ovo|pescado|peixe|frango/.test(value)) return ['frango grelhado', 'ovo cozido', 'carne bovina', 'peixe'];
        if (/fruta|banana|maca|mamao|laranja/.test(value)) return ['banana', 'maçã', 'mamão', 'laranja'];
        if (/leguminos/.test(value)) return ['feijão', 'lentilha', 'grão de bico'];
        if (/hortali|verdura|legume/.test(value)) return ['alface', 'brócolis', 'cenoura', 'abobrinha'];
        if (/oleo|gordura/.test(value)) return ['azeite', 'manteiga', 'óleo'];
    }
    if (originalName) return [String(originalName).split(',')[0].trim().slice(0, 120)];
    if (mealType === 'lunch' || mealType === 'dinner') return mainMeal;
    if (mealType === 'breakfast') return breakfast;
    if (mealType === 'supper') return ['iogurte', 'leite', 'aveia', 'banana'];
    return snack;
}

export function mergeFoodSuggestions(results, excludedId) {
    const seen = new Set();
    return results.flatMap(result => result.data || []).filter(food => {
        if (!food.id || food.id === excludedId || seen.has(food.id)) return false;
        seen.add(food.id);
        return true;
    }).slice(0, 18);
}
