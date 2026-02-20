# Revisao completa HipoZero (Front + Backend)

Data: 2026-02-19  
Escopo: frontend React/Vite, backend Supabase (SQL + Edge Functions), consistencia app x banco, qualidade geral de engenharia.

## 1) Como a revisao foi feita

- Leitura de codigo em modulos centrais (`src/pages`, `src/components`, `src/lib/supabase`, `supabase/sql`, `supabase/functions`).
- Validacao pratica de build: `npm run build` (passou, sem erro de compilacao).
- Validacao pratica via MCP no projeto Supabase `hipozero` (`avdulurxladkqtqszgno`) com SQL de verificacao de tabelas.
- Consolidacao de riscos por severidade (critica, alta, media, baixa).

Observacao importante:
- Parte dos achados de schema depende do ambiente alvo. No projeto Supabase hoje conectado, tabelas legadas usadas no codigo nao existem.

---

## 2) Problemas encontrados

## Criticos

1. **Inconsistencia forte entre schema usado no app e schema existente no Supabase conectado**
- Evidencias no codigo:
  - `src/lib/supabase/anthropometry-queries.js` usa `growth_records`.
  - `src/lib/supabase/goals-queries.js` usa `patient_goals` e `energy_expenditure_calculations`.
  - `supabase/sql/phase-18-anthropometry-versioning-hardening.sql` e `phase-19-anthropometry-clinical-automation.sql` dependem de `growth_records`.
- Evidencia no banco (MCP SQL):
  - `to_regclass('public.growth_records') = null`
  - `to_regclass('public.patient_goals') = null`
  - `to_regclass('public.energy_expenditure_calculations') = null`
  - `to_regclass('public.anthropometry_records') = anthropometry_records`
- Impacto: partes do fluxo clinico podem quebrar em runtime (consultas, triggers, calculos, metas).

2. **Edge Function `delete-user-securely` sem autorizacao por papel/ownership**
- Evidencia:
  - `supabase/functions/delete-user-securely/index.ts` autentica chamador, mas nao valida se ele pode deletar o `userIdToDelete`.
  - Uso direto de `SUPABASE_SERVICE_ROLE_KEY` para `auth.admin.deleteUser`.
- Impacto: usuario autenticado pode tentar deletar contas que nao deveria.

3. **Edge Function `create-patient` sem validacao de permissao do chamador**
- Evidencia:
  - `supabase/functions/create-patient/index.ts` usa `SUPABASE_SERVICE_ROLE_KEY` para convidar usuario.
  - Nao ha check de role (`nutritionist`, `admin`) antes de executar `inviteUserByEmail`.
- Impacto: convite de pacientes pode ser disparado por ator sem permissao.

## Altos

4. **URL e anon key do Supabase hardcoded no frontend**
- Evidencia:
  - `src/lib/customSupabaseClient.js` define `supabaseUrl` e `supabaseAnonKey` fixos.
- Impacto: dificulta multi-ambiente (dev/stage/prod), aumenta risco operacional de configuracao e rotacao de chaves.

5. **Formula de calorias duplicada em multiplos pontos**
- Evidencia:
  - `src/lib/utils/nutrition-calculations.js`
  - `src/components/nutrition/PortionSelector.jsx`
  - `src/lib/supabase/meal-plan-queries.js`
- Impacto: divergencia de regra ao longo do tempo, manutencao cara.

6. **Ausencia de base de testes automatizados no projeto**
- Evidencia:
  - `package.json` sem script `test`.
  - Sem configuracao de Jest/Vitest no projeto.
- Impacto: alto risco de regressao em refactors de modulos clinicos interligados.

7. **`console.*` em volume elevado no codigo de app/queries**
- Evidencia:
  - Muitas ocorrencias em `src/lib/supabase/*`, `src/contexts/*`, `src/pages/*`.
- Impacto: ruido operacional, risco de vazar contexto sensivel em logs do cliente.

8. **CORS permissivo em Edge Functions (`*`)**
- Evidencia:
  - `supabase/functions/create-patient/index.ts`
  - `supabase/functions/delete-user-securely/index.ts`
- Impacto: superficie maior de abuso quando combinado com falhas de autorizacao.

## Medios

9. **Fallbacks para coluna ausente indicam drift de migration**
- Evidencia:
  - `src/lib/supabase/anthropometry-queries.js` (`isMissingColumnError` e caminhos de fallback).
- Impacto: mascara erro estrutural de schema; reduz confiabilidade de diagnostico.

10. **Padrao de import inconsistente para cliente Supabase**
- Evidencia:
  - `src/lib/supabase/goals-queries.js` usa caminho relativo (`../customSupabaseClient`)
  - restante majoritariamente usa alias `@/lib/customSupabaseClient`
- Impacto: manutencao e refactor menos previsiveis.

11. **Camada de acesso a dados acoplada em varios componentes**
- Evidencia:
  - Muitos componentes/paginas importam `supabase` diretamente.
- Impacto: testabilidade baixa, repeticao de regra de erro/loading, maior acoplamento UI-dados.

12. **Padrao de data repetido e ad-hoc**
- Evidencia:
  - uso frequente de `toISOString().split('T')[0]` em paginas/componentes/queries.
- Impacto: risco de inconsistencias de timezone e formato.

13. **Validacao de formularios heterogenea (manual + schema)**
- Evidencia:
  - coexistencia de abordagens em formularios clinicos/nutricionais.
- Impacto: UX inconsistente, maior chance de validacao incompleta.

## Baixos

14. **Sem observabilidade estruturada evidente (error tracking/APM)**
- Evidencia:
  - nao foi encontrado setup claro de Sentry/APM centralizado no app.
- Impacto: MTTR maior em incidentes de producao.

15. **Chunks grandes no build para rotas importantes**
- Evidencia (build):
  - `PatientAnamnesisForm` ~135 KB
  - `index` principal ~636 KB (gzip ~200 KB)
  - libs pesadas (`jspdf`, `html2canvas`, `recharts`) com impacto relevante
- Impacto: tempo de carregamento e experiencia mobile.

---

## 3) Possiveis solucoes (objetivas e acionaveis)

## Bloco A - Estabilidade de dados (prioridade imediata)

1. **Definir schema canonico unico**
- Escolher nomenclatura final: manter `anthropometry_records` (atual do banco) ou migrar para `growth_records`.
- Publicar migration de compatibilidade (views/renomeacao controlada) para evitar quebra de frontend.

2. **Criar checklist de deploy de migration**
- Antes de release: validar existencia de tabelas/colunas criticas via SQL automatizado.
- Falhar pipeline se schema esperado nao bater.

3. **Remover fallback silencioso de coluna faltante**
- Manter fallback so temporario e com telemetria explicita.
- Definir data de retirada apos normalizacao de schema.

## Bloco B - Seguranca backend

4. **Fortalecer autorizacao nas Edge Functions**
- `delete-user-securely`: exigir admin ou ownership explicito do paciente.
- `create-patient`: validar role do chamador antes de convite.
- Rejeitar por padrao (`403`) se nao autorizado.

5. **Restringir CORS por ambiente**
- Trocar `*` por lista de origens permitidas (`ALLOWED_ORIGINS`).

6. **Adicionar rate limit**
- Limite por usuario/IP para endpoints sensiveis (convites e delecao).

## Bloco C - Qualidade do frontend

7. **Externalizar configuracao Supabase para env**
- Usar `import.meta.env` para URL/chave.
- Padronizar `.env.example` + validacao de env no startup.

8. **Criar camada de dados (services/repositories)**
- Reduzir acesso direto a `supabase` em UI.
- Padronizar retorno `{ data, error, meta }` e tratamento de erro.

9. **Centralizar regras nutricionais reutilizaveis**
- Calorias/macros, datas e validacoes em utilitarios unicos.

10. **Reduzir logs ruidosos**
- `console.log` apenas em dev, com logger padrao e niveis.

## Bloco D - Engenharia de confiabilidade

11. **Introduzir testes por risco de negocio**
- Comecar por fluxos criticos: convite paciente, antropometria, metas, plano alimentar.
- Meta inicial: smoke + integracao dos modulos clinicos.

12. **Padronizar validacao de formularios**
- Zod + React Hook Form em formularios de alta criticidade.

13. **Observabilidade**
- Sentry (frontend), logs estruturados no backend, dashboard de erro/performance.

---

## 4) Melhorias para deixar o sistema mais completo e competitivo (WebDiet/DietBox+)

## Produto (nutricionista + paciente)

1. **Visao clinica 360 integrada por paciente**
- Timeline unica com antropometria, adesao, exames, metas, dieta e intercorrencias.
- Alertas clinicos acionaveis (ex.: queda de adesao + piora de peso + falta de retorno).

2. **Motor de recomendacao assistida**
- Sugestoes de ajuste de plano alimentar com base em tendencia real (30/60/90 dias), objetivo e aderencia.

3. **Modulo de jornada do paciente**
- Protocolos por objetivo (emagrecimento, hipertrofia, reeducacao, controle metabolico) com checkpoints e tarefas semanais.

4. **Experiencia mobile do paciente**
- Melhorar onboarding, lembretes inteligentes, check-ins rapidos, feedback visual de progresso.

5. **Automacao de consultorio**
- Templates por perfil de paciente, duplicacao inteligente de condutas, tarefas automaticas pre e pos consulta.

## Plataforma e negocio

6. **Camada analitica de resultado clinico**
- Indicadores por nutricionista/paciente/coorte (adesao, evolucao, retorno, retencao).

7. **Mecanismos de confianca e compliance (LGPD)**
- Trilha de auditoria clinica ampla (quem alterou o que e quando), exportacao e governanca de consentimento.

8. **Arquitetura de feature flags**
- Liberar funcionalidades de forma gradual por plano/perfil.

9. **Performance e escalabilidade**
- Cache inteligente para dados de dashboard, paginação real, lazy loading orientado por uso.

10. **Diferencial comercial**
- Score de evolucao clinica explicavel para paciente e nutricionista, com recomendacoes de proximo passo.

---

## 5) Roadmap sugerido (30/60/90 dias)

## 0-30 dias (foco em risco alto)
- Fechar gap de schema app x Supabase.
- Corrigir autorizacao nas edge functions.
- Mover config Supabase para env.
- Definir padrao de erro/log.

## 31-60 dias (foco em confiabilidade)
- Camada de dados unificada no frontend.
- Suite inicial de testes para fluxos criticos.
- Observabilidade basica em producao.

## 61-90 dias (foco em produto e escala)
- Timeline clinica integrada + alertas acionaveis.
- Dashboard de KPI tecnico e de produto.
- Otimizacao de bundle e performance mobile.

---

## 6) Conclusao executiva

O HipoZero ja mostra base funcional ampla de ecossistema nutricionista-paciente, mas hoje o maior risco e **consistencia entre codigo e schema real do backend**, seguido por **controle de autorizacao em funcoes com service role**.  

Se esses pontos forem atacados primeiro, o projeto ganha seguranca, previsibilidade de evolucao e velocidade para entregar diferenciais modernos de mercado.

