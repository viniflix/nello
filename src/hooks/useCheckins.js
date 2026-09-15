import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { calculateCheckinScore, findMissingRequiredField } from '@/lib/validations/formContracts';
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
    mutationFn: async ({ templateId, patientId, nextSendAt, channel }) => {
      const { error } = await supabase
        .from('checkin_schedules')
        .upsert({
          template_id: templateId,
          patient_id: patientId,
          nutritionist_id: user.id,
          next_send_at: nextSendAt,
          channel: channel || 'in_app'
        }, { onConflict: 'template_id,patient_id' }); 
        
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

      const { data: session, error: sessionError } = await supabase
        .from('checkin_sessions')
        .select('id, patient_id, nutritionist_id, template_id, status, expires_at')
        .eq('id', sessionId)
        .eq('patient_id', user.id)
        .single();
      if (sessionError || !session) throw sessionError || new Error('CHECKIN_NOT_FOUND');
      if (session.status !== 'pending') throw new Error('CHECKIN_ALREADY_COMPLETED');
      if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) throw new Error('CHECKIN_EXPIRED');

      const { data: fields, error: fieldsError } = await supabase
        .from('checkin_fields')
        .select('id, field_type, is_required, label, score_weight')
        .eq('template_id', session.template_id)
        .order('order_index', { ascending: true });
      if (fieldsError) throw fieldsError;
      if (!fields?.length) throw new Error('CHECKIN_WITHOUT_FIELDS');

      const missing = findMissingRequiredField(fields, responses);
      if (missing) throw new Error('CHECKIN_REQUIRED_FIELD_MISSING');
      const score = calculateCheckinScore(fields, responses);
      const adherencePct = score.maximum > 0 ? (score.total / score.maximum) * 100 : null;
      const now = new Date().toISOString();

      const { data: updated, error } = await supabase
        .from('checkin_sessions')
        .update({
          responses,
          score_total: score.total,
          score_max: score.maximum,
          adherence_percentage: adherencePct,
          status: 'completed',
          completed_at: now
        })
        .eq('id', sessionId)
        .eq('patient_id', user.id)
        .eq('status', 'pending')
        .gt('expires_at', now)
        .select('id')
        .maybeSingle();
        
      if (error) throw error;
      if (!updated) throw new Error('CHECKIN_ALREADY_COMPLETED_OR_EXPIRED');
      
      const { error: streakError } = await supabase.rpc('increment_checkin_streak', {
        p_patient_id: user.id,
        p_nutritionist_id: session.nutritionist_id,
      });
      if (streakError) {
        logSupabaseError('Check-in concluído, mas a sequência não foi atualizada', streakError);
      }
      return { adherencePct, streakUpdated: !streakError };
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
    usePendingCheckins,
    submitCheckin,
    useCheckinHistory
  };
}
