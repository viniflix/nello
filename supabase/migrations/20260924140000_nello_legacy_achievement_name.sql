-- Rename the only user-facing achievement that still carried the former brand.
-- Match by the stable achievement criterion so repeated deployments are safe.
update public.achievements
set name = 'Lenda do Nello'
where criteria @> '{"type":"meal_count","count":500}'::jsonb
  and name = 'Lenda do HipoZero';
