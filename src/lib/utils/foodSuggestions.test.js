import { expect, it } from 'vitest';
import { foodSuggestionQueries, mergeFoodSuggestions } from './foodSuggestions';

it('uses different common foods for breakfast and main meals, and the food group for substitutions', () => {
    expect(foodSuggestionQueries('breakfast')).toContain('pão francês');
    expect(foodSuggestionQueries('breakfast')).toContain('ovo cozido');
    expect(foodSuggestionQueries('lunch')).toContain('arroz cozido');
    expect(foodSuggestionQueries(null, 'Leite e derivados', 'Queijo')).toContain('requeijão');
    expect(foodSuggestionQueries(null, null, 'Pão francês')).toContain('tapioca');
    expect(foodSuggestionQueries(null, 'Grupo não mapeado', 'Alimento, cozido')).toEqual(['Alimento']);
});

it('keeps catalog order, removes duplicates and the original food, and limits initial options', () => {
    const records = Array.from({ length: 30 }, (_, index) => ({ id: index + 1 }));
    const foods = mergeFoodSuggestions([{ data: records.slice(0, 5) }, { data: records }], 2);
    expect(foods).toHaveLength(18);
    expect(foods.slice(0, 2)).toEqual([{ id: 1 }, { id: 3 }]);
    expect(new Set(foods.map(food => food.id)).size).toBe(18);
});
