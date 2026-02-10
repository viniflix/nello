## Execucao por etapas (SQL) + testes

### Ordem recomendada
1. `phase-1-security.sql`
2. `phase-2-structure.sql`
3. `phase-3-performance.sql`
4. `phase-4-linter-cleanup.sql`
5. `phase-5-rls-initplan.sql`
6. `phase-6-index-cleanup.sql`
7. `phase-7-rls-initplan-auto.sql`
8. `phase-8-rls-consolidation.sql`
9. `phase-9-move-pgtrgm.sql` (opcional)
10. `phase-10-rls-initplan-targeted.sql`
11. `phase-11-rls-initplan-functions.sql`
12. `phase-12-unused-index-cleanup.sql` (opcional)
13. `phase-13-fk-indexes.sql` (recomendado)
14. `phase-14-unused-index-cleanup-extra.sql` (opcional)
15. `phase-15-rls-helper-functions.sql`

---

## Fase 1 - Testes de seguranca critica

### Autenticacao e perfil
- Login como paciente e nutricionista.
- Verificar carregamento de `user_profiles` sem erro.
- Atualizar avatar e dados basicos (nome/telefone).

### Plano alimentar (nutricionista)
- Criar plano alimentar para um paciente.
- Adicionar refeicao e alimentos.
- Reabrir plano e conferir dados.

### Plano alimentar (paciente)
- Abrir home/diario e ver plano ativo.
- Confirmar que apenas seus dados aparecem.

### Diario alimentar
- Paciente cria refeicao e itens.
- Paciente edita refeicao e valida auditoria.
- Nutricionista visualiza refeicoes do paciente.

### Exames laboratoriais
- Nutricionista cria exame e faz upload de PDF.
- Paciente consegue visualizar o exame e o PDF.

### Financeiro
- Nutricionista cria transacao com anexo.
- Listagem de transacoes e pacientes nao quebra.

### Chat
- Paciente envia mensagem para nutricionista com midia.
- Nutricionista abre chat e baixa/visualiza midia.

---

## Fase 2 - Testes estruturais

### RPCs
- Conferir chamadas RPC existentes no frontend:
  - `get_admin_dashboard_stats`, `get_daily_adherence`,
    `get_patients_low_adherence_optimized`,
    `get_patients_pending_data_optimized`,
    `get_comprehensive_activity_feed_optimized`,
    `calculate_macro_targets`, `calculate_goal_progress`,
    `check_and_grant_achievements`, `log_meal_action`,
    `get_chat_recipient_profile`, `mark_chat_notifications_as_read`,
    `get_unread_senders`, `delete_user_account`.
- Validar logs de erro no console e no Supabase.

### Trigger (se habilitar)
- Criar novo usuario e confirmar que `user_profiles` e criado automaticamente.
- Remover policy temporaria de insert em `user_profiles`.

---

## Fase 3 - Testes de performance

### Indices
- Rodar queries mais pesadas (feed, diario, financeiro) e comparar latencia.
- Verificar se novos indices nao degradaram inserts de alto volume.

---

## Fase 4 - Testes de lints/seguranca

### RLS residual
- Validar acesso a `meal_history` e `glycemia_records` (paciente e nutricionista).
- Confirmar que leitura funciona e escrita continua bloqueada onde esperado.

### Policies duplicadas
- Rodar o linter e confirmar reducao de `multiple_permissive_policies`.

---

## Fase 5 - Testes de performance (RLS initplan)

### Policies otimizadas
- Rodar linter e confirmar reducao de `auth_rls_initplan`.
- Verificar leituras/updates basicos (perfil, planos, chat, financeiro).

---

## Fase 6 - Testes de indices

### Duplicados removidos
- Rodar linter e confirmar que `duplicate_index` sumiu.
- Executar consultas em `meals` e `prescriptions` para garantir planos/receitas carregando.

---

## Fase 7 - Testes de performance (auth_rls_initplan)

### Policies reescritas
- Rodar linter e confirmar reducao de `auth_rls_initplan`.
- Validar leitura basica em tabelas com RLS (perfil, planos, anamnese).

---

## Fase 8 - Testes de policies duplicadas

### Consolidacao
- Rodar linter e confirmar reducao de `multiple_permissive_policies`.
- Validar leitura de `meal_plans`, `appointments`, `foods`, `patient_goals`, `user_profiles`.

---

## Fase 9 - Testes de extensao (opcional)

### pg_trgm
- Executar somente se tiver permissao de alterar extensoes.
- Rodar linter e confirmar que `extension_in_public` sumiu.

---

## Fase 10 - Testes de performance (auth_rls_initplan restante)

### Policies especificas
- Rodar linter e confirmar que `auth_rls_initplan` caiu para zero.
- Validar leitura/escrita nas tabelas afetadas (anamnese, foods, goals).

---

## Fase 11 - Testes de performance (wrappers auth)

### Wrappers estaveis
- Rodar linter e confirmar que `auth_rls_initplan` caiu para zero.
- Validar leitura/escrita basica nas tabelas com RLS.

---

## Fase 12 - Testes de indices (opcional)

### Remocao de unused_index
- Execute apenas apos confirmar uso real.
- Rodar linter e validar rotas criticas (feeds, financeiro, anamnese).

---

## Fase 13 - Testes de FKs sem indice

### Indices para FKs
- Rodar linter e confirmar que `unindexed_foreign_keys` sumiu.
- Validar telas que fazem join por FK (anamnese, financeiro, metas).

---

## Fase 14 - Testes de indices (opcional)

### Remocao de unused_index (nao-FK)
- Execute apenas se tiver certeza que nao usa esses filtros.
- Rodar linter e validar telas de busca/filtros.

---

## Fase 15 - Testes de RLS helpers

### Recursao de policies
- Recarregar dashboard e verificar se 500/stack depth sumiu.
- Rodar `get_daily_adherence` novamente.

---

## Rollback rapido (se necessario)

- Reverter policies criadas nesta fase:
  - `drop policy if exists ...` (usar os nomes nos SQLs).
- Desabilitar RLS temporariamente:
  - `alter table public.<tabela> disable row level security;`

