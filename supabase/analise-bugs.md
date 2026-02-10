## Analise arquitetural aprofundada (Supabase + React/Vite)

Objetivo: endurecer backend sem quebrar frontend, com plano de migracao seguro.
Base: fluxos reais do frontend, RLS, RPCs, Edge Functions e Storage.

---

### 1) Mapeamento completo de papeis e acessos

**Papeis reais identificados**
- **patient**: definido por `user_profiles.user_type` (frontend e rotas).
- **nutritionist**: definido por `user_profiles.user_type` (frontend e rotas).
- **admin**: definido por `user_profiles.is_admin` e liberado no client (`routeGuards.jsx`).
- **service role**: usado nas Edge Functions (`SUPABASE_SERVICE_ROLE_KEY`).
- **anon**: acesso a buckets e tabelas expostas (se policies publicas existirem).

**Fluxos e acessos (frontend)**
- Autenticacao + perfil:
  - `src/contexts/AuthContext.jsx` cria/atualiza `user_profiles` no client (self-healing).
  - `src/routes/routeGuards.jsx` usa `user_profiles.user_type` e `is_admin` para liberar rotas.
- Paciente:
  - Diarios/refeicoes: `meals`, `meal_items`, `meal_audit_log` via `food-diary-queries.js` e paginas de paciente.
  - Plano alimentar: `meal_plans`, `meal_plan_meals`, `meal_plan_foods`, `meal_plan_reference_values` via `meal-plan-queries.js`.
  - Metricas: `growth_records`, `patient_goals`, `energy_expenditure_calculations`.
  - Exames: `lab_results` + bucket `lab-results-pdfs` via `lab-results-queries.js`.
  - Chat: `chats` + bucket `chat_media` via `ChatContext.jsx` e `ChatPage.jsx`.
- Nutricionista:
  - Pacientes e anamnese: `user_profiles`, `anamnese_*`, `anamnesis_*`.
  - Agenda: `appointments`, `services`.
  - Financeiro: `financial_records`, `financial_transactions`, `recurring_expenses`, `services`, bucket `financial-docs`.
  - Plano alimentar e diario: mesmas tabelas de paciente, mas filtrando por `nutritionist_id`.
  - Feed: RPCs `get_comprehensive_activity_feed_optimized`, `get_patients_pending_data_optimized`, `get_patients_low_adherence_optimized`.
- Admin:
  - Dashboard: RPC `get_admin_dashboard_stats` (`src/services/adminService.js`).
  - Acesso "god mode" no client (qualquer rota).

**Acessos implicitos**
- Joins com `user_profiles` em varias queries (ex.: `appointments` e `financial_transactions`).
- Views/RPCs nao mapeadas no frontend atual podem ser usadas por chamadas indiretas (ex.: `get_chat_recipient_profile`).

---

### 2) RLS orientado a fluxos reais (tabelas criticas)

**Premissa**: Ativar RLS sem quebrar as queries existentes.

#### `user_profiles`
- **Queries reais**:
  - `AuthContext.jsx`: `select` por `id`, `insert` de perfil, `update` avatar/infos.
  - `agenda-queries.js` e `financial-queries.js`: joins em `user_profiles`.
- **Filtros aplicados**: `.eq('id', user.id)` e `.eq('nutritionist_id', user.id)`.
- **Risco ao ativar RLS**: alto, porque o client insere perfis e usa `is_admin`.
- **Policy vs RPC**:
  - Policy resolve `select/update` do proprio perfil.
  - **Insercao** deveria ser por trigger (Auth -> Profile) ou RPC com `SECURITY DEFINER`.
  - Campo `is_admin` deve ser apenas service role.

#### `meal_plans`, `meal_plan_meals`, `meal_plan_foods`, `meal_plan_reference_values`
- **Queries reais**: `meal-plan-queries.js` e paginas de paciente/nutricionista.
- **Filtros aplicados**:
  - `.eq('patient_id', patientId)` e `.eq('nutritionist_id', user.id)`.
  - `meal_plan_meals` e `meal_plan_foods` ligados por `meal_plan_id`/`meal_plan_meal_id`.
- **Risco ao ativar RLS**:
  - Quebra se policy nao atravessa o join (ex.: `meal_plan_meals` sem validar dono do plano).
- **Policy vs RPC**:
  - Policy resolve, desde que use `EXISTS` com join para `meal_plans`.
  - RPC somente para calculos agregados (ex.: `calculate_macro_targets` ja existe).

#### `meals`, `meal_items`, `meal_audit_log`
- **Queries reais**: `food-diary-queries.js`, `patient-queries.js`.
- **Filtros aplicados**:
  - `meals`: `.eq('patient_id', patientId)` e `deleted_at is null`.
  - `meal_items`: via join pelo `meal_id`.
  - `meal_audit_log`: `.eq('patient_id', patientId)`.
- **Risco ao ativar RLS**:
  - Se `meal_items` nao validar ownership do `meal`.
- **Policy vs RPC**:
  - Policy resolve (com `EXISTS` e join).
  - RPC apenas para logs (`log_meal_action`), mas precisa validar ownership.

#### `lab_results`
- **Queries reais**: `lab-results-queries.js`.
- **Filtros aplicados**: `.eq('patient_id', patientId)`.
- **Risco**: alto (dados sensiveis + storage).
- **Policy vs RPC**:
  - Policy com `patient_id = auth.uid()` ou `nutritionist_id` relacionado.
  - RPC so se quiser consolidar logica de status (opcional).

#### `appointments`
- **Queries reais**: `agenda-queries.js`, `NutritionistDashboard.jsx`.
- **Filtros aplicados**: `.eq('nutritionist_id', user.id)`, `.eq('patient_id', patientId)`.
- **Risco**: medio (agenda e dados pessoais).
- **Policy vs RPC**: policy resolve.

#### `chats`
- **Queries reais**: `ChatContext.jsx` (select com `.or(...)`) e insert.
- **Filtros aplicados**: `from_id` e `to_id`.
- **Risco**: alto (mensagens privadas).
- **Policy vs RPC**:
  - Policy resolve: `auth.uid()` deve ser `from_id` ou `to_id`.
  - Realtime depende de policy correta para nao vazar mensagens.

#### `financial_records`, `financial_transactions`, `recurring_expenses`, `services`
- **Queries reais**: `financial-queries.js` e `TransactionDialog.jsx`.
- **Filtros aplicados**: `.eq('nutritionist_id', user.id)`.
- **Risco**: alto (dados financeiros).
- **Policy vs RPC**: policy resolve, mas update/delete precisam validar ownership.

#### `household_measures`, `food_household_measures`
- **Queries reais**: `food-measures-queries.js`.
- **Filtros aplicados**: `food_id` e `is_active`.
- **Risco**: medio (dados comuns).
- **Policy vs RPC**:
  - `household_measures`: leitura ampla, escrita restrita.
  - `food_household_measures`: escrita so do nutricionista dono do alimento.

---

### 3) Auth e autorizacao (aprofundado)

**Uso atual**
- `auth.uid()` e `auth.role()` aparecem nas policies (Supabase alerts).
- `AuthContext.jsx` usa `user_metadata` para `user_type` e cria `user_profiles` no client.
- `routeGuards.jsx` permite "god mode" baseado em `user_profiles.is_admin`.

**Riscos**
- **Escalada de privilegio**:
  - Se `user_profiles` permitir update de `is_admin` ou `user_type`, o client pode virar admin/nutricionista.
  - `user_metadata` e mutavel pelo usuario; usar para `user_type` e perigoso.
- **Autorizacao distribuida**:
  - Edge Functions e RPCs podem nao validar `auth.uid()`/claims.

**Recomendacoes**
- Mover papeis para `app_metadata` (somente service role altera).
- Criar claim `role` ou `user_type` no JWT (via `app_metadata`) e usar em policies.
- Travar `user_profiles.user_type` e `is_admin` no RLS (somente service role).
- Ajustar `AuthContext` para nao inserir perfil no client em producao. Preferir trigger `auth.users` -> `user_profiles`.

---

### 4) Edge Functions (auditoria real)

**`create-patient`** (`supabase/functions/create-patient`)
- **Quem pode chamar**: qualquer cliente com endpoint publico.
- **O que impede abuso**: nada. Nao valida JWT nem role.
- **Se frontend for manipulado**: qualquer usuario pode convidar qualquer email.
- **Correcoes**:
  - Exigir `Authorization` com JWT.
  - Validar `role`/`user_type` == nutricionista.
  - Validar `nutritionist_id` do caller e gravar relacao no backend.
  - Log de auditoria.

**`delete-user-securely`** (`supabase/functions/delete-user-securely`)
- **Quem pode chamar**: qualquer autenticado.
- **O que impede abuso**: apenas `auth.getUser()`; nao valida ownership.
- **Se frontend for manipulado**: deletar qualquer usuario.
- **Correcoes**:
  - Validar `is_admin` ou `nutritionist_id` dono do paciente.
  - Conferir `user_profiles` do alvo.
  - Registrar auditoria.

**Padrao reutilizavel**
- Criar helper de auth:
  - Extrair JWT, validar usuario, carregar perfil, checar papel.
  - Checar ownership por tabela padrao (ex.: patient -> nutritionist_id).

---

### 5) Storage (modelo seguro e escalavel)

**Buckets identificados**
- `avatars`: upload em `AvatarUpload.jsx` (public URL).
- `patient-photos`: upload em `PhotoGallery.jsx` (public URL).
- `lab-results-pdfs`: upload em `lab-results-queries.js` (signed URL longo).
- `financial-docs`: upload em `TransactionDialog.jsx` (public URL).
- `chat_media`: upload em `ChatPage.jsx` e signed URL curto.
- `IDV` (public assets de marca).

**Riscos atuais**
- Buckets com `publicUrl` para dados sensiveis (`financial-docs`, `patient-photos`).
- Policies permissivas (vistas no linter).
- Nomes de arquivo previsiveis por `patientId`/`nutritionistId` podem facilitar enumeracao.

---

### 6) Performance + manutencao (prioridade real)

**RLS custoso**
- Policies com `auth.uid()` em cada linha (initplan). Trocar por `(select auth.uid())`.

**Policies redundantes**
- Muitos permissive policies duplicados em `meals`, `meal_items`, `lab_results`, `user_profiles`, etc.

**Indices**
- Duplicados em `meals` e `prescriptions`.
- FKs sem indice em tabelas usadas em joins.
- Indices nao usados: remover so apos medir carga real.

---

### 7) Plano de correcoes por etapas (sem downtime)

#### Fase 1: seguranca critica (sem downtime)
- **O que mudar**
  - Ativar RLS em tabelas publicas com policies de leitura/escrita alinhadas aos filtros existentes.
  - Bloquear update/insert de `user_profiles.is_admin` e `user_type`.
  - Ajustar Edge Functions com validacao de JWT + role.
  - Restringir buckets sensiveis (sem `publicUrl`).
- **Risco**
  - Alto de quebra se policies nao cobrem fluxos reais.
- **Como validar**
  - Testes manuais por fluxo (paciente e nutricionista).
  - Logs de erros do PostgREST e Edge Functions.

#### Fase 2: correcoes estruturais
- **O que mudar**
  - Trigger `auth.users` -> `user_profiles` e remover self-healing no client.
  - Migrar `user_type`/`role` para `app_metadata`.
  - Consolidar policies redundantes.
  - Ajustar RPCs com `search_path` fixo e checks de `auth.uid()`.
- **Risco**
  - Medio (ajustes de autenticacao e claims).
- **Como validar**
  - Sessao de teste com novos usuarios.
  - Re-login para validar claims no JWT.

#### Fase 3: melhorias e refactors
- **O que mudar**
  - Criar RPCs especificas para queries complexas e reduzir N+1.
  - Normalizar estrutura de storage e migrar arquivos existentes.
  - Revisar indices com base em logs.
- **Risco**
  - Baixo/medio.
- **Como validar**
  - Monitorar performance e taxas de erro.

---

### 8) Observacoes arquiteturais criticas

**Anti-patterns identificados**
- **Insercao de perfil no client** (`AuthContext.jsx`) exige policies permissivas e abre janela de escalada.
- **Admin baseado em dado mutavel no `user_profiles`** (risco se update permitir).
- **Buckets sensiveis com URL publica** (`financial-docs`, `patient-photos`).
- **Edge Functions expostas sem autorizacao forte**.
- **RPCs sem `search_path` fixo** (alerta de seguranca).

**Melhorias recomendadas (sem reescrever tudo)**
- Centralizar autorizacao no DB (RLS + RPCs) e deixar client apenas consumir.
- Definir um contrato claro de papeis (`app_metadata.role`) e usar em policies.
- Criar helpers de auth para Edge Functions.
- Padronizar storage e politicas por pasta.

---

### Referencias diretas (arquivos reais)
- `src/contexts/AuthContext.jsx`
- `src/routes/routeGuards.jsx`
- `src/contexts/ChatContext.jsx`
- `src/pages/shared/ChatPage.jsx`
- `src/lib/supabase/meal-plan-queries.js`
- `src/lib/supabase/food-diary-queries.js`
- `src/lib/supabase/financial-queries.js`
- `src/lib/supabase/lab-results-queries.js`
- `src/components/financial/TransactionDialog.jsx`
- `src/components/anthropometry/PhotoGallery.jsx`
- `src/components/patient/AvatarUpload.jsx`

---

## SQL de policies e exemplos de RPCs (alinhados a analise)

> Observacao: os exemplos abaixo seguem os fluxos reais do frontend. Ajuste nomes de colunas caso existam divergencias no schema.
> Sempre teste em ambiente de staging antes de aplicar em producao.

### 1) Helpers de autorizacao (SQL)

```sql
-- Recomendado: role no JWT em app_metadata (nao em user_metadata)
-- Exemplo: {"role":"nutritionist"} ou {"role":"admin"}

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and is_admin = true
  );
$$;

create or replace function public.is_nutritionist()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and user_type = 'nutritionist'
  );
$$;

create or replace function public.is_patient()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and user_type = 'patient'
  );
$$;
```

### 2) `user_profiles` (RLS)

```sql
alter table public.user_profiles enable row level security;

-- Ler o proprio perfil
create policy "Users can read own profile"
on public.user_profiles
for select
to authenticated
using (id = auth.uid());

-- Nutricionista pode ler pacientes vinculados
create policy "Nutritionists can read their patients"
on public.user_profiles
for select
to authenticated
using (
  is_nutritionist()
  and user_type = 'patient'
  and nutritionist_id = auth.uid()
);

-- Atualizar apenas o proprio perfil (bloqueia is_admin e user_type)
create policy "Users can update own profile"
on public.user_profiles
for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and is_admin is not distinct from (select is_admin from public.user_profiles where id = auth.uid())
  and user_type is not distinct from (select user_type from public.user_profiles where id = auth.uid())
);

-- Insercao de perfil: ideal via trigger com service role.
-- Se precisar abrir temporariamente, usar RPC SECURITY DEFINER.
```

### 3) `meal_plans`, `meal_plan_meals`, `meal_plan_foods`, `meal_plan_reference_values`

```sql
alter table public.meal_plans enable row level security;
alter table public.meal_plan_meals enable row level security;
alter table public.meal_plan_foods enable row level security;
alter table public.meal_plan_reference_values enable row level security;

-- meal_plans: paciente acessa o proprio plano
create policy "Patients can read own meal plans"
on public.meal_plans
for select
to authenticated
using (patient_id = auth.uid());

-- meal_plans: nutricionista gerencia planos dos seus pacientes
create policy "Nutritionists manage patient meal plans"
on public.meal_plans
for all
to authenticated
using (is_nutritionist() and nutritionist_id = auth.uid())
with check (is_nutritionist() and nutritionist_id = auth.uid());

-- meal_plan_meals: acesso condicionado ao plano
create policy "Access meal_plan_meals via meal_plans"
on public.meal_plan_meals
for all
to authenticated
using (
  exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id
      and (p.patient_id = auth.uid() or p.nutritionist_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id
      and (p.patient_id = auth.uid() or p.nutritionist_id = auth.uid())
  )
);

-- meal_plan_foods: acesso condicionado a meal_plan_meals -> meal_plans
create policy "Access meal_plan_foods via meal_plan_meals"
on public.meal_plan_foods
for all
to authenticated
using (
  exists (
    select 1
    from public.meal_plan_meals m
    join public.meal_plans p on p.id = m.meal_plan_id
    where m.id = meal_plan_meal_id
      and (p.patient_id = auth.uid() or p.nutritionist_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.meal_plan_meals m
    join public.meal_plans p on p.id = m.meal_plan_id
    where m.id = meal_plan_meal_id
      and (p.patient_id = auth.uid() or p.nutritionist_id = auth.uid())
  )
);

-- meal_plan_reference_values: ligado ao plano
create policy "Access meal_plan_reference_values via meal_plans"
on public.meal_plan_reference_values
for all
to authenticated
using (
  exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id
      and (p.patient_id = auth.uid() or p.nutritionist_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id
      and (p.patient_id = auth.uid() or p.nutritionist_id = auth.uid())
  )
);
```

### 4) `meals`, `meal_items`, `meal_audit_log`

```sql
alter table public.meals enable row level security;
alter table public.meal_items enable row level security;
alter table public.meal_audit_log enable row level security;

-- meals: paciente e nutricionista dono
create policy "Access meals for patient or nutritionist"
on public.meals
for all
to authenticated
using (
  patient_id = auth.uid()
  or nutritionist_id = auth.uid()
)
with check (
  patient_id = auth.uid()
  or nutritionist_id = auth.uid()
);

-- meal_items: via meal_id
create policy "Access meal_items via meals"
on public.meal_items
for all
to authenticated
using (
  exists (
    select 1 from public.meals m
    where m.id = meal_id
      and (m.patient_id = auth.uid() or m.nutritionist_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.meals m
    where m.id = meal_id
      and (m.patient_id = auth.uid() or m.nutritionist_id = auth.uid())
  )
);

-- meal_audit_log: somente paciente e nutricionista do paciente
create policy "Access meal_audit_log"
on public.meal_audit_log
for select
to authenticated
using (
  patient_id = auth.uid()
  or nutritionist_id = auth.uid()
);

-- Insercao de audit log: permitir apenas via RPC/trigger ou service role
revoke insert, update, delete on public.meal_audit_log from authenticated;
```

### 5) `lab_results`

```sql
alter table public.lab_results enable row level security;

create policy "Access lab_results"
on public.lab_results
for all
to authenticated
using (
  patient_id = auth.uid()
  or nutritionist_id = auth.uid()
)
with check (
  patient_id = auth.uid()
  or nutritionist_id = auth.uid()
);
```

### 6) `appointments`

```sql
alter table public.appointments enable row level security;

create policy "Nutritionists manage own appointments"
on public.appointments
for all
to authenticated
using (nutritionist_id = auth.uid())
with check (nutritionist_id = auth.uid());

create policy "Patients read own appointments"
on public.appointments
for select
to authenticated
using (patient_id = auth.uid());
```

### 7) `financial_*` e `services`

```sql
alter table public.financial_records enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.services enable row level security;

create policy "Nutritionists manage financial_records"
on public.financial_records
for all
to authenticated
using (nutritionist_id = auth.uid())
with check (nutritionist_id = auth.uid());

create policy "Nutritionists manage financial_transactions"
on public.financial_transactions
for all
to authenticated
using (nutritionist_id = auth.uid())
with check (nutritionist_id = auth.uid());

create policy "Nutritionists manage recurring_expenses"
on public.recurring_expenses
for all
to authenticated
using (nutritionist_id = auth.uid())
with check (nutritionist_id = auth.uid());

create policy "Nutritionists manage services"
on public.services
for all
to authenticated
using (nutritionist_id = auth.uid())
with check (nutritionist_id = auth.uid());
```

### 8) `chats`

```sql
alter table public.chats enable row level security;

create policy "Chat participants can read"
on public.chats
for select
to authenticated
using (from_id = auth.uid() or to_id = auth.uid());

create policy "Chat participants can insert"
on public.chats
for insert
to authenticated
with check (from_id = auth.uid() or to_id = auth.uid());
```

### 9) `household_measures` e `food_household_measures`

```sql
alter table public.household_measures enable row level security;
alter table public.food_household_measures enable row level security;

-- Medidas genericas: leitura para todos autenticados
create policy "Read household_measures"
on public.household_measures
for select
to authenticated
using (true);

-- Escrita apenas admin/nutricionista (ajuste conforme regra)
create policy "Write household_measures (admin)"
on public.household_measures
for insert, update, delete
to authenticated
using (is_admin())
with check (is_admin());

-- Medidas por alimento: leitura ampla, escrita so do nutricionista dono do alimento
create policy "Read food_household_measures"
on public.food_household_measures
for select
to authenticated
using (true);

create policy "Write food_household_measures via foods"
on public.food_household_measures
for insert, update, delete
to authenticated
using (
  exists (
    select 1 from public.foods f
    where f.id = food_id and f.nutritionist_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.foods f
    where f.id = food_id and f.nutritionist_id = auth.uid()
  )
);
```

---

## Storage policies (exemplos)

```sql
-- avatars: cada usuario gerencia a propria pasta
create policy "Users manage own avatars"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- lab-results-pdfs: paciente ou nutricionista do paciente
create policy "Access lab-results-pdfs"
on storage.objects
for select, insert, delete, update
to authenticated
using (
  bucket_id = 'lab-results-pdfs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.user_profiles p
      where p.id = (storage.foldername(name))[1]::uuid
        and p.nutritionist_id = auth.uid()
    )
  )
)
with check (
  bucket_id = 'lab-results-pdfs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.user_profiles p
      where p.id = (storage.foldername(name))[1]::uuid
        and p.nutritionist_id = auth.uid()
    )
  )
);

-- financial-docs: apenas nutricionista dono
create policy "Access financial-docs"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'financial-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'financial-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- patient-photos: paciente ou nutricionista do paciente
create policy "Access patient-photos"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'patient-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.user_profiles p
      where p.id = (storage.foldername(name))[1]::uuid
        and p.nutritionist_id = auth.uid()
    )
  )
)
with check (
  bucket_id = 'patient-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.user_profiles p
      where p.id = (storage.foldername(name))[1]::uuid
        and p.nutritionist_id = auth.uid()
    )
  )
);

-- chat_media: participantes (usar folder = conversationId ou fromId)
create policy "Access chat_media"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'chat_media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
  )
)
with check (
  bucket_id = 'chat_media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
  )
);
```

---

## RPCs (exemplos alinhados aos fluxos)

### 1) Inserir audit log de refeicao (controlado)

```sql
create or replace function public.log_meal_action_secure(
  p_meal_id uuid,
  p_action text,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meal public.meals%rowtype;
begin
  select * into v_meal from public.meals where id = p_meal_id;
  if v_meal.id is null then
    raise exception 'meal not found';
  end if;

  if not (v_meal.patient_id = auth.uid() or v_meal.nutritionist_id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  insert into public.meal_audit_log (
    meal_id, patient_id, nutritionist_id, action, details, created_at
  ) values (
    v_meal.id, v_meal.patient_id, v_meal.nutritionist_id, p_action, p_details, now()
  );
end;
$$;
```

### 2) Criar perfil via RPC (substitui self-healing no client)

```sql
create or replace function public.create_profile_from_auth(
  p_user_id uuid,
  p_email text,
  p_name text,
  p_user_type text,
  p_nutritionist_id uuid default null
)
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.user_profiles;
begin
  if not is_admin() then
    -- permite apenas service role ou admin
    raise exception 'not authorized';
  end if;

  insert into public.user_profiles (
    id, email, name, user_type, nutritionist_id
  ) values (
    p_user_id, p_email, p_name, p_user_type, p_nutritionist_id
  )
  returning * into v_profile;

  return v_profile;
end;
$$;
```

### 3) Gerar signed URL de arquivos sensiveis

```sql
create or replace function public.get_lab_pdf_signed_url(
  p_path text,
  p_expires_in int default 3600
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_id uuid;
  v_allowed boolean;
begin
  -- exemplo: path = "{patientId}/arquivo.pdf"
  v_patient_id := split_part(p_path, '/', 1)::uuid;

  v_allowed := (v_patient_id = auth.uid())
    or exists (select 1 from public.user_profiles p where p.id = v_patient_id and p.nutritionist_id = auth.uid());

  if not v_allowed then
    raise exception 'not authorized';
  end if;

  -- Aqui voce pode retornar apenas o path e usar client SDK para gerar URL,
  -- ou usar storage API via http em edge function (mais recomendado).
  return p_path;
end;
$$;
```

### 4) Deletar usuario com ownership

```sql
create or replace function public.can_delete_user(p_target_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select is_admin()
  or exists (
    select 1 from public.user_profiles p
    where p.id = p_target_id
      and p.nutritionist_id = auth.uid()
  );
$$;
```

Use essa RPC na Edge Function `delete-user-securely` antes de chamar `admin.deleteUser`.


# Analise de bugs e alertas (Supabase + Frontend)

Este documento organiza os problemas encontrados por categoria, prioridade e dificuldade.
Foco: corrigir backend sem quebrar o frontend.

Legenda de prioridade:
- P0: critico / risco alto / vazamento
- P1: alto / pode quebrar dados ou seguranca
- P2: medio / performance ou manutencao
- P3: baixo / melhoria recomendada

Legenda de dificuldade:
- Baixa: ajuste pequeno
- Media: altera politica/funcoes com cuidado
- Alta: envolve migracao ampla ou mudanca de modelo

---

## 1) Seguranca - RLS desativado em tabelas publicas

Prioridade: P0
Dificuldade: Media

Problema
- Tabelas expostas ao PostgREST sem RLS: `meal_plans`, `meal_plan_meals`, `meal_plan_foods`, `meal_plan_reference_values`, `household_measures`, `food_household_measures`, `glycemia_records`, `meal_history`.
- Existe policy em `meal_plans`, mas o RLS esta desativado (alerta `policy_exists_rls_disabled`).
- Colunas sensiveis (ex.: `patient_id`) ficam expostas sem RLS (`sensitive_columns_exposed`).

Impacto
- Qualquer usuario autenticado (ou ate anon, dependendo de configuracao) pode ler/escrever dados de outros pacientes.
- Risco direto de vazamento de dados pessoais.

Dependencias no frontend
- Consultas diretas nas tabelas acima (ex.: `meal_plans`, `meal_plan_meals`, `meal_plan_foods`, `meal_plan_reference_values`, `food_household_measures`, `household_measures`) em `src/lib/supabase/*`.
- Ex.: `createMealPlan`, `getMealPlanById`, `getAllHouseholdMeasures`, `getFoodMeasures`, `getReferenceValues`.

Solucao sugerida
- Habilitar RLS em todas as tabelas listadas.
- Criar policies por papel (nutricionista/paciente) alinhadas com o uso atual no frontend:
  - `meal_plans`: paciente pode ler o seu, nutricionista pode gerenciar de pacientes vinculados, templates so do criador.
  - `meal_plan_meals` e `meal_plan_foods`: acesso condicionado ao `meal_plan_id` valido via join ao plano.
  - `meal_plan_reference_values`: apenas dono do plano (nutricionista/paciente conforme regra).
  - `household_measures`: leitura publica/autenticada, escrita apenas admin/nutricionista.
  - `food_household_measures`: leitura publica/autenticada, escrita apenas nutricionista dono do alimento.
  - `glycemia_records` e `meal_history`: leitura/escrita somente por paciente e nutricionista relacionado.
- Garantir que policies para `authenticated` permitam os fluxos do frontend (as chamadas usam `supabase` com session do usuario).

---

## 2) Seguranca - Edge functions sem autorizacao adequada

Prioridade: P0
Dificuldade: Media

Problema
- `supabase/functions/create-patient`: nao valida JWT do chamador nem confirma papel (nutricionista). Qualquer cliente pode convidar usuario.
- `supabase/functions/delete-user-securely`: valida autenticacao, mas nao autoriza quem pode deletar. Qualquer usuario autenticado pode deletar qualquer `userIdToDelete`.

Impacto
- Possibilidade de criacao/remoção indevida de contas.

Dependencias no frontend
- `create-patient` usado em `src/components/nutritionist/AddPatientModal.jsx`.
- `delete-user-securely` nao encontrado no frontend, mas continua exposto.

Solucao sugerida
- Validar JWT (`Authorization`) e checar papel/escopo (ex.: nutricionista/admin).
- Conferir ownership do paciente (relacao `nutritionist_id`).
- Para deletar usuario: exigir role admin ou nutricionista dono + log de auditoria.
- Opcional: rate limit e logs de seguranca.

---

## 3) Seguranca - Views SECURITY DEFINER

Prioridade: P1
Dificuldade: Media

Problema
- Views `active_foods` e `patient_hub_summary` com `SECURITY DEFINER`.

Impacto
- Queries podem ignorar RLS do usuario, usando permissoes do criador da view.

Dependencias no frontend
- Nao encontrei referencias diretas no frontend, mas podem ser usadas por RPCs.

Solucao sugerida
- Trocar para `SECURITY INVOKER` (padrao) ou reescrever em RPC com verificacao explicita.
- Garantir que tabelas base tenham RLS correto.

---

## 4) Seguranca - Policies permissivas/abertas

Prioridade: P1
Dificuldade: Media

Problema
- Policy `System can insert audit logs` em `meal_audit_log` usa `WITH CHECK (true)` para INSERT.
- Policies em storage permitem acao ampla:
  - `Authenticated users can delete PDFs` / update / insert / select em bucket `lab-results-pdfs` para role `public`.
  - `Users can delete own patient photos` e `Users can upload patient photos` sem restricao por pasta/owner.

Impacto
- Insercao de logs ou exclusao de arquivos por usuarios indevidos.

Dependencias no frontend
- `lab_results` usa storage (upload/deletar PDFs) em `src/lib/supabase/lab-results-queries.js`.

Solucao sugerida
- Restringir policies por `auth.uid()` e pastas (ex.: `storage.foldername(name)[1] = auth.uid()`).
- Para audit log, permitir apenas service role ou RPC controlada.
- Revisar buckets e padronizar naming por usuario/paciente.

---

## 5) Seguranca - Funcoes com search_path mutavel

Prioridade: P1
Dificuldade: Baixa

Problema
- Varias functions sem `SET search_path`, incluindo as usadas pelo frontend:
  - `get_admin_dashboard_stats`, `get_daily_adherence`, `get_patients_low_adherence_optimized`,
    `get_patients_pending_data_optimized`, `get_comprehensive_activity_feed_optimized`,
    `calculate_macro_targets`, etc.

Impacto
- Risco de hijack de schema e comportamento inesperado.

Dependencias no frontend
- RPCs em `src/services/adminService.js`, `src/pages/nutritionist/dashboard/NutritionistDashboard.jsx`,
  `src/lib/supabase/patient-queries.js`, `src/lib/supabase/meal-plan-queries.js`.

Solucao sugerida
- Atualizar as functions com `SET search_path = public, extensions` (ou schema apropriado).

---

## 6) Performance - RLS initplan (auth.* por linha)

Prioridade: P2
Dificuldade: Baixa

Problema
- Policies usam `auth.uid()`/`auth.role()` diretamente e sao reavaliadas por linha.

Impacto
- Degradacao de performance em tabelas com volume alto (ex.: `meals`, `appointments`, `user_profiles`, etc).

Solucao sugerida
- Trocar `auth.uid()` por `(select auth.uid())` nas policies afetadas.

---

## 7) Performance - Multiple permissive policies

Prioridade: P2
Dificuldade: Media

Problema
- Multiplas policies permissivas no mesmo role/acao em tabelas como `meals`, `meal_items`, `meal_audit_log`, `lab_results`, `patient_goals`, `user_profiles`, `appointments`.

Impacto
- Cada query avalia varias policies e pode ficar lenta.

Solucao sugerida
- Consolidar policies (unificar condicoes) e remover duplicadas.

---

## 8) Performance - Indices duplicados e FKs sem indice

Prioridade: P2
Dificuldade: Baixa

Problema
- Indices duplicados em `meals` e `prescriptions`.
- Foreign keys sem indice (ex.: `anamnese_answers`, `food_household_measures`, `glycemia_records`, `meal_history`, etc).

Impacto
- Queries e deletes/updates ficam mais lentos.

Solucao sugerida
- Remover indices duplicados.
- Criar indices nas colunas de FK mais usadas em joins/filtros.

---

## 9) Performance - Indices nao usados

Prioridade: P3
Dificuldade: Media

Problema
- Muitos indices reportados como nao usados.

Impacto
- Custo de manutencao de escrita (INSERT/UPDATE) maior.

Solucao sugerida
- Validar com logs e workloads reais antes de remover.
- Remover com cautela e monitorar.

---

## 10) Configuracao/Plataforma (Auth e Postgres)

Prioridade: P2
Dificuldade: Baixa

Problema
- OTP com expiracao longa.
- Leaked password protection desativado.
- Postgres com patches pendentes.
- Auth com estrategia de conexoes fixa.

Solucao sugerida
- Ajustar configuracao no painel do Supabase.

---

## Impactos diretos no frontend (resumo)

Tabelas usadas diretamente no frontend (exemplos):
- `meal_plans`, `meal_plan_meals`, `meal_plan_foods`, `meal_plan_reference_values`:
  `src/lib/supabase/meal-plan-queries.js`, paginas de paciente/nutricionista.
- `household_measures`, `food_household_measures`:
  `src/lib/supabase/food-measures-queries.js`.
- `meal_audit_log`, `meal_items`, `meals`:
  `src/lib/supabase/food-diary-queries.js`, `src/lib/supabase/patient-queries.js`.
- `lab_results` + storage:
  `src/lib/supabase/lab-results-queries.js`.

Para nao quebrar o frontend:
- Implementar RLS com regras alinhadas aos filtros existentes no codigo.
- Evitar trocar nomes de campos/joins.
- Validar RPCs atuais antes de alterar assinatura.

