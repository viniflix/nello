-- S0.2 / estágio 1: usuários da aplicação não podem criar objetos no schema exposto.
-- Migrations continuam sendo executadas pelo papel administrativo do projeto.
set lock_timeout = '5s';
set statement_timeout = '30s';

revoke create on schema public from public;
revoke create on schema public from anon;
revoke create on schema public from authenticated;

grant usage on schema public to anon;
grant usage on schema public to authenticated;
