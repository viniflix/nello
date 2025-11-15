/**
 * ============================================================
 * ANAMNESIS VALIDATION SCHEMA - Zod
 * ============================================================
 * Schema de validação completo para formulário de anamnese
 * ETAPA 1: Validação + Campos Condicionais
 */

import { z } from 'zod';

// ============================================================
// SCHEMAS AUXILIARES - LISTAS DINÂMICAS
// ============================================================

/**
 * Schema para Doenças
 */
const diseaseSchema = z.object({
  nome: z.string().min(1, 'Nome da doença é obrigatório'),
  diagnostico_quando: z.string().min(1, 'Informe quando foi diagnosticado'),
  tratamento_atual: z.string().min(1, 'Informe o tratamento atual')
});

/**
 * Schema para Medicamentos
 */
const medicationSchema = z.object({
  nome: z.string().min(1, 'Nome do medicamento é obrigatório'),
  dosagem: z.string().min(1, 'Dosagem é obrigatória'),
  frequencia: z.string().min(1, 'Frequência é obrigatória'),
  motivo: z.string().min(1, 'Motivo é obrigatório')
});

/**
 * Schema para Alergias/Intolerâncias
 */
const allergySchema = z.object({
  tipo: z.enum(['Alergia', 'Intolerância'], {
    required_error: 'Selecione o tipo'
  }),
  alimento: z.string().min(1, 'Informe o alimento'),
  severidade: z.enum(['leve', 'moderada', 'grave'], {
    required_error: 'Selecione a severidade'
  }),
  sintomas: z.string().min(1, 'Descreva os sintomas')
});

// ============================================================
// SCHEMAS AUXILIARES - CAMPOS CONDICIONAIS
// ============================================================

/**
 * Schema para detalhes de Fumo (condicional)
 */
const smokingDetailsSchema = z.object({
  ha_quanto_tempo: z.string().min(1, 'Informe há quanto tempo fuma'),
  quantidade_dia: z.string().min(1, 'Informe a quantidade por dia'),
  tentou_parar: z.enum(['sim', 'nao'], {
    required_error: 'Informe se já tentou parar'
  })
});

/**
 * Schema para detalhes de Bebida (condicional)
 */
const drinkingDetailsSchema = z.object({
  frequencia: z.enum(['diaria', 'semanal', 'fins_semana', 'ocasional'], {
    required_error: 'Selecione a frequência'
  }),
  tipo_bebida: z.array(z.string()).min(1, 'Selecione pelo menos um tipo de bebida'),
  quantidade_dose: z.string().min(1, 'Informe a quantidade por dose')
});

/**
 * Schema para detalhes de Exercício (condicional)
 */
const exerciseDetailsSchema = z.object({
  modalidade: z.array(z.string()).min(1, 'Selecione pelo menos uma modalidade'),
  frequencia_semanal: z.string().min(1, 'Informe a frequência semanal'),
  duracao_minutos: z.string().min(1, 'Informe a duração em minutos')
});

// ============================================================
// SCHEMAS DAS SEÇÕES
// ============================================================

/**
 * Seção: Identificação (campos opcionais)
 */
const identificationSchema = z.object({
  data_nascimento: z.string().optional(),
  idade: z.string().optional(),
  profissao: z.string().optional(),
  estado_civil: z.string().optional()
});

/**
 * Seção: Histórico Clínico
 */
const clinicalHistorySchema = z.object({
  tem_doenca: z.enum(['sim', 'nao', ''], {
    required_error: 'Selecione se tem alguma doença'
  }).refine(val => val !== '', {
    message: 'Este campo é obrigatório'
  }),
  doencas: z.array(diseaseSchema),
  toma_medicamento: z.enum(['sim', 'nao', ''], {
    required_error: 'Selecione se toma medicamento'
  }).refine(val => val !== '', {
    message: 'Este campo é obrigatório'
  }),
  medicamentos: z.array(medicationSchema),
  tem_alergia: z.enum(['sim', 'nao', ''], {
    required_error: 'Selecione se tem alergia/intolerância'
  }).refine(val => val !== '', {
    message: 'Este campo é obrigatório'
  }),
  alergias: z.array(allergySchema),
  historico_cirurgias: z.string().optional(),
  outras_condicoes: z.string().optional()
}).refine(
  (data) => {
    // Se tem doença = sim, deve ter pelo menos 1 doença cadastrada
    if (data.tem_doenca === 'sim') {
      return data.doencas.length > 0;
    }
    return true;
  },
  {
    message: 'Adicione pelo menos uma doença',
    path: ['doencas']
  }
).refine(
  (data) => {
    // Se toma medicamento = sim, deve ter pelo menos 1 medicamento cadastrado
    if (data.toma_medicamento === 'sim') {
      return data.medicamentos.length > 0;
    }
    return true;
  },
  {
    message: 'Adicione pelo menos um medicamento',
    path: ['medicamentos']
  }
).refine(
  (data) => {
    // Se tem alergia = sim, deve ter pelo menos 1 alergia cadastrada
    if (data.tem_alergia === 'sim') {
      return data.alergias.length > 0;
    }
    return true;
  },
  {
    message: 'Adicione pelo menos uma alergia/intolerância',
    path: ['alergias']
  }
);

/**
 * Seção: Histórico Familiar (campos opcionais)
 */
const familyHistorySchema = z.object({
  diabetes: z.enum(['sim', 'nao', '']).optional(),
  hipertensao: z.enum(['sim', 'nao', '']).optional(),
  obesidade: z.enum(['sim', 'nao', '']).optional(),
  cancer: z.enum(['sim', 'nao', '']).optional(),
  doencas_cardiovasculares: z.enum(['sim', 'nao', '']).optional(),
  outras_doencas_familiares: z.string().optional()
});

/**
 * Seção: Hábitos de Vida
 * CAMPOS OBRIGATÓRIOS: pratica_exercicio, fuma, bebe
 * CAMPOS CONDICIONAIS: detalhes de cada hábito
 */
const lifestyleSchema = z.object({
  pratica_exercicio: z.enum(['sim', 'nao', ''], {
    required_error: 'Selecione se pratica exercício físico'
  }).refine(val => val !== '', {
    message: 'Este campo é obrigatório'
  }),
  exercicio_detalhes: exerciseDetailsSchema.optional(),
  fuma: z.enum(['sim', 'nao', ''], {
    required_error: 'Selecione se fuma'
  }).refine(val => val !== '', {
    message: 'Este campo é obrigatório'
  }),
  fuma_detalhes: smokingDetailsSchema.optional(),
  bebe: z.enum(['sim', 'nao', ''], {
    required_error: 'Selecione se consome bebida alcoólica'
  }).refine(val => val !== '', {
    message: 'Este campo é obrigatório'
  }),
  bebida_detalhes: drinkingDetailsSchema.optional(),
  horas_sono: z.string().optional(),
  qualidade_sono: z.enum(['boa', 'regular', 'ruim', '']).optional(),
  nivel_estresse: z.enum(['baixo', 'moderado', 'alto', '']).optional(),
  consumo_agua_litros: z.string().optional()
}).refine(
  (data) => {
    // Se pratica exercício = sim, detalhes são obrigatórios
    if (data.pratica_exercicio === 'sim') {
      return data.exercicio_detalhes !== undefined;
    }
    return true;
  },
  {
    message: 'Preencha os detalhes do exercício',
    path: ['exercicio_detalhes']
  }
).refine(
  (data) => {
    // Se fuma = sim, detalhes são obrigatórios
    if (data.fuma === 'sim') {
      return data.fuma_detalhes !== undefined;
    }
    return true;
  },
  {
    message: 'Preencha os detalhes do tabagismo',
    path: ['fuma_detalhes']
  }
).refine(
  (data) => {
    // Se bebe = sim, detalhes são obrigatórios
    if (data.bebe === 'sim') {
      return data.bebida_detalhes !== undefined;
    }
    return true;
  },
  {
    message: 'Preencha os detalhes do consumo de bebida alcoólica',
    path: ['bebida_detalhes']
  }
);

/**
 * Seção: Objetivos
 * CAMPO OBRIGATÓRIO: objetivo_principal
 */
const objectivesSchema = z.object({
  objetivo_principal: z.string()
    .min(10, 'O objetivo deve ter pelo menos 10 caracteres')
    .max(500, 'O objetivo não pode ter mais de 500 caracteres'),
  peso_atual: z.string().optional(),
  peso_desejado: z.string().optional(),
  prazo_objetivo: z.string().optional(),
  tentativas_anteriores: z.string().optional()
});

/**
 * Seção: Hábitos Alimentares (campos opcionais)
 */
const dietaryHabitsSchema = z.object({
  refeicoes_por_dia: z.string().optional(),
  local_refeicoes: z.array(z.string()).optional(),
  quem_prepara_comida: z.string().optional(),
  preferencias_alimentares: z.array(z.string()).optional(),
  alimentos_nao_gosta: z.string().optional(),
  suplementos: z.string().optional()
});

// ============================================================
// SCHEMA PRINCIPAL DO FORMULÁRIO
// ============================================================

/**
 * Schema completo de validação do formulário de anamnese
 * Usado pelo React Hook Form com zodResolver
 */
export const anamnesisFormSchema = z.object({
  // Metadados
  date: z.string().min(1, 'Data é obrigatória'),
  notes: z.string().optional(),

  // Seções
  identificacao: identificationSchema,
  historico_clinico: clinicalHistorySchema,
  historico_familiar: familyHistorySchema,
  habitos_vida: lifestyleSchema,
  objetivos: objectivesSchema,
  habitos_alimentares: dietaryHabitsSchema
});

/**
 * Tipo inferido do schema Zod
 * Usado para tipagem do formulário
 */
export type AnamnesisFormSchema = z.infer<typeof anamnesisFormSchema>;
