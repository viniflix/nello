import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { STANDARD_ANAMNESIS_FIELDS } from '@/lib/constants/standard-anamnesis-fields';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { publicOrigin } from '@/lib/utils/publicOrigin';

function getFallbackSections() {
    const categoriesMap = {
        identificacao: 'Identificação',
        historico_clinico: 'Histórico Clínico',
        habitos_vida: 'Hábitos de Vida',
        sintomas_atuais: 'Sintomas Atuais',
        objetivos: 'Objetivos',
        recordatorio_alimentar: 'Recordatório Alimentar'
    };

    const categories = Array.from(new Set(STANDARD_ANAMNESIS_FIELDS.map(f => f.category)));
    return categories.map(cat => ({
        id: crypto.randomUUID(),
        title: categoriesMap[cat] || cat,
        fields: STANDARD_ANAMNESIS_FIELDS.filter(f => f.category === cat).map(f => ({
            id: crypto.randomUUID(),
            label: f.field_label,
            type: f.field_type === 'texto_curto' ? 'text' : f.field_type === 'texto_longo' ? 'textarea' : f.field_type === 'selecao_unica' ? 'select' : 'multiselect',
            options: (f.options || []).map(opt => ({ label: opt, value: opt })),
            required: f.is_required || false
        }))
    }));
}

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
                    .order('created_at', { ascending: false })
                    .limit(50);
                if (error) throw error;
                return data || [];
            },
            enabled: !!patientId,
        });

    // ── 2. Record específico (com template completo ou snapshot) ─
    const useRecord = (recordId) =>
        useQuery({
            queryKey: ['anamnesis_record', recordId, patientId],
            queryFn: async () => {
                if (!recordId) return null;
                let actualId = recordId;
                if (!recordId.includes('-')) {
                    const { data: allRecords, error: listErr } = await supabase
                        .from('anamnesis_records')
                        .select('id')
                        .eq('patient_id', patientId);
                    if (listErr) throw listErr;
                    
                    const shortCode = String(recordId).toLowerCase();
                    const match = (allRecords || []).find((r) =>
                      String(r.id).replace(/-/g, '').toLowerCase().startsWith(shortCode)
                    );
                    if (!match) throw new Error('Formulário não encontrado');
                    actualId = match.id;
                }

                const { data, error } = await supabase
                    .from('anamnesis_records')
                    .select('*, template:template_id(*)')
                    .eq('id', actualId)
                    .eq('patient_id', patientId)
                    .single();
                if (error) throw error;
                // Usar template_snapshot se disponível (imutabilidade clínica)
                if (data?.template_snapshot && Object.keys(data.template_snapshot).length > 0) {
                    return { ...data, template: data.template_snapshot };
                }
                return data;
            },
            enabled: !!recordId && !!patientId,
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
                    .in('status', ['submitted', 'validated'])
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (error) throw error;
                return data?.[0]?.content || {};
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
                    .eq('status', 'pending_patient')
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
        mutationFn: async ({ templateId, episodeId, content = {} }) => {
            // Buscar template completo para snapshot imutável
            const { data: templateData, error: tErr } = await supabase
                .from('anamnesis_templates')
                .select('*')
                .eq('id', templateId)
                .or(`nutritionist_id.eq.${user.id},is_system_default.eq.true`)
                .eq('is_active', true)
                .single();
            if (tErr) throw tErr;
            if (!Array.isArray(templateData.sections) || templateData.sections.length === 0) {
                throw new Error('O modelo selecionado está vazio. Escolha um formulário com perguntas.');
            }

            const { data, error } = await supabase
                .from('anamnesis_records')
                .insert({
                    patient_id: patientId,
                    care_episode_id: episodeId || null,
                    nutritionist_id: user.id,
                    template_id: templateId,
                    status: 'draft',
                    filled_by: 'nutritionist',
                    content,
                    version: templateData?.version || 1,
                    // Fix A6: Salva snapshot do template no momento da criação
                    template_snapshot: {
                        title: templateData?.title || 'Formulário Sem Título',
                        description: templateData?.description || '',
                        sections: templateData?.sections?.length > 0 ? templateData.sections : getFallbackSections(),
                    },
                })
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['anamnesis_records', patientId] });
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
                .eq('patient_id', patientId)
                .eq('nutritionist_id', user.id)
                .in('status', ['draft', 'pending_patient'])
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: async (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['anamnesis_records', patientId] });
            queryClient.invalidateQueries({ queryKey: ['anamnesis_record', data.id] });

            // Ao concluir: extrair clinical_flag_keys e salvar no perfil
            if (data.status === 'validated' || data.status === 'submitted') {
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

                queryClient.invalidateQueries({ queryKey: ['clinical_flags', patientId] });
                toast({ title: 'Anamnese finalizada!', description: 'Os dados foram registrados no histórico do paciente.' });
            } else {
                if (!variables?.silent) toast({ title: 'Rascunho salvo', description: 'O progresso foi salvo.' });
            }
        },
        onError: (err) => {
            logSupabaseError('Atualizar anamnese profissional', err);
            toast({ title: 'Não foi possível salvar', description: 'Atualize a página e tente novamente.', variant: 'destructive' });
        },
    });

    // ── 7. Deletar record ────────────────────────────────────────
    const deleteRecord = useMutation({
        mutationFn: async (recordId) => {
            const { error } = await supabase
                .from('anamnesis_records')
                .delete()
                .eq('id', recordId)
                .eq('nutritionist_id', user.id)
                .in('status', ['draft', 'pending_patient']);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['anamnesis_records', patientId] });
            queryClient.invalidateQueries({ queryKey: ['patientTimeline', patientId] });
            toast({ title: 'Anamnese excluída', description: 'O formulário foi excluído com sucesso.' });
        },
        onError: (err) => toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' }),
    });

    // ── 8. Gerar/Reenviar Link Seguro para o Paciente ────────────
    const generateLink = useMutation({
        mutationFn: async ({ recordId, expiresDays = 7 }) => {
            const { data, error } = await supabase.rpc('generate_anamnesis_link', {
                p_record_id: recordId,
                p_nutritionist_id: user.id,
                p_expires_days: expiresDays
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['anamnesis_records', patientId] });
            const url = `${publicOrigin()}/f/${data.token}`;
            navigator.clipboard?.writeText(url).catch(() => {});
            toast({
                title: 'Link copiado!',
                description: `Link ativo por ${7} dias. Cole e envie ao paciente.`,
            });
            return data;
        },
        onError: (err) => toast({ title: 'Erro ao gerar link', description: err.message, variant: 'destructive' }),
    });

    return {
        usePatientRecords,
        useRecord,
        usePreviousProfile,
        usePendingRecords,
        createRecord,
        updateRecord,
        deleteRecord,
        generateLink,
    };
}
