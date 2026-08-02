const MEAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/;

export class MealTimeValidationError extends Error {
    constructor() {
        super('Informe um horário completo no formato HH:MM ou deixe o campo em branco.');
        this.name = 'MealTimeValidationError';
        this.code = 'MEAL_TIME_INVALID';
    }
}

export const normalizeMealTime = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return null;

    const candidate = String(value).trim();
    if (!MEAL_TIME_PATTERN.test(candidate)) throw new MealTimeValidationError();

    return candidate.slice(0, 5);
};

export const isValidMealTime = (value) => {
    try {
        normalizeMealTime(value);
        return true;
    } catch {
        return false;
    }
};
