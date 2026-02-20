# Backlog Pos-Release HipoZero (Benchmark + Evolucao)

## Objetivo

Definir um backlog detalhado para evoluir o HipoZero sem perder a essencia do ecossistema nutricionista-paciente, priorizando valor clinico, engajamento e vantagem competitiva frente a plataformas como WebDiet e Dietbox.

## Resumo Executivo

O HipoZero ja possui base clinica forte e integrada (antropometria, GET, metas, plano, diario e exames), com sincronizacao entre modulos e feed para o nutricionista. O principal gap competitivo esta em camadas de recorrencia e fidelizacao (automacoes, comunicacao contextual, gestao de rotina e experiencia do paciente orientada por micro-acoes).

## Benchmark de mercado (publico)

- WebDiet e Dietbox destacam: automacoes WhatsApp, agenda integrada, lembretes ativos, app paciente com diario/metas/lista de compras, ferramentas de captação e recursos de marketing.
- WebDiet destaca: Body3D e assistencia por IA para anamnese/exames/metas.
- Dietbox destaca: videoconferencia/chat no app, hidratação com lembretes, NutriPlan (tarefas), marketplace/loja e jornada academica/conteudos.
- Gap principal do HipoZero hoje: transformar informacao clinica em fluxo operacional recorrente e comportamento diario no paciente.

## Analise do que ja existe no codigo

- Dashboard nutricionista com feed e sinais de urgencia: `src/pages/nutritionist/dashboard/NutritionistDashboard.jsx`.
- Inbox/Registros recentes com filtros e pesquisa de paciente: `src/components/nutritionist/PatientUpdatesWidget.jsx`.
- Feed consolidado com pendencias, baixa adesao, consultas e atividades: `src/components/nutritionist/NutritionistActivityFeed.jsx`.
- Hub do paciente com tabs e jornada por modulo: `src/pages/nutritionist/patients/PatientHubPage.jsx`.
- Modulo de plano alimentar com templates, copia, monitor de alvo e PDF: `src/pages/nutritionist/patients/MealPlanPage.jsx`, `src/components/meal-plan/MealPlanForm.jsx`, `src/components/meal-plan/TemplateManagerDialog.jsx`, `src/components/meal-plan/PlanTargetMonitor.jsx`.
- Modulo de gasto energetico com protocolos, sugestoes e salvamento: `src/pages/nutritionist/patients/EnergyExpenditurePage.jsx`.
- Modulo de metas com viabilidade e progresso: `src/pages/nutritionist/patients/GoalsPage.jsx`, `src/lib/supabase/goals-queries.js`.
- Modulo de exames com PDF e status: `src/pages/nutritionist/patients/LabResultsPage.jsx`, `src/lib/supabase/lab-results-queries.js`.
- Modulo de diario alimentar com adesao e resumo nutricional: `src/lib/supabase/food-diary-queries.js`.
- Camada de sincronizacao entre modulos (antropometria -> GET/plano): `supabase/sql/phase-19-anthropometry-clinical-automation.sql`, `src/lib/supabase/anthropometry-queries.js`.

## Principios de produto para a proxima fase

- Manter foco clinico-pratico para o nutricionista (menos clique, mais conduta acionavel).
- Conectar todo evento clinico a uma proxima acao recomendada (e rastreavel).
- Aumentar cadencia de uso do paciente com micro-habitos simples e feedback frequente.
- Priorizar features com efeito mensuravel em adesao, retorno e desfecho clinico.

## Epicos priorizados

- E1: Feed Inteligente 2.0 para nutricionista.
- E2: Adesao ativa do paciente (tarefas, lembretes e streak).
- E3: Plano alimentar orientado por meta e variacao.
- E4: Copiloto clinico explicavel (assistencia segura).
- E5: Comunicacao contextual e automacoes de follow-up.
- E6: Exames e risco clinico com timeline interpretativa.
- E7: Operacao do consultorio (agenda, no-show, financeiro leve).
- E8: Medicao de produto, observabilidade e growth loops.

## Backlog detalhado (epicos, historias, criterios e implementacao tecnica)

| ID | Epico | Historia | Criterios de aceite | Implementacao tecnica (codigo atual) | Prioridade |
|---|---|---|---|---|---|
| E1-S1 | Feed Inteligente 2.0 | Como nutricionista, quero score de prioridade no feed para agir primeiro no que gera maior risco. | Feed ordena por urgencia clinica e impacto de adesao; cada card exibe motivo da prioridade; tempo de triagem reduzido. | Estender agregacao em `getComprehensiveActivityFeed` (`src/lib/supabase/patient-queries.js`) com score composto; incluir pesos configuraveis em tabela nova `notification_rules`; renderizar score e motivo em `NutritionistActivityFeed.jsx`. | P0 |
| E1-S2 | Feed Inteligente 2.0 | Como nutricionista, quero acao rapida inline (marcar resolvido, adiar, atribuir follow-up). | Card permite resolver/adiar sem sair da tela; estado persiste; item reaparece quando vencer adiamento. | Criar tabela `feed_tasks` (status, snooze_until, resolved_by); RPC para upsert/resolve; UI em `NutritionistActivityFeed.jsx` e `PatientUpdatesWidget.jsx`; auditar em `activity_log`. | P0 |
| E1-S3 | Feed Inteligente 2.0 | Como nutricionista, quero filtros por cohort (novos pacientes, baixa adesao, risco alto). | Filtros aplicados sem recarregar pagina; contadores por filtro; persistencia no usuario. | Adicionar preferencias em `user_profiles.preferences`; hooks de filtro no dashboard; endpoint consolidado com parametros no `patient-queries.js`. | P1 |
| E1-S4 | Feed Inteligente 2.0 | Como nutricionista, quero SLA de pendencias (tempo em aberto). | Cada pendencia mostra idade e cor por SLA; relatorio semanal de backlog aberto. | Campos `created_at`, `first_seen_at` e `last_seen_at` em `feed_tasks`; card com badge de SLA; widget novo no dashboard. | P1 |
| E2-S1 | Adesao ativa | Como paciente, quero ver tarefas do dia para saber exatamente o que fazer. | Tela exibe checklist diario (refeicoes, agua, peso, meta); progresso diario em %. | Criar `patient_daily_tasks`; gerar tarefas via job diario (Edge Function/Scheduler); consumir no app paciente (`src/pages/patient/*`) e no hub (`TabContentAdherence.jsx`). | P0 |
| E2-S2 | Adesao ativa | Como paciente, quero lembretes configuraveis de refeicao/hidratacao/check-in. | Usuário ativa/desativa lembretes; horarios respeitados; taxa de entrega registrada. | Tabela `patient_reminder_preferences`; fila de notificacoes (Edge Function + provider push/WhatsApp); hooks no app paciente; painel no perfil paciente. | P0 |
| E2-S3 | Adesao ativa | Como nutricionista, quero streak e consistencia semanal por paciente. | Dashboard mostra streak atual, melhor streak e consistencia 7/30 dias; comparativo semanal. | Reaproveitar `calculateDiaryAdherence`; criar agregados em `patient_engagement_metrics`; cards em `PatientHub` e `NutritionistDashboard`. | P1 |
| E2-S4 | Adesao ativa | Como paciente, quero feedback positivo imediato apos concluir tarefa. | Conclusao de tarefa gera micro-feedback e badge contextual; sem bloquear fluxo. | Componente de feedback no app paciente; eventos no `activity_log`; badges em `Achievements` com regras simples. | P2 |
| E3-S1 | Plano orientado por meta | Como nutricionista, quero alerta de desalinhamento entre GET/meta e plano ativo. | Alerta aparece quando diferenca > limiar; CTA abre ajuste do plano; status sincronizado apos salvar. | Evoluir `PlanTargetMonitor.jsx` com limiares configuraveis e historico de divergencia; persistir em `patient_module_sync_flags` + nova tabela `plan_alignment_events`. | P0 |
| E3-S2 | Plano orientado por meta | Como nutricionista, quero sugestao automatica de ajuste de porcoes por refeicao. | Sistema sugere ajuste por refeicao para bater alvo calorico/macros; nutricionista pode aceitar parcial. | Reutilizar logica de `TemplateManagerDialog` (scaleFactor) e `meal-plan-queries.js`; criar simulador em `MealPlanForm` com preview before/after. | P0 |
| E3-S3 | Plano orientado por meta | Como nutricionista, quero versoes de plano com historico comparativo. | Cada edicao cria versao; comparativo macro/caloria entre versoes; rollback em 1 clique. | Criar `meal_plan_versions` e snapshot de meals/foods; adaptar `updateFullMealPlan`; UI de timeline em `MealPlanPage.jsx`. | P1 |
| E3-S4 | Plano orientado por meta | Como nutricionista, quero biblioteca de variacoes por refeicao para aumentar adesao. | Refeicao aceita substituicoes equivalentes; paciente enxerga opcoes autorizadas. | Tabelas `meal_food_alternatives` e `equivalence_groups`; UI em `MealPlanMealForm`; leitura no app paciente. | P1 |
| E3-S5 | Plano orientado por meta | Como nutricionista, quero score de complexidade do plano para evitar abandono. | Plano recebe score (simples/moderado/complexo) com recomendacoes de simplificacao. | Algoritmo baseado em numero de refeicoes, itens e preparo; badge em `MealPlanForm`/`MealPlanPage`; eventos para analytics. | P2 |
| E4-S1 | Copiloto clinico | Como nutricionista, quero recomendacoes explicadas e rastreaveis no contexto do paciente. | Toda sugestao mostra "por que", dados usados e confianca; acao manual obrigatoria para aplicar. | Criar `clinical_recommendations` (input, output, rationale, accepted_by); painel em `PatientHub`; integrar com dados de `goals`, `energy`, `anthropometry`, `labs`. | P0 |
| E4-S2 | Copiloto clinico | Como nutricionista, quero checklist de consulta pre-atendimento auto-gerado. | Checklist gerado com 5-10 itens priorizados; marcacao de concluido durante consulta. | RPC de resumo clinico pre-consulta; componente em `PatientHub` feed/clinical tabs; persistencia em `consultation_checklists`. | P1 |
| E4-S3 | Copiloto clinico | Como nutricionista, quero explicacao do impacto esperado de cada ajuste. | Antes de salvar ajuste, sistema projeta efeito em meta e prazo; faixa de incerteza exibida. | Reusar calculos de `goals-queries` e `energy-calculations`; modulo de simulacao em `GoalsPage` e `EnergyExpenditurePage`. | P1 |
| E4-S4 | Copiloto clinico | Como gestor, quero governanca do copiloto (prompts, versoes, auditoria). | Mudancas em regras versionadas; logs de recomendacao auditaveis; rollback de regra. | Tabela `assistant_rules_versions`; admin screen em `src/components/admin/*`; feature flag por clinica. | P2 |
| E5-S1 | Comunicacao contextual | Como nutricionista, quero automacoes de follow-up por evento (novo plano, meta atrasada, baixa adesao). | Fluxos configuraveis com gatilho e template; historico de envio por paciente. | Tabela `communication_automations`; executor em Edge Function; editor simples de fluxos no dashboard. | P0 |
| E5-S2 | Comunicacao contextual | Como nutricionista, quero templates de mensagem por contexto clinico. | Biblioteca de templates com variaveis; preview antes de envio; taxa de uso por template. | `message_templates` + parser de variaveis; UI de template no dashboard; integrar com chat/WhatsApp connector. | P1 |
| E5-S3 | Comunicacao contextual | Como paciente, quero receber orientacoes curtas apos eventos-chave. | Paciente recebe "proxima melhor acao" em ate 5 min apos evento; taxa de leitura registrada. | Evento em `activity_log` aciona workflow; notificacao no app paciente e opcional WhatsApp; ack de leitura. | P1 |
| E6-S1 | Exames e risco | Como nutricionista, quero timeline de exames com tendencia e semaforo de risco. | Exame mostra evolucao temporal e classifica risco em baixo/moderado/alto; comparacao com referencia. | Evoluir `lab-results-queries.js` com agregacao temporal; card de tendencia em `LabResultsPage.jsx`; tabela `lab_risk_rules`. | P0 |
| E6-S2 | Exames e risco | Como nutricionista, quero sugestoes de conduta baseadas em combinacao de exames + objetivo. | Sugestao aparece com justificativa e opcao de aprovar/descartar; sem auto-aplicacao. | Motor de regra em RPC (`evaluate_lab_goal_rules`); UI no modulo de exames e hub clinico; log em `clinical_recommendations`. | P1 |
| E6-S3 | Exames e risco | Como nutricionista, quero checklist de reavaliacao laboratorial por protocolo. | Sistema lembra exames de controle por janela de tempo e perfil do paciente. | Tabela `lab_followup_protocols`; job diario para pendencias; cards no `NutritionistActivityFeed`. | P2 |
| E7-S1 | Operacao consultorio | Como nutricionista, quero reduzir no-show com confirmacao automatica e lembretes multicanal. | Envio D-1 e H-2; status confirmado/cancelado registrado; relatorio de no-show mensal. | Extender `appointments`; adicionar `appointment_notifications`; worker de notificacao; widget de no-show no dashboard. | P0 |
| E7-S2 | Operacao consultorio | Como nutricionista, quero tarefa de secretaria com permissao granular. | Perfis de acesso por modulo (agenda/financeiro/cadastro); trilha de auditoria. | Ajustar RBAC em `user_profiles.role` + `permissions`; guards no frontend e RLS complementar no backend. | P1 |
| E7-S3 | Operacao consultorio | Como nutricionista, quero forecast financeiro vinculado a agenda e adesao. | Painel mostra receita prevista, recebida e risco de cancelamento. | Integrar `financial-queries.js` + `agenda-queries.js`; modelo simples de forecast; card no dashboard financeiro. | P2 |
| E8-S1 | Medicao e growth | Como produto, quero funil de adesao por modulo para guiar priorizacao. | Painel mostra ativacao e retencao por modulo; dados por periodo e coorte. | Instrumentacao padrao em `activity_log`; eventos nomeados; dashboard interno de analytics. | P0 |
| E8-S2 | Medicao e growth | Como produto, quero acompanhar impacto de cada feature no desfecho clinico. | Experimentos com metricas pre-definidas; comparacao antes/depois por paciente. | Framework leve de experimentos com feature flags; `experiment_assignments` e `experiment_metrics`. | P1 |
| E8-S3 | Medicao e growth | Como engenharia, quero observabilidade ponta a ponta dos fluxos criticos. | Erros por modulo, latencia por query e taxa de falha de automacoes monitoradas. | Padronizar logs estruturados (frontend + edge + db), alertas em erro critico e painel operacional. | P1 |

## Ordem de implementacao tecnica recomendada

### Onda 1 (Semanas 1-3) - impacto imediato em adesao e operacao clinica

- E1-S1, E1-S2 (Feed Inteligente 2.0 com acao inline).
- E3-S1 (desalinhamento GET/plano com CTA de ajuste).
- E2-S1 (tarefas do dia basicas).
- E8-S1 (instrumentacao minima para medir resultado desde o inicio).

### Onda 2 (Semanas 4-6) - melhoria de desfecho clinico

- E3-S2 (simulador de ajuste de porcoes).
- E5-S1 (automacoes de follow-up por evento).
- E6-S1 (timeline e risco em exames).
- E2-S2 (lembretes configuraveis paciente).

### Onda 3 (Semanas 7-9) - diferenciais de mercado

- E4-S1 (copiloto clinico explicavel, sem auto-acao).
- E3-S3 (versionamento de plano com comparativo).
- E7-S1 (reducao de no-show com automacoes).
- E8-S3 (observabilidade completa).

### Onda 4 (Semanas 10-12) - escala e consolidacao

- E5-S2, E5-S3 (templates e mensagens contextuais).
- E4-S2, E4-S3 (checklist pre-consulta e simulacao de impacto).
- E7-S2 (permissoes de secretaria).
- E6-S2 (sugestoes de conduta com governanca).

## Arquitetura alvo (incremental no codigo atual)

- Camada de eventos unificada: consolidar eventos de modulos em `activity_log` com schema padrao.
- Camada de regras configuravel: tabelas de regra para priorizacao de feed, risco laboratorial e automacoes.
- Camada de automacao assincrona: jobs/edge functions para lembretes e follow-up.
- Camada de assistencia explicavel: armazenamento de recomendacao + justificativa + aceite manual.
- Camada de analytics de produto: funil por modulo e coortes de adesao.

## Criterios de pronto (Definition of Done) por historia

- Criterios funcionais implementados e testados no fluxo nutricionista e paciente.
- Cobertura minima de testes: fluxo feliz + 2 cenarios de erro por historia.
- Evento de analytics instrumentado com nome padrao e propriedades essenciais.
- Logs de erro padronizados sem regressao de observabilidade.
- Revisao de seguranca (RLS/permissions) aplicada quando houver nova tabela/operacao sensivel.
- Documentacao da historia atualizada no changelog de produto.

## Riscos e mitigacoes

- Risco de sobrecarga de notificacoes no paciente: aplicar rate limit e janela silenciosa.
- Risco de recomendacao clinica sem contexto suficiente: exigir "dados minimos" para habilitar copiloto.
- Risco de aumento de complexidade no plano: manter "modo simples" por default e escalar gradualmente.
- Risco de regressao de performance no dashboard: cache de agregados e paginacao por prioridade.

## KPIs de sucesso da fase

- +20% em pacientes ativos semanais (WAU paciente).
- +15% em registros de diario por paciente ativo.
- -25% em tempo medio do nutricionista para triagem de pendencias.
- -15% em no-show de consultas.
- +10% em metas com progresso >= 70% no prazo planejado.

## Proxima acao sugerida

Criar sprint zero tecnico de 5 dias para:

- detalhar contrato de eventos,
- definir tabelas novas da Onda 1,
- entregar prototipo navegavel do Feed Inteligente 2.0 com acoes inline.
