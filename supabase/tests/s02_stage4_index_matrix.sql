begin;

do $$
declare
  v_count integer;
begin
  if to_regclass('public.idx_anamnesis_templates_nutri') is not null then
    raise exception 's02_duplicate_anamnesis_index_remains';
  end if;
  if to_regclass('public.idx_anamnesis_templates_nutritionist_id') is null then
    raise exception 's02_canonical_anamnesis_index_missing';
  end if;

  select count(*) into v_count
  from pg_index candidate
  join pg_class candidate_class on candidate_class.oid = candidate.indexrelid
  join pg_class table_class on table_class.oid = candidate.indrelid
  join pg_namespace table_schema on table_schema.oid = table_class.relnamespace
  where table_schema.nspname = 'public'
    and table_class.relname = 'anamnesis_templates'
    and pg_get_indexdef(candidate.indexrelid) like '%(nutritionist_id)%';

  if v_count <> 1 then
    raise exception 's02_anamnesis_nutritionist_index_count:%', v_count;
  end if;
end;
$$;

rollback;

