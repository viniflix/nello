create or replace function public.stamp_editor_shadow_draft()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists editor_shadow_drafts_stamp on public.editor_shadow_drafts;
create trigger editor_shadow_drafts_stamp
  before insert or update on public.editor_shadow_drafts
  for each row execute function public.stamp_editor_shadow_draft();
