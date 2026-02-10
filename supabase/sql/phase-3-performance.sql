-- Fase 3: performance e manutencao
-- Objetivo: criar indices de FKs sem cobertura e gerar relatorio de duplicados.

begin;

-- Criar indices para FKs sem cobertura (automatico)
do $$
declare
  r record;
  idx_name text;
  cols text;
begin
  for r in
    select
      c.conrelid::regclass as table_name,
      c.conname,
      array_agg(a.attname order by x.n) as col_names
    from pg_constraint c
    join lateral unnest(c.conkey) with ordinality as x(attnum, n) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = x.attnum
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
    group by c.conrelid, c.conname
  loop
    cols := array_to_string(r.col_names, ',');

    -- Verifica se ja existe indice que cobre as colunas da FK
    if not exists (
      select 1
      from pg_index i
      join pg_class t on t.oid = i.indrelid
      join pg_attribute a on a.attrelid = t.oid
      where t.oid = r.table_name
        and i.indisvalid
        and i.indisready
        and array_to_string(
              array(
                select a2.attname
                from unnest(i.indkey) with ordinality k(attnum, n)
                join pg_attribute a2 on a2.attrelid = t.oid and a2.attnum = k.attnum
                order by k.n
              ),
              ','
            ) = cols
    ) then
      idx_name := format('idx_%s_%s', r.table_name::text, replace(cols, ',', '_'));
      execute format('create index if not exists %I on %s (%s)', idx_name, r.table_name, cols);
    end if;
  end loop;
end $$;

-- Relatorio de indices duplicados (apenas SELECT para revisao manual)
-- Revise e remova manualmente se desejar.
-- select
--   t.relname as table_name,
--   array_agg(i.relname) as duplicate_indexes
-- from pg_class t
-- join pg_index ix on t.oid = ix.indrelid
-- join pg_class i on i.oid = ix.indexrelid
-- where t.relnamespace = 'public'::regnamespace
-- group by t.relname, ix.indkey, ix.indclass, ix.indoption
-- having count(*) > 1;

commit;
