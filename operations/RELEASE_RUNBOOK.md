# Entrega e recuperação do Nello

O fluxo é desenvolvimento na main, validação local com dados sintéticos e deploy direto em produção. Um banco permanente; nenhuma branch, preview, staging, tag ou espera fixa é pré-requisito.

## Antes de publicar

Revisar contratos e consumidores; executar verify:release e, para alterações clínicas/de banco, reconstrução, SQL/RLS/concorrência e browser em QA local isolado. Preservar arquivos locais e históricos aplicados. Conferir recuperação, dados incompatíveis e ordem de aplicação antes de SQL em produção. Nenhum reset, seed, injeção de falha ou fixture automática em produção.

Commit validado com autoria Vinicius Costa e push apenas da main. O GitHub confirma os gates e a instalação; Vercel entrega diretamente a main. Não testar reparos por repetidos pushes.

## Validação imediata e observação contínua

Conferir todos os jobs, deployment READY do SHA exato, domínio canônico, assets/headers, health real, Auth, Storage, REST, status e 404. Capturar evidência atual e executar readiness e controlledRelease como verificação da produção já publicada, sem promover canário ou aguardar cronômetro.

Sentry acompanha falhas/performance; PostHog navegação/operações com IDs técnicos por usuário/sessão e correlação; monitor externo valida disponibilidade sem depender de usuários ou desta máquina. Não coletar prontuários, tokens ou texto livre. Replay e console bruto ficam desativados. Consultar sinais pelo release e ambiente e comprovar uma ocorrência técnica controlada. Ausência de alertas sem uso não comprova correção clínica.

## Contenção e recuperação

Acesso cruzado, perda/corrupção de dados, cálculo clínico incorreto, segredo ou dado clínico na telemetria interrompem o avanço. Conter o caminho afetado e recuperar a última aplicação compatível quando a regressão for atribuível à entrega.

Registrar o deployment anterior e confirmar que ainda está READY no mesmo projeto. Antes de rollback automático, conferir que o domínio continua no deployment desta entrega: não sobrescrever uma publicação concorrente. Rollback do frontend não desfaz SQL, Auth ou Storage. Migrações exigem recuperação própria; não reaplicar SQL histórico nem ajustar dados clínicos silenciosamente.

Registrar evidências e limites reais. Avançar para a próxima wave somente com gates aplicáveis aprovados e sem regressão crítica conhecida. A observação continua em produção enquanto novas correções locais avançam.
