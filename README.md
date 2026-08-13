# Nello

Nello e uma plataforma SaaS de acompanhamento nutricional que conecta nutricionistas, pacientes e administradores em um unico ecossistema. O projeto combina consultorio digital, prontuario nutricional, prescricao alimentar, acompanhamento do paciente, comunicacao em tempo real, agenda, financeiro, observabilidade e uma base crescente de automacoes.

A proposta central e reduzir o trabalho operacional do nutricionista e aumentar a adesao do paciente. O sistema nao e apenas um criador de dieta: ele tenta funcionar como a camada de operacao diaria da clinica, com dados clinicos, plano alimentar, diario alimentar, chat, check-ins, alertas e historico do paciente em um unico lugar.

## Estado atual em uma frase

O produto ja tem uma base ampla em React/Vite/Supabase, com rotas reais para nutricionista, paciente e admin; os modulos principais existem, mas algumas areas ainda estao em consolidacao, especialmente templates de nutricao, fundacao tecnica, performance do plano alimentar e a evolucao do motor de anamnese/check-ins.

## Personas e experiencias

### Nutricionista

Usa o Nello como consultorio digital:

- Dashboard operacional.
- Gestao de pacientes e hub central do paciente.
- Anamnese e fichas clinicas.
- Avaliacao antropometrica, fotos, exames e glicemia.
- Calculos energeticos e metas.
- Plano alimentar com refeicoes, alimentos, substituicoes, rascunhos e resumo.
- Protocolos/templates de dietas, refeicoes e receitas.
- Diario alimentar do paciente.
- Chat, notificacoes e presenca online.
- Check-ins, agenda, financeiro e banco de alimentos.

### Paciente

Usa o Nello como aplicativo de acompanhamento:

- Home mobile com resumo do dia.
- Diario alimentar.
- Visualizacao do plano prescrito.
- Check-ins pendentes e historico.
- Progresso, conquistas, perfil e chat.
- Fluxos de convite e atualizacao obrigatoria de senha.

### Admin

Usa o Nello como painel de operacao do SaaS:

- Dashboard administrativo.
- Usuarios/nutricionistas.
- Financeiro admin.
- Relatorios de bugs.
- Area de estudos/gestao interna.

## Stack

### Frontend

- React 18.
- Vite.
- React Router.
- Tailwind CSS.
- Radix UI/shadcn-style components.
- Lucide React.
- Framer Motion.
- Recharts.
- React Hook Form e Zod.
- Zustand em partes do estado local/global.
- TanStack React Query para cache e mutacoes em fluxos novos.

### Backend e infraestrutura

- Supabase Auth.
- Supabase PostgreSQL.
- Row Level Security como pilar de seguranca.
- Supabase Realtime para chat/presenca/notificacoes.
- Supabase Storage para midias e arquivos.
- Supabase Edge Functions:
  - `create-patient`
  - `generate-pdf`
  - `openfoodfacts-proxy`
  - `sentry-proxy`

### Observabilidade

## Estrutura principal


## Rotas principais

### Autenticacao

- `/login`
- `/register`
- `/update-password`
- `/convite`
- `/auth/verify`

### Nutricionista

- `/nutritionist`
- `/nutritionist/patients`
- `/nutritionist/patients/:patientId/hub`
- `/nutritionist/patients/:patientId/anamnesis`
- `/nutritionist/patients/:patientId/anthropometry`
- `/nutritionist/patients/:patientId/meal-plan`
- `/nutritionist/patients/:patientId/energy-expenditure`
- `/nutritionist/patients/:patientId/lab-results`
- `/nutritionist/patients/:patientId/goals`
- `/nutritionist/patients/:patientId/food-diary`
- `/nutritionist/patients/:patientId/achievements`
- `/nutritionist/patients/:patientId/photos`
- `/nutritionist/templates`
- `/nutritionist/templates/new/:type`
- `/nutritionist/templates/edit/:type/:id`
- `/nutritionist/checkins`
- `/nutritionist/agenda`
- `/nutritionist/financial`
- `/nutritionist/chat`
- `/nutritionist/settings/anamnesis-templates`

### Paciente

- `/patient`
- `/patient/invites`
- `/patient/diario`
- `/patient/progresso`
- `/patient/chat`
- `/patient/perfil`
- `/patient/editar-perfil`
- `/patient/conquistas`
- `/patient/add-meal`
- `/patient/add-food/:mealId?`
- `/patient/checkin/:sessionId`

### Publico

- `/f/:token` para formularios/anamnese public-facing.

### Admin

- `/admin/dashboard`
- `/admin/bugs`
- `/admin/users`
- `/admin/users/:id`
- `/admin/financial`
- `/admin/study`

## Modulos de dominio

### Autenticacao e permissoes

`AuthContext` centraliza usuario, perfil, carregamento, cache/offline e redirecionamentos. `ProtectedRoute` separa acesso de nutricionista, paciente e admin. Pacientes com `needs_password_reset` sao interceptados por `ForcePasswordUpdate`.

### Hub do paciente

O hub do nutricionista usa `usePatientHub` e queries em `patient-queries` para montar resumo clinico, metricas, status de modulos e atividades. E o ponto natural para consolidar sinais importantes do paciente.

### Plano alimentar

Modulo mais denso do produto. Inclui:

- Criacao/edicao de planos.
- Rascunhos.
- Refeicoes e alimentos.
- Substituicoes.
- Medidas caseiras.
- Graficos de macros.
- Valores de referencia.
- Geracao de PDF/resumo.
- Importacao de protocolo/template.

Historicamente ja houve correcoes importantes em rascunho inativo e botao de nova refeicao. O proximo cuidado tecnico e reduzir flicker, fetch duplicado e re-render pesado.

### Templates de nutricao

O modulo de templates ja existe no codigo atual:

- `useTemplates` le `diet_templates`, `meal_templates` e `recipes`.
- `useTemplateBuilder` cria e edita dietas, refeicoes e receitas.
- `template-queries` tem `getDietTemplateWithMeals`, `cloneDietTemplateToPatient` e `cloneMealTemplateToPlan`.
- Rotas de criacao e edicao usam `/nutritionist/templates/new/:type` e `/nutritionist/templates/edit/:type/:id`.

### Check-ins

`useCheckins` ja usa React Query para templates, schedules, check-ins pendentes, submissao e historico. Ha pagina de manager para nutricionista e resposta para paciente.

Ainda merece validacao ponta a ponta com as tabelas Supabase, crons/edge functions e regra de score/streak.

### Anamnese e Nello Forms

Existem duas linhas em convivencia:

- Fluxo atual de anamnese por paciente (`PatientAnamnesisList`, `PatientAnamnesisForm`, `PatientAnamnesePage`).
- Shell/configuracao global de templates em `/nutritionist/settings/anamnesis-templates`.
- Rota publica `/f/:token` com `PatientFacingUi`.

A direcao documentada e evoluir para motor dinamico com JSONB, versionamento, builder, data binding clinico e fluxo omnichannel.

### Agenda e financeiro

Ja existem paginas e componentes para agenda, servicos, transacoes, KPIs, graficos, pendencias e perfil do nutricionista. Estes modulos tornam o produto mais proximo de um ERP leve para consultorio.

### Chat, presenca e notificacoes

`ChatContext`, `PresenceGlobal`, `useOnlinePresence`, `NotificationsPanel` e paginas compartilhadas de chat sustentam comunicacao entre paciente e nutricionista.

### Admin e observabilidade

Admin tem painel proprio, relatorios de bugs, usuarios, detalhe de nutricionista e financeiro. O frontend inicializa Sentry e PostHog em `main.jsx`.

## Como rodar localmente

### Requisitos

- Node.js compatível com o projeto.
- npm.
- Credenciais do Supabase.

### Instalar dependencias

```bash
npm install
```

### Variaveis de ambiente

Crie `.env` na raiz:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SENTRY_DSN=...
VITE_PUBLIC_POSTHOG_KEY=...
VITE_PUBLIC_POSTHOG_HOST=...
```

`VITE_SENTRY_DSN`, `VITE_PUBLIC_POSTHOG_KEY` e `VITE_PUBLIC_POSTHOG_HOST` podem variar conforme ambiente. O essencial para autenticar e ler dados e Supabase.

### Desenvolvimento

```bash
npm run dev
```

### Build

```bash
npm run build
```

O build executa `npm run lint` antes de `vite build`.

### Testes

```bash
npm run test
npm run test:run
npm run test:coverage
```

### Manutenção e verificação

- `npm run check:structure`: valida a organização mínima e impede artefatos gerados ou temporários no Git.
- `npm run verify`: executa estrutura, lint, testes e build.

Verificações automatizadas do repositório ficam em `scripts/qa`.

## Pontos de atencao para proximas implementacoes

1. Validar o estado real dos templates de nutricao no banco antes de reimplementar o que o codigo ja aparenta conter.
2. Remover ou aposentar `src/services/demoDataService.js` somente depois de confirmar zero imports ativos.
3. Continuar migrando fetches criticos para React Query, principalmente hubs e paginas densas.
4. Reduzir loading global e desmontagens no plano alimentar.
5. Tratar performance de componentes grandes com memoizacao e separacao de responsabilidades.
6. Validar RLS/cascade em templates, check-ins e rotas publicas.
7. Manter o marketplace congelado ate definicao de modelo comercial.

## Licenca

Projeto proprietario. Consulte [LICENSE](LICENSE).
