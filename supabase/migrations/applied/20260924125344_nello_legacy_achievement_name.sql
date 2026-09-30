update public.achievements set name = 'Lenda do Nello' where criteria @> '{"type":"meal_count","count":500}'::jsonb and name = 'Lenda do HipoZero';
