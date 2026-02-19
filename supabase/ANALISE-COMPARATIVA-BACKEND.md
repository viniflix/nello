# Análise comparativa: Backend atual vs. Backend de teste (test-backend-schema.sql)

**Data da análise:** Fevereiro 2026  
**Objetivo:** Comparar o estado atual do banco (projeto Supabase hipozero) com o schema de teste `test-backend-schema.sql`, identificar diferenças, melhorias e o que pode ser aproveitado. O backend de teste é apenas uma proposta de melhoria — nada será aplicado automaticamente.

**Escopo da implementação:** Apenas fluxos de **nutricionista** e **paciente**. Não estão no escopo: dashboard admin, Asaas/assinaturas nem funções exclusivas de administração da plataforma.

---

## 1. Fontes consideradas

| Fonte | Descrição |
|-------|-----------|
| **Backend atual** | Projeto Supabase **hipozero** (região us-east-2). Tabelas e estrutura obtidas via API Supabase. Scripts locais em `supabase/sql/` (phases 1–16) e `supabase/migrations/`. |
| **Backend novo (teste)** | Arquivo `supabase/test-backend-schema.sql` — dump completo com tipos, tabelas, funções, triggers, políticas RLS e índices. |

**Observação:** Os scripts em `sql/phase-*.sql` referenciam algumas tabelas que **não existem** no projeto Supabase atual (ex.: `meal_plan_meals`, `meal_plan_foods`, `meal_plan_reference_values`, `financial_transactions`, `recurring_expenses`, `services`, `chats` com `from_id`/`to_id`, `foods`, `patient_goals`, `prescriptions`, `meal_history`, `glycemia_records`, `household_measures`, `food_household_measures`). Isso indica que as phases foram escritas para um schema alternativo ou legado. Esta análise considera como **atual** o que está de fato no projeto Supabase (54 tabelas com `plan_daily_menus`, `chat_rooms`, `nutritionist_foods`, etc.).

---

## 2. Visão geral das tabelas

### 2.1 Conjunto de tabelas

O **backend atual** (Supabase) e o **backend de teste** compartilham o **mesmo conjunto de tabelas** (54 tabelas em `public`). Não há tabelas que existam só em um dos dois na lista principal.

Resumo das tabelas (em ordem alfabética):

- `access_codes`, `achievements`, `anamnesis_records`, `anamnesis_templates`, `anthropometry_records`, `appointments`, `asaas_payments`, `asaas_webhook_events`, `bulk_messages`
- `challenge_activity`, `challenge_checkins`, `challenge_daily_points`, `challenge_participants`, `challenges`
- `chat_group_members`, `chat_group_messages`, `chat_groups`, `chat_messages`, `chat_rooms`
- `consultation_feedback`, `daily_logs`, `energy_expenditure_records`, `financial_records`, `food_diary_audit_logs`, `food_diary_entries`, `food_group_map`, `food_measures`, `invitations`
- `lab_results`, `legal_terms`, `master_measure_units`, `meal_item_substitutions`, `meal_items`, `meal_plans`, `meals`, `notifications`
- `nutritionist_availability`, `nutritionist_foods`, `nutritionist_gateways`, `nutritionist_marketing`, `nutritionist_patients`, `nutritionist_services`
- `patient_timeline`, `plan_daily_menus`, `platform_news`, `recipe_ingredients`, `recipes`, `reference_foods`, `reference_foods_translations`
- `subscriptions`, `supplement_items`, `supplement_prescriptions`, `support_tickets`, `system_logs`
- `user_achievements`, `user_consents`, `user_integrations`, `user_profiles`, `user_reputation`, `user_reputation_events`, `waiting_list`

Ou seja: **não há “tabelas só no novo”**; a estrutura de entidades é a mesma. A diferença está em **funções, triggers, RLS, índices e convenções**.

### 2.2 Tabelas referenciadas nas phases mas inexistentes no Supabase atual

Estas tabelas aparecem em `phase-*.sql` / README mas **não** na listagem atual do projeto:

- `meal_plan_meals`, `meal_plan_foods`, `meal_plan_reference_values` (outra modelagem de plano: refeições genéricas por plano)
- `financial_transactions`, `recurring_expenses`, `services`
- `chats` (modelo com `from_id` / `to_id`)
- `foods`, `food_household_measures`, `household_measures`
- `patient_goals`, `prescriptions`, `meal_history`, `glycemia_records`

Se no futuro alguma delas for criada ou migrada, as phases que as referenciam passarão a fazer sentido para esse ambiente.

---

## 3. Comparação por área

### 3.1 Perfil de usuário (`user_profiles`)

| Aspecto | Atual (Supabase) | Test-backend (test-backend-schema.sql) |
|--------|-------------------|----------------------------------------|
| Identificação de tipo | `role` (enum `app_role`: patient, nutritionist, super_admin) | Igual |
| Nome | `full_name` | `full_name` |
| Vínculo paciente–nutricionista | Tabela `nutritionist_patients` | Idem; **não** há `nutritionist_id` em `user_profiles` |

**Conclusão:** Modelo de perfil e de vínculo estão alinhados. Nenhuma mudança necessária na estrutura de `user_profiles` para “adotar” o teste. (O role super_admin existe no enum; não implementamos fluxos de dashboard admin.)

---

### 3.2 Plano alimentar

Ambos usam a mesma modelagem:

- `meal_plans` → `plan_daily_menus` (dias da semana) → `meals` → `meal_items`
- `meal_items` referenciam `reference_foods` ou `nutritionist_foods`
- `meal_item_substitutions` para substituições

O backend de teste **não** introduz `meal_plan_meals` / `meal_plan_foods`; portanto, nesse ponto o teste está igual ao atual.

---

### 3.3 Chat

- **Atual e teste:** `chat_rooms` (nutritionist_id, patient_id) + `chat_messages` (room_id, sender_id).
- No teste há **trigger** `create_chat_room_on_link`: ao inserir em `nutritionist_patients`, cria automaticamente uma `chat_rooms` para aquele par. **No atual isso não existe** (a sala provavelmente é criada sob demanda no app).

**Melhoria possível:** Adotar o trigger do teste para garantir que sempre exista uma sala quando há vínculo nutricionista–paciente.

---

### 3.4 Financeiro

- **Atual e teste:** apenas `financial_records` (receitas/despesas, parcelas, `parent_transaction_id`).
- No teste existem:
  - **Função** `get_financial_dashboard()`: totais realizados, projetados e saldo.
  - **Trigger** `sync_appointment_to_finance`: ao marcar consulta como paga (e dados de valor), pode criar/atualizar registro em `financial_records`.

**Melhoria possível:** Replicar no atual a função de dashboard e o trigger de sincronização consulta ↔ financeiro (se o produto quiser isso).

---

### 3.5 Autenticação e onboarding

| Recurso | Atual | Teste |
|--------|--------|--------|
| Criação de perfil ao signup | Policy temporária de INSERT em `user_profiles` (phases) | **Trigger** `handle_new_user` em `auth.users`: insere em `user_profiles` com `full_name`, `role`, `avatar_url` |

**Melhoria importante:** O teste usa um trigger em `auth.users` para criar `user_profiles` de forma atômica e sem depender de policy de INSERT. Isso é mais robusto e evita “self-healing” no cliente. Vale considerar migrar para o trigger e depois remover a policy temporária de insert.

---

### 3.6 Convites e códigos de acesso

No teste:

- **Função** `redeem_invite_code(input_code text)`: valida código, verifica se já está vinculado, cria `nutritionist_patients`, incrementa `uses_count` em `access_codes`, retorna JSON (success + nutritionist_id).
- **Trigger** `notify_invite`: ao inserir em `invitations`, notifica usuário existente (por email) com notificação in-app.

No atual isso tende a estar na aplicação. **Melhoria:** Centralizar a lógica de resgate no backend (RPC) e usar o trigger de notificação.

---

### 3.7 Desafios (challenges)

O teste adiciona muita lógica em PL/pgSQL:

- **Funções:**  
  `apply_challenge_rewards`, `apply_challenge_scoring_for_user_day`, `check_and_grant_challenge_streak`, `compute_challenge_points_for_day`, `finalize_challenge`, `is_challenge_valid_for_reputation`, `grant_achievement`, `apply_join_policy_on_participant_insert`, `ensure_challenge_owner_participant`, `transfer_owner_if_needed`, `validate_challenge_rules`, `lock_challenge_rules`, `trg_challenges_on_completed`.
- **Triggers:**  
  Bloqueio de regras após início, aplicação de pontuação, concessão de conquistas, transferência de owner, etc.

No atual, parte disso pode estar no frontend ou em Edge Functions. **Melhoria:** Migrar regras de negócio críticas (pontuação, reputação, conquistas) para o banco, como no teste, para consistência e segurança.

---

### 3.8 Diário alimentar e timeline

No teste:

- **Trigger** `audit_diary_changes`: auditoria em `food_diary_entries` (INSERT/UPDATE/DELETE) com escrita em `food_diary_audit_logs` e em `patient_timeline`.
- **Triggers** que aplicam pontuação de desafios a partir de `daily_logs` e `food_diary_entries` (`trg_daily_logs_apply_scoring`, `trg_food_diary_entries_apply_scoring`).
- **Função** `trigger_log_to_timeline`: centraliza eventos de timeline.

No atual, as phases falam em RLS para `meal_history` e `glycemia_records`, que não existem nesse projeto; a auditoria do diário pode estar só no app. **Melhoria:** Ter auditoria e timeline no banco, como no teste, garante rastreabilidade mesmo se o cliente falhar.

---

### 3.9 Consultas e feedback

No teste:

- **Trigger** `notify_diet_activation`: quando um `meal_plan` passa a `status = 'active'`, envia notificação ao paciente.
- Políticas RLS para `consultation_feedback` (paciente cria feedback da consulta; nutricionista lê).

O atual já tem RLS em `appointments` e provavelmente em feedback; a diferença é a notificação automática de plano ativado. **Melhoria:** Replicar o trigger de notificação de dieta ativada.

---

### 3.10 Assinaturas (Asaas)

**Fora do escopo:** Não implementamos Asaas nem webhook de assinaturas. As tabelas `subscriptions`, `asaas_payments`, `asaas_webhook_events` existem no banco; a função `handle_asaas_webhook_update` do teste não faz parte do plano de implementação (apenas nutri e paciente).

---

## 4. Funções no backend de teste (resumo)

Funções presentes no teste que podem não existir ou diferir no atual:

| Função | Uso sugerido |
|--------|----------------|
| `apply_challenge_rewards` | Recompensas e reputação ao finalizar desafio |
| `apply_challenge_scoring_for_user_day` | Pontuação diária do desafio |
| `apply_join_policy_on_participant_insert` | Aprovação automática quando join_policy = auto |
| `audit_diary_changes` | Auditoria + timeline do diário |
| `can_add_patient` | Verificar se nutricionista pode adicionar paciente |
| `check_achievements` | Conceder conquistas (trigger) |
| `check_and_grant_challenge_streak` | Streak em desafios |
| `compute_challenge_points_for_day` | Cálculo de pontos por dia |
| `create_chat_room_on_link` | Criar sala ao vincular paciente |
| `ensure_challenge_owner_participant` | Garantir owner como participante |
| `finalize_challenge` | Finalizar desafio (ranks, recompensas) |
| `get_financial_dashboard` | Totais financeiros para dashboard (nutri) |
| `get_patient_by_email` | Busca paciente por email |
| `get_patient_lifecycle_status` | Status do paciente (jsonb) |
| `get_upcoming_birthdays` | Aniversários dos pacientes do nutricionista |
| `grant_achievement` | Conceder conquista a usuário |
| `handle_new_user` | Criar user_profiles no signup (trigger auth.users) |
| `is_challenge_valid_for_reputation` | Critérios para dar reputação no desafio |
| `lock_challenge_rules` | Bloquear regras após início (trigger) |
| `notify_diet_activation` | Notificar paciente quando plano ativa |
| `notify_invite` | Notificar convite (trigger) |
| `redeem_invite_code` | Resgatar código e vincular paciente |
| `set_updated_at` | Atualizar updated_at (trigger genérico) |
| `sync_appointment_to_finance` | Sincronizar consulta paga com financial_records |
| `transfer_owner_if_needed` | Transferir owner do desafio (trigger) |
| `trg_challenges_on_completed` | Ao completar desafio (rewards, etc.) |
| `trg_daily_logs_apply_scoring` | Pontuar desafio a partir de daily_logs |
| `trg_food_diary_entries_apply_scoring` | Pontuar a partir do diário |
| `trigger_log_to_timeline` | Inserir eventos em patient_timeline |
| `update_patient_settings` | Atualizar app_settings em nutritionist_patients |
| `update_room_timestamp` | Atualizar last_message_at em chat_rooms |
| `validate_challenge_rules` | Validar regras do desafio (trigger) |

---

## 5. Políticas RLS

### 5.1 Atual (phases)

- Uso de funções auxiliares: `is_admin()`, `is_nutritionist()`, `is_patient()`.
- Policies por tabela, com subconsultas para herdar permissão (ex.: via `meal_plans` → `plan_daily_menus` → `meals` → `meal_items`).
- Objetivo das phases: reduzir `auth_rls_initplan`, consolidar policies, índices em FKs.

### 5.2 Teste

- Policies nomeadas de forma padronizada: “Nutri manages …”, “Patient …”, “Participants …”, “Common access …”.
- Uso direto de `auth.uid()` e de EXISTS em cima de `nutritionist_patients` / `meal_plans` / etc., sem necessariamente usar `is_nutritionist()`.
- Cobertura explícita para: desafios (checkins, daily points, participants), chat (rooms, messages), diário, feedback, timeline, etc.

**Avaliação:** O teste está mais “completo” em número e clareza de políticas. O atual já tem RLS forte nas tabelas que existem; a diferença é organização e nomenclatura. Adotar o padrão de nomes do teste pode facilitar manutenção.

---

## 6. Índices

O teste define vários índices em cima de FKs e colunas de filtro (ex.: `reference_foods`, `reference_foods_translations`, `challenge_*`, etc.). As phases 12–14 do atual já tratam de remoção de índices não usados e criação de índices em FKs. **Recomendação:** Comparar a lista de índices do teste com a do projeto (e com o resultado do linter de índices) e alinhar onde fizer sentido, sem duplicar índices desnecessários.

---

## 7. O que o novo backend tem a mais (resumo)

1. **Trigger `handle_new_user`** em `auth.users` para criar `user_profiles` no signup.
2. **Trigger `create_chat_room_on_link`** ao inserir em `nutritionist_patients` (cria sala de chat).
3. **Função `redeem_invite_code`** e trigger **`notify_invite`** para convites.
4. **Função `get_financial_dashboard`** e trigger **`sync_appointment_to_finance`** para financeiro.
5. **Triggers de auditoria e timeline** no diário (`audit_diary_changes`, `trigger_log_to_timeline`).
6. **Triggers de notificação:** plano ativado (`notify_diet_activation`), convite (`notify_invite`).
7. **Lógica completa de desafios** em PL/pgSQL (rewards, scoring, streaks, conquistas, regras bloqueadas).
8. **Funções de apoio (nutri/paciente):** `get_patient_by_email`, `get_patient_lifecycle_status`, `get_upcoming_birthdays`, `update_patient_settings`.
9. **RLS** mais organizada e com nomenclatura consistente (“Nutri manages …”, etc.).
10. **Índices** explícitos para buscas e FKs.

*(Fora do escopo: Asaas/webhook de assinaturas, dashboard admin e get_platform_stats.)*

---

## 8. O que o atual tem e o teste não altera

- Mesmo conjunto de tabelas e mesma modelagem (plan_daily_menus, chat_rooms, nutritionist_foods, nutritionist_patients).
- RLS já ativa nas tabelas existentes e helpers `is_nutritionist` / `is_patient`. Storage e políticas para nutri e paciente mantidos.
- Storage policies (avatars, lab-results-pdfs, patient-photos, etc.) definidas na migration atual; o teste não as altera.

---

## 9. Riscos e cuidados ao incorporar o “novo”

1. **Triggers em `auth.users`:** Exigem permissão no Supabase; testar em staging.
2. **Conflito de funções:** Se o app já chama RPCs com outros nomes ou assinaturas, é preciso manter compatibilidade ou migrar chamadas.
3. **Desafios:** Muita lógica nova; validar regras de negócio (pontuação, reputação, conquistas) e testar cenários de corrida.
4. **Performance:** Novos triggers em tabelas quentes (diário, daily_logs, challenge_*) podem impactar; medir em staging.
5. **Rollback:** Manter migrations reversíveis (drop trigger / drop function) para cada bloco que for aplicado.

---

## 10. Conclusão e próximos passos sugeridos

- **Estado atual:** O banco em produção (hipozero) já está alinhado ao teste em **estrutura de tabelas** e modelo de domínio (user_profiles.role, plan_daily_menus, chat_rooms, nutritionist_patients, financial_records). As phases referenciam tabelas de outro schema (meal_plan_meals, foods, patient_goals, etc.) que não existem neste projeto.
- **O que o teste agrega:** Automação (triggers de signup, chat room, convites, notificações, auditoria/timeline, desafios), funções de dashboard e apoio (financeiro, paciente, aniversários, stats) e RLS/índices mais organizados.
- **Recomendações práticas (escopo: apenas nutri e paciente; sem admin nem Asaas):**
  1. **Prioridade alta:** Avaliar adoção do trigger `handle_new_user` e da função `redeem_invite_code` + trigger `notify_invite`.
  2. **Prioridade média:** Trigger `create_chat_room_on_link`, `get_financial_dashboard`, `sync_appointment_to_finance`, `notify_diet_activation`.
  3. **Prioridade conforme produto:** Lógica de desafios (rewards, scoring, conquistas) no Postgres.
  4. Revisar políticas RLS do teste e comparar com as atuais; padronizar nomes e escopos onde trouxer ganho.
  5. Comparar índices do teste com o estado atual (e com linter) e adicionar apenas os que forem úteis.

Este documento serve como referência para decisões futuras de evolução do backend; nenhuma alteração foi aplicada no banco.
