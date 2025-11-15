/**
 * ============================================================
 * ANAMNESIS TYPES - TypeScript Definitions
 * ============================================================
 * Tipos para o formulário de anamnese melhorado (ETAPA 1)
 */

// ============================================================
// TIPOS DE DOENÇAS
// ============================================================
export interface Disease {
  nome: string;
  diagnostico_quando: string;
  tratamento_atual: string;
}

// ============================================================
// TIPOS DE MEDICAMENTOS
// ============================================================
export interface Medication {
  nome: string;
  dosagem: string;
  frequencia: string;
  motivo: string;
}

// ============================================================
// TIPOS DE ALERGIAS/INTOLERÂNCIAS
// ============================================================
export type AllergyType = 'Alergia' | 'Intolerância';
export type AllergySeverity = 'leve' | 'moderada' | 'grave';

export interface Allergy {
  tipo: AllergyType;
  alimento: string;
  severidade: AllergySeverity;
  sintomas: string;
}

// ============================================================
// CAMPOS CONDICIONAIS - FUMO
// ============================================================
export interface SmokingDetails {
  ha_quanto_tempo: string;
  quantidade_dia: string;
  tentou_parar: 'sim' | 'nao';
}

// ============================================================
// CAMPOS CONDICIONAIS - BEBIDA
// ============================================================
export type DrinkFrequency = 'diaria' | 'semanal' | 'fins_semana' | 'ocasional';

export interface DrinkingDetails {
  frequencia: DrinkFrequency;
  tipo_bebida: string[];
  quantidade_dose: string;
}

// ============================================================
// CAMPOS CONDICIONAIS - EXERCÍCIO
// ============================================================
export interface ExerciseDetails {
  modalidade: string[];
  frequencia_semanal: string;
  duracao_minutos: string;
}

// ============================================================
// SEÇÃO: IDENTIFICAÇÃO
// ============================================================
export interface IdentificationSection {
  data_nascimento?: string;
  idade?: string;
  profissao?: string;
  estado_civil?: string;
}

// ============================================================
// SEÇÃO: HISTÓRICO CLÍNICO
// ============================================================
export interface ClinicalHistorySection {
  tem_doenca: 'sim' | 'nao' | '';
  doencas: Disease[];
  toma_medicamento: 'sim' | 'nao' | '';
  medicamentos: Medication[];
  tem_alergia: 'sim' | 'nao' | '';
  alergias: Allergy[];
  historico_cirurgias?: string;
  outras_condicoes?: string;
}

// ============================================================
// SEÇÃO: HISTÓRICO FAMILIAR
// ============================================================
export interface FamilyHistorySection {
  diabetes?: 'sim' | 'nao' | '';
  hipertensao?: 'sim' | 'nao' | '';
  obesidade?: 'sim' | 'nao' | '';
  cancer?: 'sim' | 'nao' | '';
  doencas_cardiovasculares?: 'sim' | 'nao' | '';
  outras_doencas_familiares?: string;
}

// ============================================================
// SEÇÃO: HÁBITOS DE VIDA
// ============================================================
export interface LifestyleSection {
  pratica_exercicio: 'sim' | 'nao' | '';
  exercicio_detalhes?: ExerciseDetails;
  fuma: 'sim' | 'nao' | '';
  fuma_detalhes?: SmokingDetails;
  bebe: 'sim' | 'nao' | '';
  bebida_detalhes?: DrinkingDetails;
  horas_sono?: string;
  qualidade_sono?: 'boa' | 'regular' | 'ruim' | '';
  nivel_estresse?: 'baixo' | 'moderado' | 'alto' | '';
  consumo_agua_litros?: string;
}

// ============================================================
// SEÇÃO: OBJETIVOS
// ============================================================
export interface ObjectivesSection {
  objetivo_principal: string;
  peso_atual?: string;
  peso_desejado?: string;
  prazo_objetivo?: string;
  tentativas_anteriores?: string;
}

// ============================================================
// SEÇÃO: HÁBITOS ALIMENTARES
// ============================================================
export interface DietaryHabitsSection {
  refeicoes_por_dia?: string;
  local_refeicoes?: string[];
  quem_prepara_comida?: string;
  preferencias_alimentares?: string[];
  alimentos_nao_gosta?: string;
  suplementos?: string;
}

// ============================================================
// FORMULÁRIO COMPLETO DE ANAMNESE
// ============================================================
export interface AnamnesisFormData {
  // Metadados
  date: string;
  notes?: string;

  // Seções do formulário
  identificacao: IdentificationSection;
  historico_clinico: ClinicalHistorySection;
  historico_familiar: FamilyHistorySection;
  habitos_vida: LifestyleSection;
  objetivos: ObjectivesSection;
  habitos_alimentares: DietaryHabitsSection;
}

// ============================================================
// TIPO PARA VALIDAÇÃO DE ERROS
// ============================================================
export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}
