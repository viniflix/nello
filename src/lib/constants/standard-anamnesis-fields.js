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
    { field_label: 'Idade', field_type: 'texto_curto', category: 'identificacao', is_required: false },
    { field_label: 'Profissão', field_type: 'texto_curto', category: 'identificacao', is_required: false },
    {
        field_label: 'Estado Civil',
        field_type: 'selecao_unica',
        category: 'identificacao',
        is_required: false,
        options: ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)']
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
        options: ['Sim', 'Não']
    },
    {
        field_label: 'Fuma?',
        field_type: 'selecao_unica',
        category: 'habitos_vida',
        is_required: false,
        options: ['Sim', 'Não']
    },
    {
        field_label: 'Consome bebidas alcoólicas?',
        field_type: 'selecao_unica',
        category: 'habitos_vida',
        is_required: false,
        options: ['Sim', 'Não']
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
    { field_label: 'Peso atual (kg)', field_type: 'texto_curto', category: 'objetivos', is_required: false },
    { field_label: 'Peso desejado (kg)', field_type: 'texto_curto', category: 'objetivos', is_required: false },
    { field_label: 'Prazo para atingir o objetivo', field_type: 'texto_curto', category: 'objetivos', is_required: false },
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
    }
];
