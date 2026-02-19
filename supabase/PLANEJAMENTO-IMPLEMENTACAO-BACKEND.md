# Planejamento: Implementação das melhorias do backend (test-backend-schema)

Este documento define as **fases de implementação** das melhorias identificadas na [ANALISE-COMPARATIVA-BACKEND.md](./ANALISE-COMPARATIVA-BACKEND.md), com **SQL por fase** e **tarefas de frontend** correspondentes, para evitar perda de informação e permitir rollback por etapa.

---

## Como usar este documento

1. **Por fase:** Execute o SQL da fase no Supabase (SQL Editor ou migration) e, em seguida, valide o frontend correspondente (já alterado ou a alterar conforme a tabela abaixo).
2. **Ordem:** Fases 1 → 2 → 3 → … (dependências descritas no texto).
3. **Rollback:** Cada fase traz ao final do arquivo SQL (ou na seção correspondente) os comandos de rollback para desfazer só aquela fase.
4. **Staging:** Recomendado testar cada fase em ambiente de staging antes de produção.

| Fase | Arquivo SQL | Frontend |
|------|-------------|----------|
| 1 | `sql/impl-fase-1-auth-convites.sql` | Já implementado (AuthContext, RegisterPage, PatientInvitesPage, rota `/patient/invites`) |

---

## Premissas e estado atual

- **Escopo:** Apenas **nutricionista** e **paciente**. Não há implementação de dashboard admin nem de Asaas/assinaturas.
- **Banco atual (Supabase):** `user_profiles` com `full_name` e `role` (enum `app_role`). Tabelas de financeiro: `financial_records` (não `financial_transactions`). Chat: `chat_rooms` + `chat_messages` (não tabela `chats` com from_id/to_id).
- **Frontend atual:** Usa em vários lugares `profile.name` e `profile.user_type`; usa `financial_transactions` e tabela `chats`. Será necessário adaptar para `full_name`/`role`, `financial_records` e `chat_rooms`/`chat_messages` nas fases em que isso for tocado.
- **Ordem:** Cada fase tem um arquivo SQL em `supabase/sql/impl-*.sql` (ou migrations) e, quando aplicável, alterações no frontend descritas nesta página e feitas em conjunto.

---

## Visão geral das fases

| Fase | Nome | Conteúdo principal | Frontend |
|------|------|--------------------|----------|
| **1** | Auth + Convites | Trigger `handle_new_user`, `redeem_invite_code`, trigger `notify_invite`, compatibilidade perfil | Normalizar perfil (name/user_type), tela/fluxo de resgate de código |
| **2** | Chat room automático + notificações | Trigger `create_chat_room_on_link`, `update_room_timestamp`; trigger `notify_diet_activation` | (Opcional) Ajustes se já usar chat_rooms |
| **3** | Financeiro | `get_financial_dashboard`, trigger `sync_appointment_to_finance` | Usar `financial_records` e RPC para KPIs |
| **4** | Diário e timeline | Triggers `audit_diary_changes`, `trigger_log_to_timeline` | Exibir timeline/auditoria onde fizer sentido |
| **5** | Funções de apoio | `get_patient_by_email`, `get_upcoming_birthdays`, `get_patient_lifecycle_status`, `update_patient_settings` | Chamar RPCs nas telas de nutri/paciente |
| **6** | Desafios (lógica no banco) | Rewards, scoring, conquistas, regras bloqueadas, etc. | Manter/ajustar telas de desafios para usar RPCs |
| **7** | Polish | Revisão de RLS/índices; remover policy temporária de INSERT em `user_profiles` (se o trigger estiver estável) | — |

---

## Fase 1 — Auth e convites

**Objetivo:** Criação de perfil no signup via trigger; resgate de código de convite via RPC; notificação in-app ao criar convite.

**Arquivo SQL:** `supabase/sql/impl-fase-1-auth-convites.sql`

### 1.1 Backend (SQL)

- Criar função `handle_new_user()` e trigger em `auth.users` (AFTER INSERT) para inserir em `user_profiles` (`id`, `email`, `full_name`, `role`, `avatar_url`).
- **Nota:** No Supabase, o trigger em `auth.users` pode exigir que o script seja executado no SQL Editor do projeto (com permissões do banco). Se falhar com "permission denied", criar o trigger manualmente no Dashboard ou via migration com role adequada.
- Criar função `redeem_invite_code(input_code text)` (valida código em `access_codes`, cria vínculo em `nutritionist_patients`, incrementa `uses_count`, retorna JSON).
- Criar função `notify_invite()` e trigger `on_invite_created` AFTER INSERT em `invitations` (notificação in-app para usuário existente cujo email = `patient_email` do convite).
- **Não** remover de imediato a policy de INSERT em `user_profiles`; manter como fallback até validar o trigger em produção.

### 1.2 Frontend (implementado)

- **AuthContext:** Após carregar perfil, normalizar: `profile.name = profile.full_name ?? profile.name`, `profile.user_type = profile.role ?? profile.user_type` (retorno e em todos os retornos de `createProfileIfMissing`). Self-healing passou a inserir `full_name`, `role`, `avatar_url` (colunas atuais do banco).
- **RegisterPage:** Envio em `options.data` de `full_name` e `role` para o trigger preencher corretamente.
- **Resgate de código:** Página `/patient/invites` (`PatientInvitesPage.jsx`) com formulário que chama `supabase.rpc('redeem_invite_code', { input_code })` e exibe sucesso/erro; em sucesso redireciona para `/patient`. Rota registrada em `patientRoutes.jsx`.
- **Notificação:** O link da notificação de convite é `/patient/invites`; a página permite resgatar código (para códigos de `access_codes`; convites por email continuam com o fluxo da Edge Function create-patient).

### 1.3 Rollback (SQL)

- Comentado no final do arquivo `impl-fase-1-auth-convites.sql`.

---

## Fase 2 — Chat room automático e notificações

**Objetivo:** Sala de chat criada automaticamente ao vincular paciente; atualização de `last_message_at`; notificação quando plano ativa.

### 2.1 Backend (SQL)

- Função `create_chat_room_on_link()` e trigger AFTER INSERT em `nutritionist_patients` (INSERT em `chat_rooms` com `nutritionist_id`, `patient_id`, ON CONFLICT DO NOTHING).
- Função `update_room_timestamp()` e trigger AFTER INSERT em `chat_messages` (atualizar `last_message_at` da `chat_rooms`).
- Função `notify_diet_activation()` e trigger AFTER UPDATE em `meal_plans` (quando `status` passa a `active`, INSERT em `notifications` para o paciente).

### 2.2 Frontend

- Se o app ainda usar tabela `chats` (from_id/to_id): planejar migração para `chat_rooms` + `chat_messages` (Fase 2 ou fase dedicada). Se já usar `chat_rooms`/`chat_messages`, apenas garantir que ao abrir chat não dependa de “criar sala manualmente” (o trigger já cria).
- Notificações: link “Novo Plano Alimentar” pode apontar para `/patient/diet` ou equivalente.

### 2.3 Rollback

- DROP dos triggers em `nutritionist_patients`, `chat_messages`, `meal_plans`; DROP das três funções.

---

## Fase 3 — Financeiro

**Objetivo:** Dashboard financeiro via RPC; sincronização consulta paga → `financial_records`.

### 3.1 Backend (SQL)

- Função `get_financial_dashboard()` que retorna totais (receita/despesa realizadas, previsões, saldo) a partir de `financial_records` e `appointments` (nutricionista = auth.uid()).
- Trigger `sync_appointment_to_finance`: AFTER UPDATE em `appointments`; quando `payment_status` passa a `paid`, INSERT em `financial_records` (income, categoria Consultas, valor de `price_snapshot`).

### 3.2 Frontend

- Trocar uso de `financial_transactions` por `financial_records` (tabela e colunas: ex. `date`, `is_paid` em vez de `transaction_date`, `status`). Ajustar `financial-queries.js` e componentes (FinancialPage, KPIs, listas, etc.).
- Usar `supabase.rpc('get_financial_dashboard')` para os KPIs do dashboard financeiro em vez de calcular no cliente (ou em paralelo até validar).

### 3.3 Rollback

- DROP trigger em `appointments`; DROP função `get_financial_dashboard` e `sync_appointment_to_finance`.

---

## Fase 4 — Diário alimentar e timeline

**Objetivo:** Auditoria e timeline no banco (INSERT/UPDATE/DELETE em `food_diary_entries`).

### 4.1 Backend (SQL)

- Função `audit_diary_changes()` e trigger em `food_diary_entries` (escrever em `food_diary_audit_logs` e em `patient_timeline` conforme o teste).
- Centralizar lógica de evento em `trigger_log_to_timeline` se existir no teste; senão, manter lógica dentro do trigger de auditoria.

### 4.2 Frontend

- Onde houver “timeline” ou “histórico do diário”, consumir `patient_timeline` e/ou `food_diary_audit_logs` (já existentes).

### 4.3 Rollback

- DROP trigger em `food_diary_entries`; DROP funções criadas.

---

## Fase 5 — Funções de apoio (nutri e paciente)

**Objetivo:** RPCs úteis para fluxos de nutricionista e paciente (sem dashboard admin).

### 5.1 Backend (SQL)

- `get_patient_by_email(p_email text)` — retorna id, full_name, role (uso: nutri ao adicionar/buscar paciente).
- `get_upcoming_birthdays()` — aniversários dos pacientes do nutricionista.
- `get_patient_lifecycle_status(p_id uuid)` — jsonb com anamnese, antropometria, dieta ativa, etc.
- `update_patient_settings(p_patient_id, p_settings jsonb)` — atualizar `app_settings` em `nutritionist_patients`.

### 5.2 Frontend

- Onde fizer sentido: buscar paciente por email (ex.: ao adicionar), widget de aniversários, card de “status do paciente”, configurações do paciente (módulos/comportamento) chamando as RPCs.

### 5.3 Rollback

- DROP das quatro funções.

---

## Fase 6 — Desafios (challenges)

**Objetivo:** Regras de negócio no Postgres (rewards, scoring, conquistas, bloqueio de regras).

### 6.1 Backend (SQL)

- Conjunto de funções e triggers do teste: `apply_challenge_rewards`, `apply_challenge_scoring_for_user_day`, `check_and_grant_challenge_streak`, `compute_challenge_points_for_day`, `finalize_challenge`, `grant_achievement`, `ensure_challenge_owner_participant`, `apply_join_policy_on_participant_insert`, `validate_challenge_rules`, `lock_challenge_rules`, `trg_challenges_on_completed`, triggers em `daily_logs` e `food_diary_entries` para scoring, etc. (aplicar em bloco ou subdividir em 6a/6b se preferir).

### 6.2 Frontend

- Garantir que telas de desafios (criação, leaderboard, conquistas) usem os RPCs/eventos gerados pelos triggers (sem duplicar lógica crítica no cliente).

### 6.3 Rollback

- Script de DROP de todos os triggers e funções adicionados nesta fase.

---

## Fase 7 — Polish (sem Asaas)

**Objetivo:** Revisão final de RLS e índices; remover policy temporária de INSERT em `user_profiles` quando o trigger `handle_new_user` estiver estável. **Não inclui** Asaas nem webhook de assinaturas.

### 7.1 Backend (SQL)

- Revisar políticas RLS e índices conforme análise (padronizar nomes, índices em FKs onde fizer sentido).
- Remover policy temporária de INSERT em `user_profiles` se o trigger `handle_new_user` estiver validado em produção.

### 7.2 Frontend

- Nenhuma alteração específica.

### 7.3 Rollback

- Recriar a policy de INSERT em `user_profiles` se necessário; reverter alterações de RLS/índices se aplicável.

---

## Ordem de execução recomendada

1. **Fase 1** — base de auth e convites.
2. **Fase 2** — chat e notificações (melhora UX sem quebrar fluxos).
3. **Fase 3** — financeiro (exige migração de `financial_transactions` → `financial_records` no frontend).
4. **Fase 4** — diário/timeline.
5. **Fase 5** — funções de apoio (nutri e paciente).
6. **Fase 6** — desafios (maior volume de lógica).
7. **Fase 7** — polish (RLS, índices, policy user_profiles).

Cada fase deve ser testada em ambiente de staging antes de produção. Os arquivos SQL de cada fase ficarão em `supabase/sql/` com prefixo `impl-fase-N-...` (ou em migrations numeradas), e este .md será atualizado com “Concluído” e data quando a fase for aplicada.
