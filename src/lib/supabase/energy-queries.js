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
 * Busca altura, peso, idade, sexo e % gordura para auto-preenchimento do formulário de energia.
 * Prioridade: último registro de antropometria (growth_records) + perfil do paciente (user_profiles).
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

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('birth_date, gender, weight, height')
      .eq('id', patientId)
      .single();

    if (profileError) throw profileError;
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

    let latestAnthropometry = null;
    const { data: grData } = await supabase
      .from('growth_records')
      .select('weight, height, results, record_date')
      .eq('patient_id', patientId)
      .order('record_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    latestAnthropometry = grData;

    if (latestAnthropometry) {
      if (latestAnthropometry.weight != null) out.weight = Number(latestAnthropometry.weight);
      if (latestAnthropometry.height != null) out.height = Number(latestAnthropometry.height);
      const res = latestAnthropometry.results;
      if (res && typeof res === 'object') {
        if (res.body_fat_percentage != null) out.body_fat_percentage = Number(res.body_fat_percentage);
        if (res.lean_mass_kg != null) out.lean_mass_kg = Number(res.lean_mass_kg);
      }
    }

    return { data: out, error: null };
  } catch (error) {
    logSupabaseError('Erro ao buscar biometria para energia', error);
    return {
      data: { height: null, weight: null, age: null, gender: null, body_fat_percentage: null, lean_mass_kg: null },
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
      final_planned_kcal: data.final_planned_kcal
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
