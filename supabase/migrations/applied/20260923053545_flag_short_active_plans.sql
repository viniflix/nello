-- Review existing active plans with at most two meals. This is a review signal,
-- not an automatic change to a signed prescription or an assumed calorie target.
insert into public.patient_module_sync_flags (patient_id,needs_meal_plan_review,updated_at)
select distinct p.patient_id,true,now()
from public.meal_plans p
where p.patient_id is not null and p.is_active and p.archived_at is null
  and (select count(*) from public.meal_plan_meals m where m.meal_plan_id=p.id) <= 2
on conflict (patient_id) do update
set needs_meal_plan_review=true,updated_at=now();
