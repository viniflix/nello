/**
 * Definição dos campos do formulário padrão de anamnese.
 * Usado para importar o formulário padrão como base de formulários personalizados.
 *
 * Cada campo: { field_label, field_type, category, is_required, options? }
 * field_type: texto_curto | texto_longo | selecao_unica | selecao_multipla
 */
export const STANDARD_ANAMNESIS_FIELDS = [
    // Identificação
    { field_label: 'Data de Nascimento', field_type: 'texto_curto', category: 'identificacao', is_required: false },
    {
        field_label: 'Gênero',
        field_type: 'selecao_unica',
        category: 'identificacao',
        is_required: false,
        options: ['Feminino', 'Masculino', 'Outro', 'Prefiro não informar']
    },
    {
        field_label: 'Etnia / Raça',
        field_type: 'selecao_unica',
        category: 'identificacao',
        is_required: false,
        options: ['Branca', 'Preta', 'Parda', 'Amarela (Asiática)', 'Indígena', 'Prefiro não informar']
    },
    { field_label: 'Idade', field_type: 'texto_curto', category: 'identificacao', is_required: false },
    { field_label: 'Profissão', field_type: 'texto_curto', category: 'identificacao', is_required: false, condition: { field: 'isAdult', value: true } },
    {
        field_label: 'Estado Civil',
        field_type: 'selecao_unica',
        category: 'identificacao',
        is_required: false,
        options: ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)'],
        condition: { field: 'isAdult', value: true }
    },
    // Histórico Clínico
    {
        field_label: 'Possui alguma doença diagnosticada?',
        field_type: 'selecao_unica',
        category: 'historico_clinico',
        is_required: true,
        options: ['Sim', 'Não']
    },
    {
        field_label: 'Descreva as doenças (nome, quando diagnosticado, tratamento atual)',
        field_type: 'texto_longo',
        category: 'historico_clinico',
        is_required: false
    },
    {
        field_label: 'Toma algum medicamento atualmente?',
        field_type: 'selecao_unica',
        category: 'historico_clinico',
        is_required: true,
        options: ['Sim', 'Não']
    },
    {
        field_label: 'Liste os medicamentos em uso',
        field_type: 'texto_longo',
        category: 'historico_clinico',
        is_required: false
    },
    {
        field_label: 'Possui alergia ou intolerância alimentar?',
        field_type: 'selecao_unica',
        category: 'historico_clinico',
        is_required: true,
        options: ['Sim', 'Não']
    },
    {
        field_label: 'Liste as alergias ou intolerâncias',
        field_type: 'texto_longo',
        category: 'historico_clinico',
        is_required: false
    },
    {
        field_label: 'Histórico de cirurgias',
        field_type: 'texto_longo',
        category: 'historico_clinico',
        is_required: false
    },
    {
        field_label: 'Outras condições de saúde',
        field_type: 'texto_longo',
        category: 'historico_clinico',
        is_required: false
    },
    // Histórico Familiar
    {
        field_label: 'Diabetes na família?',
        field_type: 'selecao_unica',
        category: 'historico_familiar',
        is_required: false,
        options: ['Sim', 'Não']
    },
    {
        field_label: 'Hipertensão na família?',
        field_type: 'selecao_unica',
        category: 'historico_familiar',
        is_required: false,
        options: ['Sim', 'Não']
    },
    {
        field_label: 'Obesidade na família?',
        field_type: 'selecao_unica',
        category: 'historico_familiar',
        is_required: false,
        options: ['Sim', 'Não']
    },
    {
        field_label: 'Câncer na família?',
        field_type: 'selecao_unica',
        category: 'historico_familiar',
        is_required: false,
        options: ['Sim', 'Não']
    },
    {
        field_label: 'Doenças cardiovasculares na família?',
        field_type: 'selecao_unica',
        category: 'historico_familiar',
        is_required: false,
        options: ['Sim', 'Não']
    },
    {
        field_label: 'Outras doenças na família',
        field_type: 'texto_longo',
        category: 'historico_familiar',
        is_required: false
    },
    // Hábitos de Vida
    {
        field_label: 'Pratica exercício físico?',
        field_type: 'selecao_unica',
        category: 'habitos_vida',
        is_required: false,
        options: ['Sim', 'Não'],
        condition: { field: 'isAdult', value: true }
    },
    {
        field_label: 'Fuma?',
        field_type: 'selecao_unica',
        category: 'habitos_vida',
        is_required: false,
        options: ['Sim', 'Não'],
        condition: { field: 'isAdult', value: true }
    },
    {
        field_label: 'Consome bebidas alcoólicas?',
        field_type: 'selecao_unica',
        category: 'habitos_vida',
        is_required: false,
        options: ['Sim', 'Não'],
        condition: { field: 'isAdult', value: true }
    },
    { field_label: 'Horas de sono por noite', field_type: 'texto_curto', category: 'habitos_vida', is_required: false },
    {
        field_label: 'Qualidade do sono',
        field_type: 'selecao_unica',
        category: 'habitos_vida',
        is_required: false,
        options: ['Ótima', 'Boa', 'Regular', 'Ruim']
    },
    {
        field_label: 'Nível de estresse',
        field_type: 'selecao_unica',
        category: 'habitos_vida',
        is_required: false,
        options: ['Baixo', 'Moderado', 'Alto', 'Muito Alto']
    },
    {
        field_label: 'Consumo de água (litros/dia)',
        field_type: 'texto_curto',
        category: 'habitos_vida',
        is_required: false
    },
    // Objetivos
    {
        field_label: 'Objetivo principal com o acompanhamento nutricional',
        field_type: 'texto_longo',
        category: 'objetivos',
        is_required: true
    },
    {
        field_label: 'Tentativas anteriores de mudança',
        field_type: 'texto_longo',
        category: 'objetivos',
        is_required: false
    },
    // Hábitos Alimentares
    {
        field_label: 'Quantas refeições faz por dia?',
        field_type: 'texto_curto',
        category: 'habitos_alimentares',
        is_required: false
    },
    {
        field_label: 'Onde costuma fazer as refeições?',
        field_type: 'texto_longo',
        category: 'habitos_alimentares',
        is_required: false
    },
    {
        field_label: 'Quem prepara a comida em casa?',
        field_type: 'texto_curto',
        category: 'habitos_alimentares',
        is_required: false
    },
    {
        field_label: 'Preferências alimentares',
        field_type: 'texto_longo',
        category: 'habitos_alimentares',
        is_required: false
    },
    {
        field_label: 'Alimentos que não gosta',
        field_type: 'texto_longo',
        category: 'habitos_alimentares',
        is_required: false
    },
    {
        field_label: 'Uso de suplementos',
        field_type: 'texto_longo',
        category: 'habitos_alimentares',
        is_required: false
    },

    // ─── Recordatório Alimentar 24h ───────────────────────────────────────────
    {
        field_label: 'Café da manhã (horário, alimentos e quantidades)',
        field_type: 'texto_longo',
        category: 'recordatorio_alimentar',
        is_required: false
    },
    {
        field_label: 'Lanche da manhã (horário, alimentos e quantidades)',
        field_type: 'texto_longo',
        category: 'recordatorio_alimentar',
        is_required: false
    },
    {
        field_label: 'Almoço (horário, alimentos e quantidades)',
        field_type: 'texto_longo',
        category: 'recordatorio_alimentar',
        is_required: false
    },
    {
        field_label: 'Lanche da tarde (horário, alimentos e quantidades)',
        field_type: 'texto_longo',
        category: 'recordatorio_alimentar',
        is_required: false
    },
    {
        field_label: 'Jantar (horário, alimentos e quantidades)',
        field_type: 'texto_longo',
        category: 'recordatorio_alimentar',
        is_required: false
    },
    {
        field_label: 'Ceia (horário, alimentos e quantidades)',
        field_type: 'texto_longo',
        category: 'recordatorio_alimentar',
        is_required: false
    },
    {
        field_label: 'O dia descrito é típico? Se não, o que foi diferente?',
        field_type: 'texto_longo',
        category: 'recordatorio_alimentar',
        is_required: false
    },

    // ─── Alimentação Usual ────────────────────────────────────────────────────
    {
        field_label: 'Como é a alimentação habitual no café da manhã?',
        field_type: 'texto_longo',
        category: 'alimentacao_usual',
        is_required: false
    },
    {
        field_label: 'Como é a alimentação habitual no almoço?',
        field_type: 'texto_longo',
        category: 'alimentacao_usual',
        is_required: false
    },
    {
        field_label: 'Como é a alimentação habitual no jantar?',
        field_type: 'texto_longo',
        category: 'alimentacao_usual',
        is_required: false
    },
    {
        field_label: 'Consome frutas? Com qual frequência?',
        field_type: 'texto_curto',
        category: 'alimentacao_usual',
        is_required: false
    },
    {
        field_label: 'Consome verduras e legumes? Com qual frequência?',
        field_type: 'texto_curto',
        category: 'alimentacao_usual',
        is_required: false
    },
    {
        field_label: 'Frequência de consumo de alimentos ultraprocessados',
        field_type: 'selecao_unica',
        category: 'alimentacao_usual',
        is_required: false,
        options: ['Nunca', 'Raramente', '1–2x/semana', '3–4x/semana', 'Diariamente']
    },
    {
        field_label: 'Frequência de consumo de fast food / delivery',
        field_type: 'selecao_unica',
        category: 'alimentacao_usual',
        is_required: false,
        options: ['Nunca', 'Raramente', '1–2x/semana', '3–4x/semana', 'Diariamente']
    },
    {
        field_label: 'Observações sobre padrão alimentar usual',
        field_type: 'texto_longo',
        category: 'alimentacao_usual',
        is_required: false
    },

    // ─── Curvas para Gestação (condicional: sexo feminino, confirmada gravidez) ─
    {
        field_label: 'Está grávida atualmente?',
        field_type: 'selecao_unica',
        category: 'curvas_gestacao',
        is_required: false,
        options: ['Sim', 'Não', 'Suspeita'],
        condition: { field: 'sexo', value: 'feminino' }
    },
    {
        field_label: 'Semanas de gestação',
        field_type: 'texto_curto',
        category: 'curvas_gestacao',
        is_required: false,
        condition: { field: 'gravidez', value: 'sim' }
    },
    {
        field_label: 'Número de gestações anteriores',
        field_type: 'texto_curto',
        category: 'curvas_gestacao',
        is_required: false,
        condition: { field: 'sexo', value: 'feminino' }
    },
    {
        field_label: 'Ganho de peso na gestação atual (kg)',
        field_type: 'texto_curto',
        category: 'curvas_gestacao',
        is_required: false,
        condition: { field: 'gravidez', value: 'sim' }
    },
    {
        field_label: 'Pré-natal sendo realizado? Onde?',
        field_type: 'texto_curto',
        category: 'curvas_gestacao',
        is_required: false,
        condition: { field: 'gravidez', value: 'sim' }
    },
    {
        field_label: 'Náuseas, vômitos ou aversões alimentares durante a gestação?',
        field_type: 'texto_longo',
        category: 'curvas_gestacao',
        is_required: false,
        condition: { field: 'gravidez', value: 'sim' }
    },

    // ─── Curvas para Crianças (condicional: idade ≤ 10 anos) ─────────────────
    {
        field_label: 'Nome do responsável',
        field_type: 'texto_curto',
        category: 'curvas_crianca',
        is_required: false,
        condition: { field: 'faixa_etaria', value: 'crianca' }
    },
    {
        field_label: 'Peso ao nascer (kg)',
        field_type: 'texto_curto',
        category: 'curvas_crianca',
        is_required: false,
        condition: { field: 'faixa_etaria', value: 'crianca' }
    },
    {
        field_label: 'Aleitamento materno? Por quanto tempo?',
        field_type: 'texto_curto',
        category: 'curvas_crianca',
        is_required: false,
        condition: { field: 'faixa_etaria', value: 'crianca' }
    },
    {
        field_label: 'Quando iniciou alimentação complementar?',
        field_type: 'texto_curto',
        category: 'curvas_crianca',
        is_required: false,
        condition: { field: 'faixa_etaria', value: 'crianca' }
    },
    {
        field_label: 'A criança tem dificuldade para aceitar novos alimentos?',
        field_type: 'selecao_unica',
        category: 'curvas_crianca',
        is_required: false,
        options: ['Sim', 'Não', 'Às vezes'],
        condition: { field: 'faixa_etaria', value: 'crianca' }
    },
    {
        field_label: 'Alimentos recusados pela criança',
        field_type: 'texto_longo',
        category: 'curvas_crianca',
        is_required: false,
        condition: { field: 'faixa_etaria', value: 'crianca' }
    },
    {
        field_label: 'Frequência de refeições da criança por dia',
        field_type: 'texto_curto',
        category: 'curvas_crianca',
        is_required: false,
        condition: { field: 'faixa_etaria', value: 'crianca' }
    },
    {
        field_label: 'Observações clínicas pediátricas relevantes',
        field_type: 'texto_longo',
        category: 'curvas_crianca',
        is_required: false,
        condition: { field: 'faixa_etaria', value: 'crianca' }
    }
];

