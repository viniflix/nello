import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

/**
 * useClinicalFlags — Sprint 8
 * Lê e gerencia as flags clínicas (alergias, comorbidades, alertas)
 * de um paciente, extraídas automaticamente das anamneses respondidas.
 */
export function useClinicalFlags(patientId) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: flags, isLoading } = useQuery({
        queryKey: ['clinical_flags', patientId],
        queryFn: async () => {
            if (!patientId) return {};
            const { data, error } = await supabase
                .from('user_profiles')
                .select('clinical_flags')
                .eq('id', patientId)
                .single();

            if (error) throw error;
            return data?.clinical_flags || {};
        },
        enabled: !!patientId,
    });

    // Extrair flags manualmente de um record existente (via RPC)
    const extractFromRecord = useMutation({
        mutationFn: async (recordId) => {
            const { data, error } = await supabase.rpc('extract_and_inject_clinical_flags', {
                p_record_id: recordId,
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries(['clinical_flags', patientId]);
            const count = Object.keys(data?.flags_injected || {}).length;
            if (count > 0) {
                toast({ title: `${count} alerta(s) clínico(s) extraído(s)!`, description: 'Os dados foram atualizados no perfil do paciente.' });
            }
        },
        onError: (err) => {
            toast({ title: 'Erro', description: err.message, variant: 'destructive' });
        },
    });

    // Remover flag manualmente (nutricionista pode descartar um alerta)
    const removeFlag = useMutation({
        mutationFn: async (flagKey) => {
            // Buscar o objeto atual, remover a key e salvar de volta
            const { data: profile, error: fetchErr } = await supabase
                .from('user_profiles')
                .select('clinical_flags')
                .eq('id', patientId)
                .single();

            if (fetchErr) throw fetchErr;

            const updated = { ...(profile?.clinical_flags || {}) };
            delete updated[flagKey];

            const { error } = await supabase
                .from('user_profiles')
                .update({ clinical_flags: updated })
                .eq('id', patientId);

            if (error) throw error;
            return updated;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['clinical_flags', patientId]);
            toast({ title: 'Alerta removido.' });
        },
    });

    // Adicionar flag manualmente (nutricionista pode criar alertas manuais)
    const addFlag = useMutation({
        mutationFn: async ({ key, label, value = 'manual' }) => {
            const { data: profile, error: fetchErr } = await supabase
                .from('user_profiles')
                .select('clinical_flags')
                .eq('id', patientId)
                .single();

            if (fetchErr) throw fetchErr;

            const updated = {
                ...(profile?.clinical_flags || {}),
                [key]: { value, label, captured_at: new Date().toISOString(), source: 'nutritionist' },
            };

            const { error } = await supabase
                .from('user_profiles')
                .update({ clinical_flags: updated })
                .eq('id', patientId);

            if (error) throw error;
            return updated;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['clinical_flags', patientId]);
            toast({ title: 'Alerta adicionado ao paciente.' });
        },
    });

    // Helpers computados
    const flagsList = Object.entries(flags || {}).map(([key, val]) => ({
        key,
        label: val.label || key,
        value: val.value,
        source: val.source || 'anamnesis',
        captured_at: val.captured_at,
        record_id: val.record_id,
    }));

    const hasAllergies = flagsList.some(f => f.key.includes('alergi') || f.key.includes('intoleranc'));
    const hasChronic = flagsList.some(f =>
        f.key.includes('doenca') || f.key.includes('cronico') || f.key.includes('comorbidade')
    );

    return {
        flags,
        flagsList,
        hasAllergies,
        hasChronic,
        isLoading,
        extractFromRecord,
        removeFlag,
        addFlag,
    };
}
