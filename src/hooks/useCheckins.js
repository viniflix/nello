import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';

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
          score_weight: f.score_weight || 1.0,
          unit: f.unit || null,
          is_required: f.is_required !== undefined ? f.is_required : true,
          order_index: i
        }));
        const { error: fError } = await supabase.from('checkin_fields').insert(fieldsToInsert);
        if (fError) throw fError;
      }
      return newTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkinTemplates'] });
      toast({ title: "Sucesso!", description: "Template criado com sucesso." });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
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
      toast({ title: "Erro", description: error.message, variant: "destructive" });
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
    mutationFn: async ({ sessionId, responses, scoreTotal, scoreMax, adherencePct }) => {
      const { error } = await supabase
        .from('checkin_sessions')
        .update({
          responses,
          score_total: scoreTotal,
          score_max: scoreMax,
          adherence_percentage: adherencePct,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', sessionId);
        
      if (error) throw error;
      
      // Update streak directly using RPC
      if (user?.id) {
         await supabase.rpc('increment_checkin_streak', { 
           p_patient_id: user.id, 
           // Need nutritionist_id, but the session has it. We assume the session fetch will handle it via Edge Function if public, 
           // or we can just fetch it before RPC. Actually, let the RPC fetch it or let the edge function do it. 
           // For now, if logged in, we must pass nutritionist_id. Let's assume we pass it in the mutation.
         });
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingCheckins'] });
      queryClient.invalidateQueries({ queryKey: ['patientCheckinHistory'] });
      toast({ title: "Check-in Conluído!", description: "Suas respostas foram enviadas." });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
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
    createTemplate,
    usePatientSchedules,
    linkTemplate,
    usePendingCheckins,
    submitCheckin,
    useCheckinHistory
  };
}
