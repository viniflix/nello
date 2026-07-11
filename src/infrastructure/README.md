# Infrastructure

Esta pasta contém adaptadores para serviços e fornecedores externos. Código de interface e regras de negócio não devem depender dos detalhes internos desses fornecedores.

## Fronteiras atuais

- `supabase/`: cliente compartilhado e configuração de transporte/sessão.
- `analytics/`: integração PostHog e catálogo atual de eventos.

## Regras

1. Páginas e componentes não criam clientes externos.
2. Configuração de fornecedor fica nesta pasta.
3. Queries de negócio pertencem à feature quando forem migradas; `infrastructure` não é depósito de regras clínicas.
4. Novos serviços devem ter um domínio proprietário explícito.
5. Telemetria não pode receber PII ou PHI sem revisão específica.
6. Adaptadores legados só existem durante migração controlada.

## Adaptadores temporários

- `src/lib/customSupabaseClient.js` reexporta o cliente canônico porque ainda possui consumidores de alto fan-out.
- `src/analytics/posthog.js` reexporta analytics para compatibilidade; consumidores de produção já usam o caminho canônico.

Esses adaptadores serão removidos quando as features correspondentes forem migradas e os testes confirmarem ausência de consumidores.
