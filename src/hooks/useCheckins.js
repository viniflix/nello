import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { validateCheckinTemplate } from '@/lib/validations/formContracts';

export function useCheckins() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // --- NUTRI: Listar Templates ---
  const useTemplates = () => useQuery({
    queryKey: ['checkinTemplates', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checkin_templates')
        .select(`
          *,
          checkin_fields (*)
        `)
        .eq('nutritionist_id', user?.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // --- NUTRI: Criar Template ---
  const createTemplate = useMutation({
    mutationFn: async ({ template, fields }) => {
      const validationError = validateCheckinTemplate({ name: template.name, fields, channel: template.channel });
      if (validationError) throw new Error(validationError);
      const { data, error } = await supabase.rpc('save_checkin_template', {
        p_id: null, p_template: template, p_fields: fields,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkinTemplates'] });
      toast({ title: "Sucesso!", description: "Template criado com sucesso." });
    },
    onError: (error) => {
      logSupabaseError('Criar template de check-in', error);
      toast({ title: "Não foi possível criar", description: "Revise os dados e tente novamente.", variant: "destructive" });
    }
  });

  // --- NUTRI: Obter Template Específico ---
  const getTemplate = useCallback(async (templateId) => {
    const { data, error } = await supabase
      .from('checkin_templates')
      .select(`
        *,
        checkin_fields (*)
      `)
      .eq('id', templateId)
      .eq('nutritionist_id', user?.id)
      .single();
    
    if (error) throw error;
    // Order fields
    if (data && data.checkin_fields) {
      data.checkin_fields.sort((a, b) => a.order_index - b.order_index);
    }
    return data;
  }, [user?.id]);

  // --- NUTRI: Atualizar Template ---
  const updateTemplate = useMutation({
    mutationFn: async ({ id, template, fields }) => {
      const validationError = validateCheckinTemplate({ name: template.name, fields, channel: template.channel });
      if (validationError) throw new Error(validationError);
      const { data, error } = await supabase.rpc('save_checkin_template', {
        p_id: id, p_template: template, p_fields: fields,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkinTemplates'] });
      toast({ title: "Sucesso!", description: "Template atualizado com sucesso." });
    },
    onError: (error) => {
      logSupabaseError('Atualizar template de check-in', error);
      toast({ title: "Não foi possível atualizar", description: "O formulário não foi salvo. Tente novamente.", variant: "destructive" });
    }
  });

  // --- NUTRI: Listar Schedules do Paciente ---
  const usePatientSchedules = (patientId) => useQuery({
    queryKey: ['checkinSchedules', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checkin_schedules')
        .select(`
          *,
          checkin_templates (name, frequency, send_time)
        `)
        .eq('patient_id', patientId)
        .eq('nutritionist_id', user?.id);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && !!patientId,
  });

  // --- NUTRI: Vincular Template (Criar Schedule) ---
  const linkTemplate = useMutation({
    mutationFn: async ({ templateId, patientId, channel, timeZone }) => {
      const { error } = await supabase.rpc('link_checkin_template', {
        p_template_id: templateId, p_patient_id: patientId,
        p_channel: channel || 'in_app', p_time_zone: timeZone || 'America/Fortaleza'
      });
      if (error) throw error;
      return true;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['checkinSchedules', variables.patientId] });
      toast({ title: "Sucesso", description: "Template vinculado ao paciente!" });
    },
    onError: (error) => {
      logSupabaseError('Vincular template de check-in', error);
      toast({ title: "Não foi possível vincular", description: error?.message?.includes('checkin_patient_account_required')
        ? 'O paciente precisa ativar sua conta no Nello para receber check-ins no aplicativo.'
        : 'O agendamento não foi criado. Tente novamente.', variant: "destructive" });
    }
  });

  const setScheduleActive = useMutation({
    mutationFn: async ({ scheduleId, active }) => {
      const { error } = await supabase.rpc('set_checkin_schedule_active', {
        p_schedule_id: scheduleId, p_active: active
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checkinSchedules'] }),
    onError: (error) => {
      logSupabaseError('Alterar agendamento de check-in', error);
      toast({ title: 'Não foi possível alterar o agendamento', variant: 'destructive' });
    }
  });

  // --- PACIENTE: Buscar check-ins pendentes ---
  const usePendingCheckins = () => useQuery({
    queryKey: ['pendingCheckins', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checkin_sessions')
        .select(`
          *,
          checkin_templates (name, description, checkin_fields(*))
        `)
        .eq('patient_id', user?.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('sent_at', { ascending: false });
        
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // --- PACIENTE / PUBLIC: Submeter Check-in ---
  const submitCheckin = useMutation({
    mutationFn: async ({ sessionId, responses }) => {
      if (!user?.id) throw new Error('CHECKIN_AUTH_REQUIRED');
      const { data: adherencePct, error } = await supabase.rpc('submit_checkin_session', {
        p_session_id: sessionId, p_responses: responses
      });
      if (error) throw error;
      return { adherencePct };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingCheckins'] });
      queryClient.invalidateQueries({ queryKey: ['patientCheckinHistory'] });
      toast({ title: "Check-in concluído!", description: "Suas respostas foram enviadas." });
    },
    onError: (error) => {
      logSupabaseError('Submeter check-in', error);
      toast({ title: "Não foi possível concluir", description: "Atualize a página e tente novamente.", variant: "destructive" });
    }
  });
  
  // --- Historico Check-in (Ambos) ---
  const useCheckinHistory = (patientId) => useQuery({
    queryKey: ['patientCheckinHistory', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checkin_sessions')
        .select(`
          id, completed_at, score_total, score_max, adherence_percentage, sent_at,
          checkin_templates (name)
        `)
        .eq('patient_id', patientId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });
        
      if (error) throw error;
      return data || [];
    },
    enabled: !!patientId,
  });

  return {
    useTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    usePatientSchedules,
    linkTemplate,
    setScheduleActive,
    usePendingCheckins,
    submitCheckin,
    useCheckinHistory
  };
}
