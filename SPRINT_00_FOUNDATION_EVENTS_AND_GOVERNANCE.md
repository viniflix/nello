# Sprint 00 - Foundation: Eventos, Regras e Governanca

## Vinculo com backlog mestre

- Base para Onda 1 e historias: E1-S1, E1-S2, E2-S1, E8-S1.

## Objetivo da sprint

Criar a fundacao tecnica para que as proximas sprints entreguem valor sem retrabalho: contrato de eventos, padrao de logs, estruturas de regras configuraveis e trilha de auditoria.

## Estado atual reaproveitado (codigo existente)

- Feed do nutricionista: `src/components/nutritionist/NutritionistActivityFeed.jsx`
- Inbox de registros: `src/components/nutritionist/PatientUpdatesWidget.jsx`
- Dashboard: `src/pages/nutritionist/dashboard/NutritionistDashboard.jsx`
- Hub do paciente: `src/pages/nutritionist/patients/PatientHubPage.jsx`
- Queries de paciente/feed: `src/lib/supabase/patient-queries.js`

## Escopo fechado da sprint

- Definir contrato unico de evento para `activity_log`.
- Criar camada de regras configuraveis para prioridade de feed.
- Criar estrutura inicial de `feed_tasks` para acao inline futura.
- Implantar naming padrao de eventos para analytics.
- Definir checklist de seguranca SQL/RLS para novas tabelas.

## Entregaveis tecnicos

- Documento tecnico de contrato de eventos (campos obrigatorios, versao, origem, contexto clinico).
- Migration SQL inicial com:
  - `notification_rules`
  - `feed_tasks`
  - ajustes de `activity_log` (se necessario, sem quebrar compatibilidade)
- Funcoes helper para log estruturado em `src/lib/supabase/query-helpers.js` (padrao de evento e erro).
- Camada de leitura de regras no `patient-queries.js` para preparar E1-S1.

## Historias tecnicas (decomposicao)

- S00-T1: Schema de eventos e propriedades minimas.
- S00-T2: Migrations e politicas RLS iniciais.
- S00-T3: Adapter de log para modulos existentes (meal, anthropometry, goals, energy).
- S00-T4: Guia de instrumentacao para frontend/backend.

## Criterios de aceite

- Todos os novos eventos possuem `event_name`, `event_version`, `patient_id`, `nutritionist_id`, `created_at`.
- Regras de prioridade podem ser cadastradas e lidas sem alterar codigo de UI.
- `feed_tasks` aceita criacao e mudanca de status via query segura.
- Nenhuma regressao no carregamento do dashboard/feed atual.

## Plano de testes

- Teste SQL: inserts validos/invalidos nas novas tabelas com RLS.
- Teste funcional: feed atual continua renderizando com dados existentes.
- Teste de observabilidade: eventos de 3 modulos diferentes aparecem com schema padrao.

## Dependencias para proxima sprint

- Esta sprint e pre-requisito de `SPRINT_01_FEED_INTELIGENTE_V2.md`.

## Riscos e mitigacoes

- Risco: quebra de consultas legadas.
  - Mitigacao: manter compatibilidade e fallback no `patient-queries.js`.
- Risco: RLS permissiva em tabela nova.
  - Mitigacao: policy deny-by-default e liberacao explicita por role.
