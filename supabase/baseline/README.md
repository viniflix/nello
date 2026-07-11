# Baseline do banco Nello

Este diretório guarda somente o schema reproduzível do banco. Dados, senhas, tokens, owners e credenciais nunca devem entrar aqui.

## Estado verificado em 11/07/2026

- Projeto remoto: `afyoidxrshkmplxhcyeh` (`hipozero`, nome legado no painel).
- PostgreSQL remoto: 17.6.
- 79 migrações registradas remotamente.
- 67 tabelas públicas e 156 policies em 67 tabelas.
- 102 funções públicas; 5 são `SECURITY DEFINER` e executáveis por `anon`.
- O dump oficial ainda depende de `SUPABASE_DB_PASSWORD` e de Docker ativo para o restore local.

## Captura segura

1. Defina `SUPABASE_DB_PASSWORD` somente no ambiente da sessão; não salve em `.env`.
2. Inicie o Docker Desktop.
3. Execute `powershell -ExecutionPolicy Bypass -File scripts/qa/capture-supabase-baseline.ps1`.
4. Revise o diff e confirme que o arquivo contém apenas DDL.
5. Execute `npx supabase db start --from-backup supabase/baseline/remote_schema_20260711.sql` em ambiente descartável.

O script interrompe a captura se encontrar comandos de dados ou padrões comuns de segredo.
