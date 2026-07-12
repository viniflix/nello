# Task 4 Report: API frontend e perfil progressivo

## RED

- API/schema: `npm run test:run -- src/features/clinical-records/api/record-foundation-queries.test.js src/features/clinical-records/model/progressiveProfileSchema.test.js` falhou com os dois módulos de produção ausentes.
- Hook: `npm run test:run -- src/hooks/usePatientHub.test.js` falhou porque `foundation`, `legalGuardians` e `profileRequirements` não existiam.
- Fallback de episódio: o teste falhou sem carregar guardians quando a foundation não continha registros; implementado fallback para `profile.care_episode_id`.

## GREEN

- Seis wrappers RPC retornando `{data,error}`, com payloads `p_*` exatos e `logSupabaseError` na fronteira Supabase.
- Schema Zod com nome obrigatório e opcionais, normalização de vazios para `null` e preservação explícita de address.
- Requisitos contextuais determinísticos somente para idade e responsável legal.
- `usePatientHub` carrega foundation com o resumo, mantém fallback atual, carrega guardians pelo episódio e expõe os novos estados.
- Focais finais: 3 arquivos, 16 testes aprovados.

## Verify

- `npm run verify`: exit 0.
- Estrutura aprovada; lint com 0 erros e 28 warnings preexistentes; 24 arquivos/100 testes aprovados; build Vite e bundle budget aprovados.

## Commit

- Mensagem: `feat: add clinical record foundation api`
- Hash: preenchido após o commit (ver histórico Git).

## Preocupações

- A RPC `get_patient_record_foundation` da Task 3 não retorna explicitamente o episódio ativo. O hook usa, em ordem, dados da foundation/records e o `care_episode_id` do resumo existente para listar responsáveis.
- Os 28 warnings de lint já existentes permanecem fora do escopo; não há erros de lint.
