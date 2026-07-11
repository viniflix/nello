# Baseline do banco Nello

Este diretório guarda somente os schemas de aplicação `public` e `private`. O schema privado contém as implementações chamadas pelas fachadas RPC públicas. Os schemas gerenciados `auth` e `storage` são provisionados pela versão local do Supabase e não devem ser restaurados por cima dela. Dados, senhas, tokens, owners e credenciais nunca devem entrar aqui.

## Estado verificado em 11/07/2026

- Projeto remoto: `afyoidxrshkmplxhcyeh` (`hipozero`, nome legado no painel).
- PostgreSQL remoto: 17.6.
- 79 migrações registradas remotamente.
- 67 tabelas públicas e 156 policies em 67 tabelas.
- 102 funções públicas; 5 são `SECURITY DEFINER` e executáveis por `anon`.
- O CLI já está autenticado e vinculado; Docker ativo é necessário para captura e restore local.

## Captura segura

1. Inicie o Docker Desktop.
2. Execute `powershell -ExecutionPolicy Bypass -File scripts/qa/capture-supabase-baseline.ps1`.
3. Revise o diff e confirme que o arquivo contém apenas DDL.
4. Execute `powershell -ExecutionPolicy Bypass -File scripts/qa/verify-supabase-baseline.ps1`.

O script interrompe a captura se encontrar comandos de dados ou padrões comuns de segredo. O restore usa um contêiner descartável próprio porque o modo `supabase db start --from-backup` tenta restaurar antes de provisionar corretamente os papéis locais na versão atual da CLI.
