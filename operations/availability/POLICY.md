# Disponibilidade e recuperação

Domínio canônico: `https://nellonutri.com.br`. `www.nellonutri.com.br` redireciona preservando o caminho. `hipozero.com.br` e `www.hipozero.com.br` ficam aposentados: não são endpoints de produção, não aparecem em links emitidos pela aplicação e atualmente retornam 404. Sua associação DNS residual não comprova aplicação disponível.

`GET /api/health` verifica Auth, uma consulta ao catálogo público com `limit=0` pelo PostgREST e o health do Storage. O retorno da consulta deve ser exatamente `[]`, comprovando uma transação sem devolver registros. O endpoint OpenAPI raiz não é requisito: pode ser indisponível no ambiente hospedado. Tokens `anon` legados recebem Bearer; publishable keys usam apikey. Retorna 200 somente quando os três contratos estão disponíveis; falha parcial retorna 503. Não consulta registros clínicos, não usa service-role e não publica URLs, tokens ou erros internos. A janela de cada dependência é 2,5 segundos, com corpo limitado a 64 KiB. `HEAD` mantém o status; outros métodos recebem 405. Respostas não podem ser armazenadas em cache.

`/status` independe do carregamento de Auth, atualiza a cada 30 segundos e rejeita HTML, corpo contraditório e respostas antigas. Comunicados públicos são revisados em `incidents.mjs`; usam investigação, causa identificada, observação e resolução. Nunca incluir informações clínicas, pessoas, caminhos privados ou erros de provedores. Os comunicados seguem o fluxo de release; não substituem um canal operacional de resposta imediata.

O monitor `node scripts/availability/monitor.mjs https://nellonutri.com.br <journal.jsonl>` verifica status HTTP, tipo, contrato e frescor do corpo a cada minuto. A meta inicial de disponibilidade é 99,9% em 30 dias: orçamento de 43,2 minutos de falha. Alertas exigem as duas janelas: burn rate 14,4 em 5 min/1 h, ou 6 em 30 min/6 h. Lacunas, amostras duplicadas e observação insuficiente impedem uma conclusão saudável. O journal e o estado precisam de armazenamento persistente; stderr sinaliza mudanças de alerta ao operador. Ativação no provedor e entrega de alertas devem ser comprovadas antes de declarar monitoramento de produção concluído. Metas de latência, login e RTO/RPO permanecem metas, até medição de seu escopo.

Rotas são explícitas em `vercel.json`. `node scripts/availability/routes.mjs` detecta divergência dos deep links; `--write` atualiza a lista para revisão. APIs e URLs inexistentes não recebem o HTML da SPA. A aplicação clínica bloqueia indexação com `robots.txt`; não publica sitemap, cuja URL deve responder 404 real.

## Ensaio de recuperação

Com a reconstrução local, as nove identidades sintéticas e uma jornada clínica preparadas, executar `NELLO_LOCAL_QA=isolated node scripts/availability/recovery-drill.mjs`. O executor confere a identificação do stack e recusa contas fora de `example.invalid`. Não altera o banco de origem. Restaura em um banco com nome aleatório, novos serviços Auth/PostgREST/Storage e volume Linux descartável.

O backup autenticado AES-256-GCM inclui dump, objetos, atributos Linux e configurações secretas dos serviços. Chave errada falha. O ensaio mantém a chave apenas em memória: a produção exige um responsável e armazenamento separado da chave, testado independentemente. Arquivos de trabalho e logs privados ficam ignorados; somente resultados e hashes podem compor evidência pública.

Validação: catálogo independente, RLS/grants/functions, hashes de todas as tabelas públicas, senha e identidade Auth, login e sessão reais, leitura REST própria, bloqueio entre pacientes e bytes dos objetos pela API Storage. Uma queda controlada exclusivamente no banco restaurado comprova que a consulta vazia do PostgREST não devolve um falso 200 sem banco. RTO mede do início da restauração ao último smoke aprovado; RPO mede conservadoramente a idade do backup nesse início. Um teste local não certifica PITR, retenção nem backups contratados de produção.

GNU tar do ambiente Linux de QA preserva os atributos estendidos dos objetos. BusyBox tar e pastas Windows não garantem essa preservação. O executor remove apenas serviços, volumes e banco que ele criou; não para nem reseta o stack observado pelo canário.

## Gate de publicação

Primeiro: validação local proporcional, incluindo SQL e jornadas afetadas. Depois: um único push validado na main e deploy direto de produção. Confirmar todos os jobs, instalação, SHA, domínio, smoke e recuperação. Observação contínua em Sentry/PostHog e monitor externo; nenhuma espera fixa, canário separado ou tag é gate universal. Não certificar entrega com checks pendentes.
