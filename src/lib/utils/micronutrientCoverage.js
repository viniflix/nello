// A missing nutrient is unknown, not a measured zero. TACO 4th edition does not
// publish these columns, even if an old snapshot happens to contain a value.
const UNREPORTED_TACO_NUTRIENTS = new Set(['vitamin_b12', 'vitamin_d', 'vitamin_e', 'folate']);

const gramsForItem = (item) => {
  if (!item.unit || item.unit === 'gram') return Number(item.quantity) || 0;
  if (item.measure) {
    const grams = Number(item.measure.grams_equivalent || item.measure.weight_in_grams || item.measure.quantity_grams || item.measure.grams) || 0;
    return (Number(item.quantity) || 0) * grams;
  }
  const caloriesPer100g = Number(item.food?.calories);
  if (caloriesPer100g > 0 && item.calories != null) {
    return (Number(item.calories) / caloriesPer100g) * 100;
  }
  return (Number(item.quantity) || 0) * 100;
};

export const summarizeMicronutrients = (plan, nutrients) => {
  const result = Object.fromEntries(nutrients.map(nutrient => [nutrient, { value: 0, known: 0, unknown: 0 }]));

  for (const meal of plan?.meals || []) {
    for (const item of meal.foods || []) {
      const multiplier = gramsForItem(item) / 100;
      if (!Number.isFinite(multiplier) || multiplier <= 0) continue;

      for (const nutrient of nutrients) {
        const entry = result[nutrient];
        const raw = item.food?.[nutrient];
        const value = raw == null || raw === '' ? NaN : Number(raw);
        if (!item.food || (item.food.source === 'TACO' && UNREPORTED_TACO_NUTRIENTS.has(nutrient)) || !Number.isFinite(value) || value < 0) {
          entry.unknown += 1;
        } else {
          entry.known += 1;
          entry.value += value * multiplier;
        }
      }
    }
  }

  return result;
};
