# Execução e recuperação de releases do Nello

Responsável técnico: executor da wave. Responsável pelo produto e contas dos provedores: viniflix. Domínio canônico e critérios iniciais em `release-policy.json`. Metas são objetivos iniciais; não representam SLO medido nem backup contratado.

## Antes de uma mudança

## Severidades e parada

- SEV1: acesso cruzado, perda/corrupção de dados, cálculo clínico incorreto ou segredo/PII clínica na telemetria. Suspender promoção imediatamente; preservar evidências sem PII, conter o caminho afetado e recuperar a última versão compatível.
- SEV2: indisponibilidade de login/jornada crítica ou falhas inesperadas recorrentes. Suspender promoção e recuperar se atribuível ao candidato.
- SEV3: degradação parcial com recuperação disponível. Permanecer na wave até testes e consumidores passarem.
- Erro esperado de validação, vínculo ou autenticação não é SEV1 sem evidência de acesso incorreto. Separar essas recusas de falha técnica.

## Deploy e observação

Revisar diff e gates, commit da wave, integração sem force push e push da main. Confirmar deployment `READY`, SHA exato e domínio canônico. Executar `node scripts/qa/release-smoke.mjs` e smoke sintético dos contratos afetados. Consultar Sentry/PostHog desde o deploy, separados por release e ambiente; internos separados de externos. Sem tráfego, ausência de erro não comprova a jornada.

Para artefatos operacionais sem alteração funcional, observar ao menos cinco minutos e comprovar que o código funcional permaneceu igual; a identificação de release pode mudar os bytes do bundle. Para mudanças runtime, observar ao menos 30 minutos; mudanças clínicas, de dados ou autorização exigem canário e janela mínima de 24 horas antes de expansão integral. Continuar coleta durante essa janela sem declarar conclusão antecipada.

Somente criar `wave-XX-verified` depois dos gates, domínio, SHA e smoke confirmados. Nunca mover a tag publicada. Registrar decisão por achado: corrigido, mitigado, aceito explicitamente ou não reproduzido com evidência. Plano/documentação não encerram defeito runtime.

## Rollback de frontend

1. Identificar o deployment anterior `READY`, seu SHA e contratos de banco/functions que permanecem compatíveis.
2. Via Vercel selecionar esse deployment como rollback ou usar `vercel rollback <url-anterior> --yes`; verificar a conta/projeto antes de confirmar.
3. Confirmar alias do domínio, SHA, assets, login e smoke das jornadas afetadas. Registrar horário e incidente. Parar promoções até a correção.
4. Alternativa quando rollback de alias não estiver disponível: `git revert <commit-da-wave>` em branch de correção, gates, integração e novo deploy. Nunca reset/force push da main.

Referência oficial: [Vercel rollback](https://vercel.com/docs/cli/rollback). Ensaio documental verifica identidade, permissão de leitura e disponibilidade da referência; não equivale a restauração realizada.

## Backend e recuperação

Rollback de frontend não desfaz SQL, Storage, Auth ou Edge Functions. Preservar contrato antigo nas migrações. Reimplantar função anterior somente com fonte/versionamento e configuração JWT comprovados. DDL irreversível exige backup e restore isolado comprovado; na ausência dessas evidências, bloquear DDL. RTO 60 min/RPO 15 min são objetivos a validar na Wave 3 e certificar na Wave 16.

## Retomada

Ler checkpoint e seção da wave, conferir Git, SHA/estado Vercel e tag. Retomar a primeira verificação não comprovada. Se houve push, verificar o deployment existente antes de criar outro. Preservar logs de falha; classificar defeito da wave, preexistente ou provedor. Corrigir e retestar os consumidores antes de avançar.
