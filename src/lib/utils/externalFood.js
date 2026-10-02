/** FatSecret v4 reports macros in g, minerals in mg and A/D in µg.
 * Do not infer density or convert a missing nutrient into zero. */
export function mapFatSecretToOFF(food) {
  const raw = food?.servings?.serving;
  const servings = (Array.isArray(raw) ? raw : [raw]).filter(value => value
    && value.metric_serving_unit === 'g'
    && Number.isFinite(Number(value.metric_serving_amount)) && Number(value.metric_serving_amount) > 0);
  const serving = servings.find(value => Number(value.metric_serving_amount) === 100) || servings[0];
  if (!serving) throw new Error('A fonte não informa peso em gramas. Use o rótulo ou o catálogo interno; não é possível assumir que 100 ml equivalem a 100 g.');
  const factor = 100 / Number(serving.metric_serving_amount);
  const fields = { protein:['proteins',1],carbohydrate:['carbohydrates',1],fat:['fat',1],calories:['energy_kcal',1],
    fiber:['fiber',1],sugar:['sugars',1],saturated_fat:['saturated_fat',1],trans_fat:['trans_fat',1],
    monounsaturated_fat:['monounsaturated_fat',1],polyunsaturated_fat:['polyunsaturated_fat',1],
    sodium:['sodium',1000],cholesterol:['cholesterol',1000],calcium:['calcium',1000],iron:['iron',1000],potassium:['potassium',1000],
    vitamin_a:['vitamin_a',1000000],vitamin_c:['vitamin_c',1000],vitamin_d:['vitamin_d',1000000] };
  const nutriments = {};
  for (const [key,[target,scale]] of Object.entries(fields)) {
    const rawValue = serving[key];
    if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') continue;
    const value = Number(rawValue);
    if (Number.isFinite(value) && value >= 0) nutriments[`${target}_100g`] = value * factor / scale;
  }
  return { product_name:food.food_name, brands:food.brand_name || '', nutriments };
}

/** Normalize explicit gram-based labels; unknown values stay absent. */
export function normalizeExternalProduct(product) {
  if (product?.nutrition_data_per === '100ml' || product?.nutrition_data_prepared_per === '100ml') {
    throw new Error('A fonte não informa peso em gramas. Consulte o rótulo para preencher alimentos líquidos.');
  }
  const raw = product?.nutriments || {};
  const explicit = String(product?.serving_size || '').trim().match(/^(\d+(?:[.,]\d+)?)\s*g$/i);
  const grams = product?.serving_quantity_unit === 'g' ? Number(product.serving_quantity)
    : explicit ? Number(explicit[1].replace(',', '.')) : null;
  const valid = value => typeof value !== 'boolean' && value != null && String(value).trim() !== ''
    && Number.isFinite(Number(value)) && Number(value) >= 0;
  const nutriments = {};
  for (const [key,value] of Object.entries(raw)) {
    if (key.endsWith('_100g') && valid(value)) nutriments[key] = Number(value);
  }
  if (grams > 0 && Number.isFinite(grams)) {
    for (const [key,value] of Object.entries(raw)) {
      if (!key.endsWith('_serving') || !valid(value)) continue;
      const target = key.slice(0, -8) + '_100g';
      if (nutriments[target] === undefined) nutriments[target] = Number(value) * 100 / grams;
    }
  }
  return { ...product, nutriments, serving_size: null, serving_quantity: null };
}
