// A missing nutrient is unknown, not a measured zero. TACO 4th edition does not
// publish these columns, even if an old snapshot happens to contain a value.
const UNREPORTED_TACO_NUTRIENTS = new Set(['vitamin_b12', 'vitamin_d', 'vitamin_e', 'folate']);

const gramsForItem = (item) => {
  if (!item.unit || ['g','gram','grams','gramas'].includes(item.unit)) return Number(item.quantity) || 0;
  if (item.measure) {
    const grams = Number(item.measure.grams_equivalent ?? item.measure.weight_in_grams ?? item.measure.quantity_grams ?? item.measure.grams);
    return Number.isFinite(grams) && grams > 0 ? Number(item.quantity) * grams : null;
  }
  return null;
};

export const summarizeMicronutrients = (plan, nutrients) => {
  const result = Object.fromEntries(nutrients.map(nutrient => [nutrient, { value: 0, known: 0, unknown: 0 }]));

  for (const meal of plan?.meals || []) {
    if (meal.include_in_totals === false) continue;
    for (const item of meal.foods || []) {
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) continue;
      const grams = gramsForItem(item);
      const food = item.food ?? item.foods;
      const basis = food?.source === 'custom' ? Number(food.portion_size) : 100;
      const multiplier = grams == null || !Number.isFinite(basis) || basis <= 0 ? null : grams / basis;

      for (const nutrient of nutrients) {
        const entry = result[nutrient];
        const raw = food?.[nutrient];
        const value = raw == null || raw === '' ? NaN : Number(raw);
        if (multiplier == null || !food || (food.source === 'TACO' && UNREPORTED_TACO_NUTRIENTS.has(nutrient)) || !Number.isFinite(value) || value < 0) {
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
