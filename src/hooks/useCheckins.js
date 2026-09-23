import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

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
    enabled: !!user?.id && (user.profile?.user_type === 'nutritionist' || user.user_metadata?.role === 'nutritionist' || user.user_metadata?.user_type === 'nutritionist'),
  });

  // --- NUTRI: Criar Template ---
  const createTemplate = useMutation({
    mutationFn: async ({ template, fields }) => {
      const { data: newTemplate, error: tmplError } = await supabase
        .from('checkin_templates')
        .insert({ 
          nutritionist_id: user.id, 
          name: template.name,
          description: template.description || '',
          frequency: template.frequency,
          send_time: template.send_time,
          send_days: template.send_days || [1],
          channel: template.channel || 'in_app'
        })
        .select()
        .single();
        
      if (tmplError) throw tmplError;
      
      if (fields && fields.length > 0) {
        const fieldsToInsert = fields.map((f, i) => ({
          template_id: newTemplate.id,
          label: f.label,
          field_type: f.field_type,
          options: f.options || [],
          score_weight: f.score_weight ?? 1.0,
          unit: f.unit || null,
          is_required: f.is_required !== undefined ? f.is_required : true,
          order_index: i
        }));
        const { error: fError } = await supabase.from('checkin_fields').insert(fieldsToInsert);
        if (fError) {
          await supabase.from('checkin_templates').delete().eq('id', newTemplate.id).eq('nutritionist_id', user.id);
          throw fError;
        }
      }
      return newTemplate;
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
  const getTemplate = async (templateId) => {
    const { data, error } = await supabase
      .from('checkin_templates')
      .select(`
        *,
        checkin_fields (*)
      `)
      .eq('id', templateId)
      .single();
    
    if (error) throw error;
    // Order fields
    if (data && data.checkin_fields) {
      data.checkin_fields.sort((a, b) => a.order_index - b.order_index);
    }
    return data;
  };

  // --- NUTRI: Atualizar Template ---
  const updateTemplate = useMutation({
    mutationFn: async ({ id, template, fields }) => {
      // 1. Atualizar o template principal
      const { data: updatedTemplate, error: tmplError } = await supabase
        .from('checkin_templates')
        .update({ 
          name: template.name,
          description: template.description || '',
          frequency: template.frequency,
          send_time: template.send_time,
          send_days: template.send_days || [1],
          channel: template.channel || 'in_app'
        })
        .eq('id', id)
        .select()
        .single();
        
      if (tmplError) throw tmplError;
      
      // 2. Apagar os fields antigos (para simplicidade, já que não precisamos de versionamento forte dos fields de checkin ainda)
      // Idealmente a longo prazo seria soft delete ou diffing.
      const { error: delError } = await supabase
        .from('checkin_fields')
        .delete()
        .eq('template_id', id);
        
      if (delError) throw delError;

      // 3. Inserir os novos fields
      if (fields && fields.length > 0) {
        const fieldsToInsert = fields.map((f, i) => ({
          template_id: id,
          label: f.label,
          field_type: f.field_type,
          options: f.options || [],
          score_weight: f.score_weight ?? 1.0,
          unit: f.unit || null,
          is_required: f.is_required !== undefined ? f.is_required : true,
          order_index: i
        }));
        const { error: fError } = await supabase.from('checkin_fields').insert(fieldsToInsert);
        if (fError) throw fError;
      }
      return updatedTemplate;
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
      toast({ title: "Não foi possível vincular", description: "O agendamento não foi criado. Tente novamente.", variant: "destructive" });
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
    enabled: !!user?.id && (user.profile?.user_type === 'patient' || user.user_metadata?.role === 'patient' || user.user_metadata?.user_type === 'patient'),
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
