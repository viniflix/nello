import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

const fetchLatestEnergyCalculation = async (patientId) => {
  return supabase
    .from('energy_expenditure_calculations')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
};

/**
 * Busca o último cálculo de gasto energético do paciente.
 * Retorna dados no schema novo (tmb_result, get_result, final_planned_kcal, etc.) quando existirem.
 *
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export const getLatestEnergyCalculation = async (patientId) => {
  try {
    const { data, error } = await fetchLatestEnergyCalculation(patientId);
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('Erro ao buscar cálculo de energia', error);
    return { data: null, error };
  }
};

/**
 * Busca o cálculo de energia com breakdown para tooltip
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export const getEnergyCalculationWithDetails = async (patientId) => {
  try {
    const { data, error } = await fetchLatestEnergyCalculation(patientId);
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError('Erro ao buscar cálculo de energia', error);
    return { data: null, error };
  }
};

/**
 * Dados para preencher o formulário de gasto energético (biometria).
 * @typedef {Object} InitialBiometryForEnergy
 * @property {number|null} height - Altura em cm
 * @property {number|null} weight - Peso em kg
 * @property {number|null} age - Idade em anos
 * @property {string|null} gender - 'M' ou 'F'
 * @property {number|null} body_fat_percentage - % gordura (opcional)
 * @property {number|null} lean_mass_kg - Massa magra em kg (opcional)
 */

/**
 * Extrai dados biométricos de um objeto content (anamnese) em qualquer nível.
 * @param {object} obj - Objeto (content ou seção)
 * @param {object} acc - Acumulador { weight, height, age, gender, body_fat_percentage, lean_mass_kg }
 */
function extractBiometryFromContent(obj, acc) {
  if (!obj || typeof obj !== 'object') return;
  const keys = ['weight', 'height', 'peso', 'altura', 'data_nascimento', 'birth_date', 'idade', 'age', 'sexo', 'gender', 'body_fat_percentage', 'gordura', 'lean_mass_kg', 'massa_magra'];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = String(k).toLowerCase();
    if (key === 'weight' || key === 'peso') {
      const n = Number(v);
      if (Number.isFinite(n) && acc.weight == null) acc.weight = n;
    }
    if (key === 'height' || key === 'altura') {
      const n = Number(v);
      if (Number.isFinite(n) && acc.height == null) acc.height = n;
    }
    if (key === 'idade' || key === 'age') {
      const n = typeof v === 'string' ? parseInt(v.replace(/\D/g, ''), 10) : Number(v);
      if (Number.isFinite(n) && acc.age == null) acc.age = n;
    }
    if (key === 'data_nascimento' || key === 'birth_date') {
      if (acc.birth_date == null) acc.birth_date = v;
    }
    if (key === 'sexo' || key === 'gender') {
      const g = String(v).toLowerCase();
      if (acc.gender == null) acc.gender = g === 'male' || g === 'masculino' || g === 'm' ? 'M' : g === 'female' || g === 'feminino' || g === 'f' ? 'F' : v;
    }
    if (key === 'body_fat_percentage' || key === 'gordura') {
      const n = Number(v);
      if (Number.isFinite(n) && acc.body_fat_percentage == null) acc.body_fat_percentage = n;
    }
    if (key === 'lean_mass_kg' || key === 'massa_magra') {
      const n = Number(v);
      if (Number.isFinite(n) && acc.lean_mass_kg == null) acc.lean_mass_kg = n;
    }
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) extractBiometryFromContent(v, acc);
  }
}

/**
 * Busca altura, peso, idade, sexo e % gordura para auto-preenchimento do formulário de energia.
 * Prioridade: antropometria (growth_records) > anamnese (content) > perfil (user_profiles).
 *
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: InitialBiometryForEnergy, error: object|null}>}
 */
export const getInitialBiometryForEnergy = async (patientId) => {
  try {
    const out = {
      height: null,
      weight: null,
      age: null,
      gender: null,
      body_fat_percentage: null,
      lean_mass_kg: null
    };
    const fromAnamnesis = { weight: null, height: null, age: null, birth_date: null, gender: null, body_fat_percentage: null, lean_mass_kg: null };

    const [profileRes, grRes, anamnesisRes] = await Promise.all([
      supabase.from('user_profiles').select('birth_date, gender, weight, height').eq('id', patientId).single(),
      supabase.from('growth_records').select('weight, height, results, record_date').eq('patient_id', patientId).order('record_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('anamnesis_records').select('content').eq('patient_id', patientId).order('date', { ascending: false }).limit(1).maybeSingle()
    ]);

    const profile = profileRes.data;
    if (profileRes.error) throw profileRes.error;

    if (profile?.birth_date) {
      const birth = new Date(profile.birth_date);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
      out.age = age;
    }
    if (profile?.gender) {
      const g = String(profile.gender).toLowerCase();
      out.gender = g === 'male' || g === 'masculino' || g === 'm' ? 'M' : g === 'female' || g === 'feminino' || g === 'f' ? 'F' : profile.gender;
    }
    if (profile?.weight != null) out.weight = Number(profile.weight);
    if (profile?.height != null) out.height = Number(profile.height);

    if (anamnesisRes.data?.content && typeof anamnesisRes.data.content === 'object') {
      extractBiometryFromContent(anamnesisRes.data.content, fromAnamnesis);
      if (fromAnamnesis.birth_date && out.age == null) {
        const birth = new Date(fromAnamnesis.birth_date);
        const today = new Date();
        if (!Number.isNaN(birth.getTime())) {
          let age = today.getFullYear() - birth.getFullYear();
          const monthDiff = today.getMonth() - birth.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
          out.age = age;
        }
      }
      if (fromAnamnesis.weight != null && out.weight == null) out.weight = fromAnamnesis.weight;
      if (fromAnamnesis.height != null && out.height == null) out.height = fromAnamnesis.height;
      if (fromAnamnesis.age != null && out.age == null) out.age = fromAnamnesis.age;
      if (fromAnamnesis.gender != null && out.gender == null) out.gender = fromAnamnesis.gender;
      if (fromAnamnesis.body_fat_percentage != null && out.body_fat_percentage == null) out.body_fat_percentage = fromAnamnesis.body_fat_percentage;
      if (fromAnamnesis.lean_mass_kg != null && out.lean_mass_kg == null) out.lean_mass_kg = fromAnamnesis.lean_mass_kg;
    }

    const latestAnthropometry = grRes.data;
    if (latestAnthropometry) {
      if (latestAnthropometry.weight != null) out.weight = Number(latestAnthropometry.weight);
      if (latestAnthropometry.height != null) out.height = Number(latestAnthropometry.height);
      const res = latestAnthropometry.results;
      if (res && typeof res === 'object') {
        if (res.body_fat_percentage != null) out.body_fat_percentage = Number(res.body_fat_percentage);
        if (res.lean_mass_kg != null) out.lean_mass_kg = Number(res.lean_mass_kg);
      }
    }

    const sources = { weight: null, height: null, age: null, gender: null, body_fat_percentage: null, lean_mass_kg: null };
    if (latestAnthropometry) {
      if (latestAnthropometry.weight != null) sources.weight = 'anthropometry';
      if (latestAnthropometry.height != null) sources.height = 'anthropometry';
      const res = latestAnthropometry.results;
      if (res && typeof res === 'object') {
        if (res.body_fat_percentage != null) sources.body_fat_percentage = 'anthropometry';
        if (res.lean_mass_kg != null) sources.lean_mass_kg = 'anthropometry';
      }
    }
    if (fromAnamnesis.weight != null && sources.weight == null) sources.weight = 'anamnesis';
    if (fromAnamnesis.height != null && sources.height == null) sources.height = 'anamnesis';
    if (fromAnamnesis.age != null || fromAnamnesis.birth_date != null) sources.age = sources.age || 'anamnesis';
    if (fromAnamnesis.gender != null && sources.gender == null) sources.gender = 'anamnesis';
    if (fromAnamnesis.body_fat_percentage != null && sources.body_fat_percentage == null) sources.body_fat_percentage = 'anamnesis';
    if (fromAnamnesis.lean_mass_kg != null && sources.lean_mass_kg == null) sources.lean_mass_kg = 'anamnesis';
    if (profile?.weight != null && sources.weight == null) sources.weight = 'profile';
    if (profile?.height != null && sources.height == null) sources.height = 'profile';
    if (profile?.birth_date != null && sources.age == null) sources.age = 'profile';
    if (profile?.gender != null && sources.gender == null) sources.gender = 'profile';

    return { data: { ...out, _sources: sources }, error: null };
  } catch (error) {
    logSupabaseError('Erro ao buscar biometria para energia', error);
    return {
      data: { height: null, weight: null, age: null, gender: null, body_fat_percentage: null, lean_mass_kg: null, _sources: {} },
      error
    };
  }
};

/**
 * Payload para salvar cálculo de gasto energético (schema da tabela).
 * @typedef {Object} SaveEnergyCalculationPayload
 * @property {string} patient_id
 * @property {string} [nutritionist_id]
 * @property {number} height
 * @property {number} weight
 * @property {number} age
 * @property {string} gender - 'M' | 'F'
 * @property {number|null} [body_fat_percentage]
 * @property {string} tmb_protocol - 'mifflin' | 'harris' | 'cunningham' | 'fao' | 'tinsley'
 * @property {number} tmb_result
 * @property {number} activity_factor
 * @property {number} [injury_factor=1]
 * @property {Array<{name: string, met: number, duration_min: number, kcal?: number}>} [mets_activities=[]]
 * @property {number} get_result
 * @property {number|null} [venta_target_weight]
 * @property {number|null} [venta_timeframe_days]
 * @property {number|null} [venta_adjustment_kcal]
 * @property {number} final_planned_kcal
 */

/**
 * Insere ou atualiza o cálculo de gasto energético do paciente.
 * Se já existir registro para o paciente, atualiza o mais recente; caso contrário, insere.
 *
 * @param {SaveEnergyCalculationPayload} data
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export const saveEnergyCalculation = async (data) => {
  try {
    // Colunas novas + legadas (protocol, activity_level, tmb, get) para compatibilidade com schema existente
    const row = {
      patient_id: data.patient_id,
      nutritionist_id: data.nutritionist_id || null,
      height: data.height,
      weight: data.weight,
      age: data.age,
      gender: data.gender,
      body_fat_percentage: data.body_fat_percentage ?? null,
      tmb_protocol: data.tmb_protocol,
      tmb_result: data.tmb_result,
      activity_factor: data.activity_factor,
      injury_factor: data.injury_factor ?? 1.0,
      mets_activities: Array.isArray(data.mets_activities) ? data.mets_activities : [],
      get_result: data.get_result,
      venta_target_weight: data.venta_target_weight ?? null,
      venta_timeframe_days: data.venta_timeframe_days ?? null,
      venta_adjustment_kcal: data.venta_adjustment_kcal ?? null,
      final_planned_kcal: data.final_planned_kcal,
      // Legado (alguns schemas têm NOT NULL nesses campos)
      protocol: data.tmb_protocol ?? null,
      activity_level: data.activity_factor ?? null,
      tmb: data.tmb_result ?? null,
      get: data.get_result ?? null
    };

    const { data: existing } = await supabase
      .from('energy_expenditure_calculations')
      .select('id')
      .eq('patient_id', data.patient_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { data: updated, error } = await supabase
        .from('energy_expenditure_calculations')
        .update(row)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return { data: updated, error: null };
    }

    const { data: inserted, error } = await supabase
      .from('energy_expenditure_calculations')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return { data: inserted, error: null };
  } catch (error) {
    logSupabaseError('Erro ao salvar cálculo de energia', error);
    return { data: null, error };
  }
};
