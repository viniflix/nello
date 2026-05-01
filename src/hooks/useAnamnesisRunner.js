import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';

export function useAnamnesisRunner(patientId) {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // ── 1. Todos os records do paciente ─────────────────────────
    const usePatientRecords = () =>
        useQuery({
            queryKey: ['anamnesis_records', patientId],
            queryFn: async () => {
                if (!patientId) return [];
                const { data, error } = await supabase
                    .from('anamnesis_records')
                    .select('*, template:template_id(title)')
                    .eq('patient_id', patientId)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                return data || [];
            },
            enabled: !!patientId,
        });

    // ── 2. Record específico (com template completo ou snapshot) ─
    const useRecord = (recordId) =>
        useQuery({
            queryKey: ['anamnesis_record', recordId],
            queryFn: async () => {
                if (!recordId) return null;
                const { data, error } = await supabase
                    .from('anamnesis_records')
                    .select('*, template:template_id(*)')
                    .eq('id', recordId)
                    .single();
                if (error) throw error;
                // Usar template_snapshot se disponível (imutabilidade clínica)
                if (data?.template_snapshot && Object.keys(data.template_snapshot).length > 0) {
                    return { ...data, template: data.template_snapshot };
                }
                return data;
            },
            enabled: !!recordId,
        });

    // ── 3. Progressive Profiling ─────────────────────────────────
    const usePreviousProfile = () =>
        useQuery({
            queryKey: ['anamnesis_records', patientId, 'progressive'],
            queryFn: async () => {
                if (!patientId) return null;
                const { data, error } = await supabase
                    .from('anamnesis_records')
                    .select('content')
                    .eq('patient_id', patientId)
                    .in('status', ['completed', 'validated'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();
                if (error && error.code !== 'PGRST116') throw error;
                return data?.content || {};
            },
            enabled: !!patientId,
        });

    // ── 4. Records pendentes do nutricionista (Widget Dashboard) ─
    const usePendingRecords = () =>
        useQuery({
            queryKey: ['anamnesis_records', user?.id, 'pending'],
            queryFn: async () => {
                if (!user?.id) return [];
                const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                const { data, error } = await supabase
                    .from('anamnesis_records')
                    .select('*, patient:patient_id(name, slug), template:template_id(title)')
                    .eq('nutritionist_id', user.id)
                    .eq('status', 'awaiting_patient')
                    .not('public_access_token', 'is', null)
                    .lt('created_at', cutoff)
                    .order('created_at', { ascending: false })
                    .limit(20);
                if (error) throw error;
                return data || [];
            },
            enabled: !!user?.id,
        });

    // ── 5. Criar novo record (com snapshot do template) ──────────
    const createRecord = useMutation({
        mutationFn: async ({ templateId, content = {} }) => {
            // Buscar template completo para snapshot imutável
            const { data: templateData, error: tErr } = await supabase
                .from('anamnesis_templates')
                .select('*')
                .eq('id', templateId)
                .single();
            if (tErr) throw tErr;

            const { data, error } = await supabase
                .from('anamnesis_records')
                .insert({
                    patient_id: patientId,
                    nutritionist_id: user.id,
                    template_id: templateId,
                    status: 'draft',
                    filled_by: 'nutritionist',
                    content,
                    template_version: templateData?.version || 1,
                    // Fix A6: Salva snapshot do template no momento da criação
                    template_snapshot: {
                        title: templateData.title,
                        description: templateData.description,
                        sections: templateData.sections,
                    },
                })
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['anamnesis_records', patientId]);
            toast({ title: 'Rascunho criado', description: 'Você pode começar a preencher a anamnese.' });
        },
        onError: (err) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
    });

    // ── 6. Atualizar record (rascunho ou conclusão) ──────────────
    const updateRecord = useMutation({
        mutationFn: async ({ recordId, content, status = 'draft', historyLog = [] }) => {
            const updatePayload = { content, status, filled_by: 'nutritionist' };
            if (historyLog.length > 0) updatePayload.history_log = historyLog;

            const { data, error } = await supabase
                .from('anamnesis_records')
                .update(updatePayload)
                .eq('id', recordId)
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: async (data) => {
            queryClient.invalidateQueries(['anamnesis_records', patientId]);
            queryClient.invalidateQueries(['anamnesis_record', data.id]);

            // Ao concluir: extrair clinical_flag_keys e salvar no perfil
            if (data.status === 'completed') {
                // Ler o template (snapshot ou live) para encontrar campos com clinical_flag_key
                const sections = data.template_snapshot?.sections ||
                    (await supabase.from('anamnesis_templates').select('sections').eq('id', data.template_id).single()).data?.sections ||
                    [];

                const flagUpdates = {};
                sections.forEach(section => {
                    section.fields?.forEach(field => {
                        if (field.clinical_flag_key && field.id) {
                            const answer = data.content?.[field.id];
                            if (answer !== undefined && answer !== null && answer !== '') {
                                flagUpdates[field.clinical_flag_key] = {
                                    value: answer,
                                    label: field.label || field.clinical_flag_key,
                                    captured_at: new Date().toISOString(),
                                    source: data.filled_by === 'patient' ? 'patient' : 'anamnesis',
                                    record_id: data.id,
                                };
                            }
                        }
                    });
                });

                if (Object.keys(flagUpdates).length > 0) {
                    // Merge com flags existentes sem sobrescrever outras
                    const { data: profile } = await supabase
                        .from('user_profiles')
                        .select('clinical_flags')
                        .eq('id', patientId)
                        .single();

                    const merged = { ...(profile?.clinical_flags || {}), ...flagUpdates };
                    await supabase
                        .from('user_profiles')
                        .update({ clinical_flags: merged })
                        .eq('id', patientId);
                }

                queryClient.invalidateQueries(['clinical_flags', patientId]);
                toast({ title: 'Anamnese finalizada!', description: 'Os dados foram registrados no histórico do paciente.' });
            } else {
                toast({ title: 'Rascunho salvo', description: 'O progresso foi salvo automaticamente.' });
            }
        },
        onError: (err) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
    });

    // ── 7. Gerar/Regenerar link externo via RPC ─────────────────
    const generateLink = useMutation({
        mutationFn: async ({ recordId, expiresDays = 7 }) => {
            const { data, error } = await supabase.rpc('generate_anamnesis_link', {
                p_record_id: recordId,
                p_nutritionist_id: user.id,
                p_expires_days: expiresDays,
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries(['anamnesis_records', patientId]);
            const url = `${window.location.origin}/f/${data.token}`;
            navigator.clipboard?.writeText(url).catch(() => {});
            toast({
                title: 'Link copiado!',
                description: `Link ativo por ${7} dias. Cole e envie ao paciente.`,
            });
            return data;
        },
        onError: (err) => toast({ title: 'Erro ao gerar link', description: err.message, variant: 'destructive' }),
    });

    // ── 8. Deletar record ────────────────────────────────────────
    const deleteRecord = useMutation({
        mutationFn: async (recordId) => {
            const { error } = await supabase
                .from('anamnesis_records')
                .delete()
                .eq('id', recordId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['anamnesis_records', patientId]);
            toast({ title: 'Registro excluído.' });
        },
        onError: (err) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
    });

    return {
        usePatientRecords,
        useRecord,
        usePreviousProfile,
        usePendingRecords,
        createRecord,
        updateRecord,
        generateLink,
        deleteRecord,
    };
}
