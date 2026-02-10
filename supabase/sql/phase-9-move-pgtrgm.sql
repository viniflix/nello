-- Fase 9: mover extensao pg_trgm para schema separado
-- Executar apenas se voce tiver permissao de alterar extensoes.

begin;

create schema if not exists extensions;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'alter extension pg_trgm set schema extensions';
  else
    raise notice 'pg_trgm nao instalada, nada a mover';
  end if;
end $$;

commit;
