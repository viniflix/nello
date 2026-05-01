export function isFieldVisible(field, content) {
    if (!field.conditional_logic || !field.conditional_logic.field_id) return true;

    const { field_id, operator, value } = field.conditional_logic;
    const actualValue = content[field_id];

    // Se o campo dependência ainda não foi respondido e a condição não for "not_equals" (que poderia ser verdade para nulo), assumimos falso.
    // Para simplificar, se não há resposta e a lógica exige uma, fica oculto.
    if (actualValue === undefined || actualValue === null || actualValue === '') {
        if (operator === 'not_equals' && value) return true;
        return false;
    }

    switch (operator) {
        case 'equals':
            if (Array.isArray(actualValue)) return actualValue.includes(value);
            return String(actualValue).toLowerCase() === String(value).toLowerCase();
        case 'not_equals':
            if (Array.isArray(actualValue)) return !actualValue.includes(value);
            return String(actualValue).toLowerCase() !== String(value).toLowerCase();
        case 'contains':
            if (Array.isArray(actualValue)) return actualValue.includes(value);
            if (typeof actualValue === 'string') return actualValue.toLowerCase().includes(String(value).toLowerCase());
            return false;
        case 'greater_than':
            return Number(actualValue) > Number(value);
        case 'less_than':
            return Number(actualValue) < Number(value);
        default:
            return true;
    }
}
