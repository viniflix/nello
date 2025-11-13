/**
 * Traduções de códigos de medidas caseiras para português
 */

export const measureTranslations = {
    // Colheres
    'tablespoon': 'Colher de Sopa',
    'dessertspoon': 'Colher de Sobremesa',
    'teaspoon': 'Colher de Chá',
    'coffeespoon': 'Colher de Café',

    // Xícaras e Copos
    'cup': 'Xícara de Chá',
    'small_glass': 'Copo Americano',
    'large_glass': 'Copo Duplo',

    // Outros utensílios
    'ladle': 'Concha Média',
    'tongs': 'Pegador',

    // Unidades
    'unit': 'Unidade',
    'slice': 'Fatia',
    'portion': 'Porção',
    'piece': 'Pedaço',

    // Peso e Volume direto
    'gram': 'g',
    'ml': 'ml'
};

/**
 * Traduz um código de medida para português
 * @param {string} code - Código da medida (ex: 'tablespoon', 'gram')
 * @param {object} measure - Objeto da medida completo (opcional, com name)
 * @returns {string} Nome da medida em português
 */
export const translateMeasure = (code, measure = null) => {
    // Se tiver o objeto measure com name, usar ele
    if (measure && measure.name) {
        return measure.name;
    }

    // Caso contrário, usar tradução do código
    return measureTranslations[code] || code;
};

/**
 * Formata a quantidade com a unidade traduzida
 * @param {number} quantity - Quantidade
 * @param {string} unit - Código da unidade
 * @param {object} measure - Objeto da medida (opcional)
 * @returns {string} Texto formatado (ex: "2 Colheres de Sopa", "150 g")
 */
export const formatQuantityWithUnit = (quantity, unit, measure = null) => {
    const translatedUnit = translateMeasure(unit, measure);

    // Para gramas e ml, colocar o número junto com a unidade
    if (unit === 'gram' || unit === 'ml') {
        return `${quantity}${translatedUnit}`;
    }

    // Para outras unidades, número separado
    return `${quantity} ${translatedUnit}`;
};
