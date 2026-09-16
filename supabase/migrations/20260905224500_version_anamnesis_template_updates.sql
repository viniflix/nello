-- Keep the template revision aligned with every structural/content change.
create or replace function private.version_anamnesis_template_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(new.title, new.description, new.sections)
      is distinct from row(old.title, old.description, old.sections) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;

revoke all on function private.version_anamnesis_template_update()
  from public, anon, authenticated;

drop trigger if exists trg_version_anamnesis_template_update
  on public.anamnesis_templates;
create trigger trg_version_anamnesis_template_update
before update on public.anamnesis_templates
for each row execute function private.version_anamnesis_template_update();
