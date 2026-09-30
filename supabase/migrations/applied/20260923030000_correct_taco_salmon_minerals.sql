-- TACO 4ª edição, alimento 315 (salmão, filé, com pele, fresco, grelhado):
-- por 100 g: cálcio 29 mg, magnésio 28 mg, fósforo 300 mg, potássio 384 mg.
-- Fonte: NEPA/UNICAMP, tabela 1, páginas 47–48 da edição impressa.
-- Backup privado da linha antes da execução; altera apenas dados da fonte foods.
BEGIN;

DO $fix$
DECLARE
  old_food public.reference_foods%rowtype;
  affected integer;
BEGIN
  PERFORM pg_advisory_xact_lock(2026092303);
  SELECT * INTO old_food FROM public.reference_foods
  WHERE id = 'ca18236b-0b3a-4212-8d17-b9e9003f51d8' FOR UPDATE;
  IF NOT FOUND OR old_food.source <> 'TACO'
     OR old_food.name <> 'Salmão, filé, com pele, fresco, grelhado' THEN
    RAISE EXCEPTION 'Identidade do alimento TACO mudou';
  END IF;
  IF (old_food.calcium, old_food.magnesium, old_food.phosphorus, old_food.potassium)
      = (29, 28, 300, 384) THEN RETURN; END IF;
  IF abs(old_food.calcium - 10.3246666666667) > 0.000001
     OR abs(old_food.magnesium - 21.1226666666667) > 0.000001
     OR abs(old_food.phosphorus - 203.712) > 0.000001
     OR abs(old_food.potassium - 248.64) > 0.000001 THEN
    RAISE EXCEPTION 'Valores da fonte mudaram; revisar antes de corrigir';
  END IF;
  UPDATE public.reference_foods
  SET calcium = 29, magnesium = 28, phosphorus = 300, potassium = 384
  WHERE id = old_food.id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Esperado um alimento corrigido'; END IF;
END;
$fix$;

COMMIT;
