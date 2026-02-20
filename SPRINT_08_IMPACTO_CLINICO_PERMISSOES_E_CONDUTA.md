# Sprint 08 - Simulacao de Impacto + Permissoes + Conduta por Exames

## Vinculo com backlog mestre

- E4-S3 (simulacao de impacto esperado)
- E7-S2 (permissoes granulares)
- E6-S2 (conduta por exames + objetivo)

## Objetivo da sprint

Fechar ciclo clinico-operacional com previsao de impacto de conduta, seguranca de acesso por perfil e suporte decisorio baseado em exames.

## Estado atual reaproveitado (codigo existente)

- `src/pages/nutritionist/patients/GoalsPage.jsx`
- `src/pages/nutritionist/patients/EnergyExpenditurePage.jsx`
- `src/pages/nutritionist/patients/LabResultsPage.jsx`
- `src/components/admin/AdminControlBar.jsx`
- `src/lib/supabase/goals-queries.js`

## Escopo fechado

- Simulador de impacto em meta/prazo antes de salvar ajustes.
- Permissoes por modulo para perfil de secretaria e equipe.
- Sugestao de conduta combinando exames + objetivo.
- Log de aprovacao/recusa de conduta com auditoria.

## Entregaveis tecnicos

- RPC `evaluate_lab_goal_rules`.
- Estruturas de permissoes:
  - tabela `permissions`
  - mapeamento por role/usuario
- Guards frontend por modulo e reforco RLS backend.
- UI de simulacao em metas/GET com faixa de incerteza.

## Criterios de aceite

- Nutricionista visualiza impacto estimado antes de confirmar mudanca.
- Usuario sem permissao nao acessa modulo sensivel.
- Sugestoes de conduta mostram justificativa e nao aplicam automaticamente.
- Aprovacoes e recusas ficam registradas para auditoria.

## Testes

- Teste de autorizacao por role em 3 modulos.
- Teste de simulacao com cenarios de ganho/perda/manutencao.
- Teste de sugestao de conduta com exames fora/na faixa.

## Dependencias

- Requer copiloto base da Sprint 05.
- Requer risk engine de exames da Sprint 04.

## Encerramento da trilha

Ao finalizar esta sprint, o ciclo principal de valor do backlog pos-release fica implementado no eixo:

- triagem inteligente,
- adesao ativa,
- prescricao adaptativa,
- assistencia clinica explicavel,
- operacao do consultorio orientada a dados.
