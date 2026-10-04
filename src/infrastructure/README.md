# Infrastructure

Esta pasta contém adaptadores para serviços e fornecedores externos. Código de interface e regras de negócio não devem depender dos detalhes internos desses fornecedores.

## Fronteiras atuais

- `supabase/`: cliente compartilhado, configuração de transporte/sessão e transportes com proprietário por domínio (`domainClients`). Todos compartilham a mesma sessão; autorização permanece no servidor.
- `analytics/`: integração PostHog e catálogo atual de eventos.

## Regras

1. Páginas e componentes não criam clientes externos.
2. Configuração de fornecedor fica nesta pasta.
3. Queries de negócio pertencem à feature quando forem migradas; `infrastructure` não é depósito de regras clínicas.
4. Novos serviços devem ter um domínio proprietário explícito.
5. Telemetria não pode receber PII ou PHI sem revisão específica.
6. Adaptadores legados só existem durante migração controlada.

## Adaptadores temporários

- `src/lib/customSupabaseClient.js` não possui imports de produção conhecidos após a migração. Foi preservado para compatibilidade e emite um sinal de uso sem payload, sujeito ao consentimento de analytics. Ausência em testes não comprova uso zero em todos os clientes antigos.
- `src/analytics/posthog.js` reexporta analytics para compatibilidade; consumidores de produção já usam o caminho canônico.

Esses adaptadores serão removidos quando as features correspondentes forem migradas e os testes confirmarem ausência de consumidores.

## Domínio compartilhado

`src/domain` contém regras e contratos TypeScript estritos, sem React, Supabase, DOM ou armazenamento. `domain/api.ts` define a versão 1 do contrato do cliente e traduz operações para RPCs transacionais existentes, mantendo seus nomes, payloads e verificações no servidor. Consumidores JavaScript anteriores continuam compatíveis; não existe uma migração SQL para esse envelope.

`npm run check:architecture` bloqueia aumento do acesso direto na UI e dependências de plataforma no domínio. A lista de exceções em `operations/architecture/ui-database-baseline.json` é dívida explícita do strangler incremental; novas interfaces devem usar APIs de feature. `npm run check:types` verifica o domínio e faz parte do gate de release.

O contrato de sync rejeita recibos de outra conta e revisões antigas. Ele não implementa fila offline, cache clínico ou replay automático. O manifest mantém `display: browser`; nenhum service worker é registrado.
