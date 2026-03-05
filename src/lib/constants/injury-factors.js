/**
 * Fatores de injúria/estresse clínico para cálculo do gasto energético.
 * Cada condição multiplica o GET (valor típico na literatura/Dietbox).
 *
 * @typedef {{ id: string, label: string, value: number, description?: string }} InjuryFactor
 */

/** @type {InjuryFactor[]} */
export const INJURY_FACTORS = [
  { id: 'none', label: 'Nenhum', value: 1.0, description: 'Sem fator de estresse' },
  { id: 'surgery', label: 'Cirurgia', value: 1.2, description: 'Pós-cirúrgico' },
  { id: 'diabetes', label: 'Diabetes', value: 1.15 },
  { id: 'infection', label: 'Infecção', value: 1.2 },
  { id: 'cancer', label: 'Câncer', value: 1.3 },
  { id: 'aids', label: 'AIDS / HIV', value: 1.35 },
  { id: 'malnutrition', label: 'Desnutrição', value: 1.4 },
  { id: 'fasting', label: 'Jejum prolongado', value: 1.4 },
  { id: 'organ_failure', label: 'Falência de órgãos', value: 1.5 },
  { id: 'heart_failure', label: 'Insuficiência cardíaca', value: 1.35 },
  { id: 'sepsis', label: 'Sepse', value: 1.4 },
  { id: 'trauma', label: 'Trauma / Queimadura', value: 1.5 },
  { id: 'fever', label: 'Febre', value: 1.13 },
  { id: 'dialysis', label: 'Diálise', value: 1.2 },
  { id: 'copd', label: 'DPOC / Doença respiratória', value: 1.3 },
  { id: 'inflammatory', label: 'Doença inflamatória intestinal', value: 1.2 }
];

/**
 * Retorna o fator numérico pelo id.
 * @param {string} id
 * @returns {number}
 */
export function getInjuryFactorValue(id) {
  if (!id) return 1.0;
  const item = INJURY_FACTORS.find((f) => f.id === id);
  return item ? item.value : 1.0;
}
