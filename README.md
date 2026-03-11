# HipoZero

O HipoZero é uma plataforma SaaS (Software as a Service) de nutrição que conecta nutricionistas e pacientes, centralizando toda a jornada nutricional em um único ecossistema acessível.

- **Para o Nutricionista:** É um consultório digital completo, focado em gestão clínica eficiente (pacientes, planos, avaliações, finanças).
- **Para o Paciente:** É um aplicativo de acompanhamento motivacional, que simplifica o registro da rotina alimentar e de saúde, e fortalece a conexão com o profissional.

O MVP Beta será 100% gratuito para validação com nutricionistas reais e coleta de feedbacks antes do lançamento comercial.

![Dashboard do Nutricionista](https://afyoidxrshkmplxhcyeh.supabase.co/storage/v1/object/public/IDV/HipoZero%203%20-%20Controle%20Nutricional%20Inteligente_page-0001.jpg)

## 🎯 A Missão

O nome "HipoZero" é uma fusão de "Hipo" (de hipoglicemia) e "Zero". A ideia central é "zerar a hipoglicemia" e, por extensão, combater condições crônicas como a diabetes, que estão fortemente ligadas à alimentação.

A missão da plataforma é dar ao nutricionista as ferramentas para guiar o paciente rumo a um estado de saúde equilibrado.

## ✨ Funcionalidades Principais

A plataforma oferece um conjunto robusto de ferramentas para ambos os tipos de usuários, com comunicação em tempo real.

### Para o Nutricionista (Gestão Clínica)

* **Gestão de Pacientes:** Cadastro, lista de pacientes com busca, sistema de convite por e-mail e um "Hub do Paciente" centralizado que funciona como prontuário digital.
* **Anamnese Personalizada:** Ferramenta para o nutricionista criar suas próprias fichas de anamnese.
* **Avaliação Antropométrica:** Registro de medidas (peso, altura, circunferências) e acompanhamento da evolução do paciente.
* **Prescrição de Dietas:** Criação de planos alimentares detalhados (calorias, macros, refeições).
* **Cálculos Nutricionais:** Ferramentas para Controle de Gasto Energético (TMB, GET, protocolos, fator injúria).
* **Análise de Diário Alimentar:** Visualização do "Recordatório Alimentar" registrado pelo paciente, incluindo histórico de edições.
* **Banco de Alimentos:** Cadastro de alimentos personalizado e +3.000 dados prontos das tabelas TACO, TBCA, IBGE, USDA e Tucunduva.
* **Agenda e Consultas:** Gerenciamento de consultas (CRUD completo).
* **Módulo Financeiro:** Gestão de receitas e despesas por paciente.
* **Gamificação:** Criação e gerenciamento de "Conquistas" personalizadas para os pacientes.
* **Chat em Tempo Real:** Canal de comunicação direto com o paciente (suporta texto, áudio, vídeo, imagens e PDFs).

### Para o Paciente (Acompanhamento)

* **Dashboard Resumo:** Visão geral do progresso diário e resumo do consumo.
* **Diário Alimentar:** Registro prático de refeições (com busca de alimentos) e cálculo automático de macros e calorias.
* **Meu Plano:** Visualização fácil da dieta prescrita pelo nutricionista.
* **Registros de Saúde:** Módulos para registrar a evolução do peso e da glicemia (para pacientes diabéticos).
* **Gamificação:** Desbloqueio automático de conquistas (achievements) para manter a motivação e a consistência.
* **Chat com Nutricionista:** Acesso direto ao profissional para tirar dúvidas.
* **Histórico e Gráficos:** Visualização do histórico de registros por dia/semana/mês e gráficos de consumo (via Recharts).

## 🛠️ Stack de Tecnologia

Este projeto é construído com uma stack moderna focada em reatividade, produtividade e escalabilidade, baseada em React, Vite e Supabase.

### Backend & Banco de Dados (Supabase)

* **Banco de Dados:** PostgreSQL. O schema inclui 17 tabelas, Triggers, Funções (PL/pgSQL) e Índices de performance.
* **Autenticação:** Gerenciamento de usuários completo (Login, Registro, Recuperação de Senha).
* **Autorização:** Controle de acesso por tipo de usuário (`nutritionist`/`patient`) com RLS (Row Level Security) implementado.
* **Realtime:** Subscrições em tempo real para chat e notificações.
* **Storage:** Para upload de arquivos como avatares e mídias do chat.
* **Cliente:** `@supabase/supabase-js`.

### Frontend

* **Core:** React e Vite.
* **Roteamento:** `react-router-dom`.
* **Gerenciamento de Estado:** Zustand.
* **Gráficos:** Recharts.
* **Ícones:** `lucide-react`.
* **Utilitários de Data:** `date-fns` e `react-day-picker`.
* **Geração de PDF:** `jspdf` e `html2canvas`, usados para exportar relatórios.

### Estilização & UI

* **Estilização:** Tailwind CSS (com `postcss` e `autoprefixer`).
* **Design System:** shadcn/ui.
* **Componentes Headless:** Radix UI (ex: `@radix-ui/react-dialog`, `@radix-ui/react-select`, etc.).
* **Utilitários CSS:** `clsx`, `tailwind-merge` e `class-variance-authority`.
* **Animações:** `tailwindcss-animate` e `framer-motion`.

### Formulários

* **Gerenciamento:** `react-hook-form`.
* **Validação:** Zod (com `@hookform/resolvers`).

## 🚀 Como Executar Localmente

Para rodar o projeto HipoZero na sua máquina local, siga estes passos:

1.  **Clone o repositório:**
    ```bash
    git clone [https://github.com/seu-usuario/hipozero.git](https://github.com/seu-usuario/hipozero.git)
    cd hipozero
    ```

2.  **Instale as dependências:**
    O projeto usa `npm` (conforme `package.json`).
    ```bash
    npm install
    ```

3.  **Configure as Variáveis de Ambiente:**
    Crie um arquivo `.env` na raiz do projeto, copiando o arquivo `.env.example`. Você precisará das suas próprias chaves do Supabase.

    ```.env
    VITE_SUPABASE_URL="SUA_URL_AQUI"
    VITE_SUPABASE_ANON_KEY="SUA_CHAVE_ANON_AQUI"
    ```
    *(**Nota:** Substitua os valores corretos fornecidos pelo seu projeto Supabase.)*

4.  **Execute o servidor de desenvolvimento:**
    (Conforme script `dev` no `package.json`)
    ```bash
    npm run dev
    ```

5.  Abra `http://localhost:5173` (ou a porta indicada pelo Vite) no seu navegador.

## ⚠️ Copyright e Licença de Uso

Este é um projeto proprietário desenvolvido como parte de uma avaliação acadêmica, com planos de se tornar um produto comercial (SaaS).

**Copyright © 2025 HipoZero - Todos os Direitos Reservados.**

O código-fonte contido neste repositório está protegido e **NÃO PODE** ser usado para fins comerciais.

A visualização deste repositório é permitida estritamente para fins de avaliação acadêmica e portfólio. É expressamente **proibida** a cópia, redistribuição, modificação (criação de obras derivadas) ou utilização comercial de qualquer parte deste software sem a permissão explícita e por escrito do autor.

Este projeto é licenciado sob a **Creative Commons Attribution-NonCommercial-NoDerivs 4.0 International (CC BY-NC-ND 4.0)**.

Para ver os termos completos da licença, consulte o arquivo [LICENSE](LICENSE) neste repositório ou visite [http://creativecommons.org/licenses/by-nc-nd/4.0/](http://creativecommons.org/licenses/by-nc-nd/4.0/).
