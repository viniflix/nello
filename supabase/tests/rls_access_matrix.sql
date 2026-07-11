-- Matriz RLS do Nello.
-- Executar somente em banco local/descartável após carregar personas fictícias.
-- IDs abaixo devem ser substituídos pelos IDs determinísticos do seed oficial de QA.
-- A matriz é transacional e nunca deve persistir alterações.

begin;

-- Cenários obrigatórios por tabela clínica:
-- 1. paciente lê somente seus próprios dados;
-- 2. nutricionista lê/escreve dados de vínculo ativo próprio;
-- 3. nutricionista alheio não lê nem escreve;
-- 4. ex-nutricionista acessa apenas o episódio histórico encerrado;
-- 5. novo nutricionista não acessa o episódio anterior;
-- 6. anon acessa somente fluxos públicos por token válido e escopo mínimo;
-- 7. token expirado/revogado não expõe anamnese;
-- 8. admin usa funções administrativas explícitas, não bypass genérico de portal.

do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'nutritionist_patients'
  ) then
    raise exception 'Tabela obrigatória ausente: public.nutritionist_patients';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nutritionist_patients'
  ) then
    raise exception 'RLS sem policies: public.nutritionist_patients';
  end if;
end $$;

rollback;
