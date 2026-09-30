CREATE OR REPLACE FUNCTION public.convert_custom_measure_to_grams()
RETURNS TRIGGER AS $$
BEGIN
  -- Converter meal_plan_foods
  UPDATE public.meal_plan_foods
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter meal_plan_food_substitutions
  UPDATE public.meal_plan_food_substitutions
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter diet_template_foods
  UPDATE public.diet_template_foods
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter diet_template_food_substitutions
  UPDATE public.diet_template_food_substitutions
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter meal_template_foods
  UPDATE public.meal_template_foods
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter meal_template_food_substitutions
  UPDATE public.meal_template_food_substitutions
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter recipe_ingredients
  UPDATE public.recipe_ingredients
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter meal_items (Diário do paciente)
  UPDATE public.meal_items
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
