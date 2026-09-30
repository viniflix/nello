-- The existing diet RPCs are already transactional. Reject unavailable food
-- references there as well, including when a direct write reaches the table.
create or replace function private.validate_diet_template_food() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.quantity is null or new.quantity::text = 'NaN' or new.quantity <= 0
    or new.quantity > 100000
    or not exists (select 1 from public.foods f where f.id = new.food_id and f.is_active
      and (f.nutritionist_id is null or f.nutritionist_id = auth.uid())) then
    raise exception using errcode = '22023', message = 'invalid_diet_template_food';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validate_diet_template_food on public.diet_template_foods;
create trigger trg_validate_diet_template_food before insert or update of food_id, quantity
on public.diet_template_foods for each row execute function private.validate_diet_template_food();
