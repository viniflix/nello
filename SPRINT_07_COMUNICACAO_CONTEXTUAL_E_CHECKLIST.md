# Sprint 07 - Comunicacao Contextual v2 + Checklist Pre-consulta

## Vinculo com backlog mestre

- E5-S2 (templates contextuais)
- E5-S3 (orientacao pos-evento)
- E4-S2 (checklist pre-atendimento)

## Objetivo da sprint

Aumentar engajamento e continuidade de tratamento com comunicacao contextual e suporte operacional para consulta.

## Estado atual reaproveitado (codigo existente)

- `src/components/nutritionist/NutritionistActivityFeed.jsx`
- `src/pages/nutritionist/patients/PatientHubPage.jsx`
- `src/components/patient-hub/tabs/TabContentFeed.jsx`
- Fluxos de chat existentes (`/chat/nutritionist/:patientId`)

## Escopo fechado

- Templates de mensagem por contexto clinico.
- Disparo de "proxima melhor acao" apos evento relevante.
- Checklist pre-consulta auto-gerado com itens priorizados.
- Historico de uso de templates e checklist.

## Entregaveis tecnicos

- Tabela `message_templates`.
- Parser de variaveis de template (nome, meta, prazo, etc.).
- Tabela `consultation_checklists`.
- Componente de checklist no hub (tab clinico/feed).

## Criterios de aceite

- Nutricionista cria/edita/usa template com preview.
- Paciente recebe orientacao contextual em ate 5 minutos do evento.
- Checklist pre-consulta gera entre 5 e 10 itens ordenados.
- Itens de checklist podem ser marcados e ficam auditaveis.

## Testes

- Teste de placeholders invalidos em template.
- Teste de SLA de disparo da mensagem contextual.
- Teste de reabertura de checklist ja iniciado.

## Dependencias

- Requer motor de automacao da Sprint 04.
- Requer eventos padronizados da Sprint 00.
