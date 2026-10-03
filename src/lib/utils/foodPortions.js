/** Resolve household counts to mass; never infer a missing measure as grams. */
export const isGramUnit = unit => !unit || ['g', 'gram', 'grams', 'gramas'].includes(String(unit).toLowerCase());

export function portionMeasure(unit, measures = [], snapshot = null) {
  if (isGramUnit(unit)) return { name: 'g', grams_equivalent: 1 };
  const measure = measures.find(item => String(item.code ?? item.id) === String(unit)) || snapshot;
  const grams = Number(measure?.grams_equivalent ?? measure?.weight_in_grams ?? measure?.quantity_grams ?? measure?.grams);
  return Number.isFinite(grams) && grams > 0 ? { ...measure, grams_equivalent: grams } : null;
}

export function portionGrams(quantity, unit, measures = [], snapshot = null) {
  const amount = Number(quantity);
  const measure = portionMeasure(unit, measures, snapshot);
  if (!measure || !Number.isFinite(amount) || amount < 0) return null;
  return amount * measure.grams_equivalent;
}

export function changePortionMeasure(value, unit, measures = []) {
  const previousUnit = value.measureId ?? value.measureCode ?? value.unit;
  const grams = portionGrams(value.quantity, previousUnit, measures, value.measure);
  const measure = portionMeasure(unit, measures);
  if (!measure) throw new Error('Medida sem equivalência em gramas.');
  return {
    ...value, quantity: grams === null ? 1 : Number((grams / measure.grams_equivalent).toFixed(6)),
    measureId: isGramUnit(unit) ? 'gram' : String(unit), measureCode: isGramUnit(unit) ? 'gram' : String(unit),
    measure: isGramUnit(unit) ? null : measure,
  };
}
