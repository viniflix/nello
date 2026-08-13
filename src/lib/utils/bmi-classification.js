/**
 * Classificação assistida de IMC com referências explícitas.
 *
 * O resultado é um apoio ao nutricionista, não diagnóstico. Crianças e
 * adolescentes exigem idade em meses, sexo e tabelas LMS OMS completas; por
 * isso o Nello não infere percentis a partir de cortes anuais aproximados.
 */

const ADULT = { underweight: 18.5, normal_high: 25, overweight_high: 30 };
const ELDERLY = { underweight: 22, normal_high: 27, overweight_high: null };

const result = (label, color, variant, method, detail, normalRange, source) => ({
  label, color, variant, method, detail, normalRange, source,
  requiresProfessionalValidation: true,
});

function classifyAdult(bmi, detail = null) {
  const source = 'Ministério da Saúde/OMS — IMC para adultos';
  if (bmi < 18.5) return result('Abaixo do peso', 'text-blue-600', 'secondary', 'adulto_ms_oms', detail, { low: 18.5, high: 25 }, source);
  if (bmi < 25) return result('Eutrofia', 'text-green-600', 'success', 'adulto_ms_oms', detail, { low: 18.5, high: 25 }, source);
  if (bmi < 30) return result('Sobrepeso', 'text-yellow-600', 'warning', 'adulto_ms_oms', detail, { low: 18.5, high: 25 }, source);
  if (bmi < 35) return result('Obesidade grau I', 'text-orange-600', 'destructive', 'adulto_ms_oms', detail, { low: 18.5, high: 25 }, source);
  if (bmi < 40) return result('Obesidade grau II', 'text-red-600', 'destructive', 'adulto_ms_oms', detail, { low: 18.5, high: 25 }, source);
  return result('Obesidade grau III', 'text-red-800', 'destructive', 'adulto_ms_oms', detail, { low: 18.5, high: 25 }, source);
}

function classifyElderly(bmi) {
  const detail = 'Referência brasileira para pessoas com 60 anos ou mais; avaliar também composição corporal, funcionalidade e contexto clínico.';
  const source = 'Ministério da Saúde/SISVAN — pessoa idosa';
  if (bmi <= 22) return result('Baixo peso', 'text-blue-600', 'secondary', 'idoso_sisvan', detail, { low: 22, high: 27 }, source);
  if (bmi < 27) return result('Eutrofia', 'text-green-600', 'success', 'idoso_sisvan', detail, { low: 22, high: 27 }, source);
  return result('Sobrepeso', 'text-yellow-700', 'warning', 'idoso_sisvan', detail, { low: 22, high: 27 }, source);
}

export function classifyBMI({ bmi, age = null, ethnicity = null }) {
  const value = Number(bmi);
  if (!Number.isFinite(value) || value <= 0) {
    return result('—', 'text-muted-foreground', 'outline', 'sem_dados', null, null, null);
  }
  const ageNum = age === null || age === '' ? null : Number(age);
  if (Number.isFinite(ageNum) && ageNum < 20) {
    return result(
      'Avaliação pediátrica necessária', 'text-amber-700', 'outline', 'pediatrico_pendente_curva_oms',
      'Use IMC-por-idade/sexo e escore-z com as tabelas OMS completas. O Nello não usa aproximações anuais.',
      null, 'OMS — Child Growth Standards / Growth Reference 5–19 years',
    );
  }
  if (Number.isFinite(ageNum) && ageNum >= 60) return classifyElderly(value);
  const ethnicityNote = ['amarela', 'asian', 'asiatico', 'asiática'].includes(String(ethnicity || '').toLowerCase())
    ? 'O IMC pode ter limitações neste perfil; associe outra medida antropométrica e julgamento clínico.' : null;
  const detail = ageNum === null ? 'Idade não informada; referência adulta exibida apenas como apoio.' : ethnicityNote;
  return classifyAdult(value, detail);
}

export function getBMICuts({ age = null } = {}) {
  const ageNum = age === null || age === '' ? null : Number(age);
  if (Number.isFinite(ageNum) && ageNum < 20) return null;
  if (Number.isFinite(ageNum) && ageNum >= 60) return ELDERLY;
  return ADULT;
}

export function calculateBMI(weight, height) {
  const weightNum = Number(weight);
  const heightNum = Number(height);
  if (!Number.isFinite(weightNum) || !Number.isFinite(heightNum)) return null;
  // Enforce realistic bounds to prevent Infinity or impossible values
  if (weightNum <= 0 || weightNum > 600 || heightNum <= 0 || heightNum > 300) return null;
  return weightNum / Math.pow(heightNum / 100, 2);
}
