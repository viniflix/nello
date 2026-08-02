import { describe, expect, it } from 'vitest';
import { isValidMealTime, MealTimeValidationError, normalizeMealTime } from './mealTime';

describe('normalizeMealTime', () => {
    it.each([null, undefined, '', '   '])('normaliza valor vazio %s para null', (value) => {
        expect(normalizeMealTime(value)).toBeNull();
    });

    it.each([
        ['00:00', '00:00'],
        ['23:59', '23:59'],
        ['08:30:00', '08:30'],
        [' 12:05 ', '12:05']
    ])('normaliza %s para %s', (value, expected) => {
        expect(normalizeMealTime(value)).toBe(expected);
    });

    it.each(['1', '12:', '7:30', '24:00', '12:60', 'meio-dia'])('rejeita horário incompleto ou inválido: %s', (value) => {
        expect(() => normalizeMealTime(value)).toThrow(MealTimeValidationError);
        expect(isValidMealTime(value)).toBe(false);
    });
});
