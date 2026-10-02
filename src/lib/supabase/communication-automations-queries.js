import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

const defaultAutomationTemplate = {
  name: '',
  description: null,
  trigger_event: 'low_adherence_detected',
  channel: 'in_app',
  template_title: null,
  template_body: '',
  is_active: true,
  cooldown_hours: 24,
  config: {}
};

export const getCommunicationAutomations = async (nutritionistId) => {
  try {
    const { data, error } = await supabase
      .from('communication_automations')
      .select("id,nutritionist_id,automation_key,name,description,trigger_event,channel,template_title,template_body,is_active,cooldown_hours,config,created_at,updated_at")
      .eq('nutritionist_id', nutritionistId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    logSupabaseError("erro_ao_buscar_automacoes_de_comunicacao", error);
    return { data: [], error };
  }
};

export const upsertCommunicationAutomation = async ({
  nutritionistId,
  automationKey,
  payload = {}
}) => {
  try {
    const row = {
      nutritionist_id: nutritionistId,
      automation_key: automationKey,
      ...defaultAutomationTemplate,
      ...(payload && typeof payload === 'object' ? payload : {})
    };

    const { data, error } = await supabase
      .from('communication_automations')
      .upsert(row, { onConflict: 'nutritionist_id,automation_key' })
      .select("id,nutritionist_id,automation_key,name,description,trigger_event,channel,template_title,template_body,is_active,cooldown_hours,config,created_at,updated_at")
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    logSupabaseError("erro_ao_salvar_automacao_de_comunicacao", error);
    return { data: null, error };
  }
};

export const toggleCommunicationAutomation = async ({
  nutritionistId,
  automationKey,
  isActive
}) => {
  return upsertCommunicationAutomation({
    nutritionistId,
    automationKey,
    payload: { is_active: Boolean(isActive) }
  });
};

export const deleteCommunicationAutomation = async ({ nutritionistId, automationKey }) => {
  try {
    const { error } = await supabase
      .from('communication_automations')
      .delete()
      .eq('nutritionist_id', nutritionistId)
      .eq('automation_key', automationKey);

    if (error) throw error;
    return { data: true, error: null };
  } catch (error) {
    logSupabaseError("erro_ao_excluir_automacao_de_comunicacao", error);
    return { data: false, error };
  }
};

