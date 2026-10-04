# Nello — atribuições de terceiros

O pacote Nello é privado (`UNLICENSED`). Essa declaração não altera as licenças dos componentes de terceiros.

`npm run check:licenses` gera SBOM CycloneDX, inventário de dependências de produção e textos de licença/atribuição em `.qa-licenses/`. O workflow de qualidade preserva os três arquivos como artefato de cada commit. O build publica os avisos em `/third-party-notices.txt`, junto à aplicação. O inventário inclui dependências de construção presentes na árvore de produção; não afirma que todas são distribuídas ao navegador.

Seleções registradas para licenças alternativas: MIT para componentes `MIT OR GPL`; Apache-2.0 para `MPL-2.0 OR Apache-2.0`; MIT para rgbcolor. Licenças cumulativas (`AND`) mantêm todas as obrigações. O Sentry CLI utiliza FSL-1.1-MIT e executa somente na construção; seu texto é preservado no artefato, sem incorporá-lo ao cliente web.

Clash Display: Indian Type Foundry, distribuída pelo Fontshare sob ITF Free Font License. Fonte oficial e termos: https://www.fontshare.com/fonts/clash-display e https://www.fontshare.com/licenses. Os arquivos são usados sem alteração como webfonts do Nello; não são oferecidos como produto de fontes independente.

Este inventário formaliza procedência e atribuição técnica; não substitui avaliação jurídica de usos futuros ou alteração das licenças dos autores.
