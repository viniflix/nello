/**
 * Traduções e mapeamentos para planos alimentares
 */

// Tipos de refeição
export const MEAL_TYPE_LABELS = {
  'breakfast': 'Café da Manhã',
  'morning_snack': 'Lanche da Manhã',
  'lunch': 'Almoço',
  'afternoon_snack': 'Lanche da Tarde',
  'dinner': 'Jantar',
  'supper': 'Ceia',
  'cafe_da_manha': 'Café da Manhã',
  'lanche_da_manha': 'Lanche da Manhã',
  'almoco': 'Almoço',
  'lanche_da_tarde': 'Lanche da Tarde',
  'jantar': 'Jantar',
  'ceia': 'Ceia'
};

// Ordem das refeições por horário típico
export const MEAL_ORDER = [
  'breakfast',
  'cafe_da_manha',
  'morning_snack',
  'lanche_da_manha',
  'lunch',
  'almoco',
  'afternoon_snack',
  'lanche_da_tarde',
  'dinner',
  'jantar',
  'supper',
  'ceia'
];

// Unidades de medida
export const UNIT_LABELS = {
  // Massa
  'gram': 'g',
  'g': 'g',
  'kg': 'kg',
  'kilogram': 'kg',

  // Volume
  'ml': 'ml',
  'milliliter': 'ml',
  'liter': 'l',
  'l': 'l',

  // Unidades
  'unit': 'unidade',
  'units': 'unidades',
  'unidade': 'unidade',
  'unidades': 'unidades',

  // Porções
  'portion': 'porção',
  'portions': 'porções',
  'porção': 'porção',
  'porções': 'porções',
  'serving': 'porção',

  // Colheres
  'tablespoon': 'colher de sopa',
  'tablespoons': 'colheres de sopa',
  'teaspoon': 'colher de chá',
  'teaspoons': 'colheres de chá',
  'colher_sopa': 'colher de sopa',
  'colher_cha': 'colher de chá',

  // Copos
  'cup': 'xícara',
  'cups': 'xícaras',
  'glass': 'copo',
  'glasses': 'copos',
  'small_glass': 'copo pequeno',
  'medium_glass': 'copo médio',
  'large_glass': 'copo grande',
  'copo': 'copo',
  'xicara': 'xícara',

  // Fatias
  'slice': 'fatia',
  'slices': 'fatias',
  'fatia': 'fatia',

  // Outros
  'piece': 'pedaço',
  'pieces': 'pedaços',
  'handful': 'punhado',
  'pinch': 'pitada'
};

/**
 * Traduz um tipo de refeição para português
 */
export function translateMealType(mealType) {
  return MEAL_TYPE_LABELS[mealType] || mealType;
}

/**
 * Traduz uma unidade de medida para português
 */
export function translateUnit(unit) {
  if (!unit) return '';
  const unitLower = unit.toLowerCase().trim();
  return UNIT_LABELS[unitLower] || unit;
}

/**
 * Normaliza o tipo de refeição para comparação
 */
export function normalizeMealType(mealType) {
  const normalized = {
    'breakfast': 'breakfast',
    'cafe_da_manha': 'breakfast',
    'morning_snack': 'morning_snack',
    'lanche_da_manha': 'morning_snack',
    'lunch': 'lunch',
    'almoco': 'lunch',
    'afternoon_snack': 'afternoon_snack',
    'lanche_da_tarde': 'afternoon_snack',
    'dinner': 'dinner',
    'jantar': 'dinner',
    'supper': 'supper',
    'ceia': 'supper'
  };
  return normalized[mealType] || mealType;
}
