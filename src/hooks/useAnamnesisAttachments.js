import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';

const BUCKET = 'anamnesis-attachments';
// URL assinada válida por 1 hora — gerada sob demanda, nunca persistida no banco
const SIGNED_URL_EXPIRY_SECS = 60 * 60;

/**
 * Hook para gerenciar upload/download/deleção de anexos de anamneses.
 *
 * FIX A7: signed_url NÃO é mais gravada no JSONB.
 * Apenas o storage_path é persistido. A URL é gerada dinamicamente
 * no momento em que o usuário clica para visualizar — evitando URLs expiradas.
 *
 * Estrutura de path: {nutritionistId}/{patientId}/{recordId}/{fieldId}_{timestamp}.{ext}
 */
export function useAnamnesisAttachments(recordId, patientId) {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    /**
     * Gera uma URL assinada temporária para visualização de um arquivo.
     * Chamada APENAS quando o usuário clicar em "Ver Arquivo" — não persistida.
     */
    const getSignedUrl = async (storagePath) => {
        const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECS);
        if (error) throw error;
        return data.signedUrl;
    };

    const uploadAttachment = useMutation({
        mutationFn: async ({ file, fieldId, fieldLabel }) => {
            if (!patientId || !recordId) throw new Error('IDs obrigatórios ausentes.');

            const nutritionistId = user?.id ?? 'public';
            const ext = file.name.split('.').pop().toLowerCase();
            const safeFieldId = fieldId.replace(/[^a-z0-9_-]/gi, '_');
            const path = `${nutritionistId}/${patientId}/${recordId}/${safeFieldId}_${Date.now()}.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from(BUCKET)
                .upload(path, file, { upsert: false });
            if (uploadError) throw uploadError;

            // Buscar attachments atuais do record
            const { data: record, error: fetchErr } = await supabase
                .from('anamnesis_records')
                .select('attachments')
                .eq('id', recordId)
                .single();
            if (fetchErr) throw fetchErr;

            const currentAttachments = Array.isArray(record.attachments) ? record.attachments : [];

            // FIX: Apenas storage_path é salvo — sem signed_url no banco
            const newAttachment = {
                id: crypto.randomUUID(),
                field_id: fieldId,
                field_label: fieldLabel,
                file_name: file.name,
                file_size: file.size,
                file_type: file.type,
                storage_path: path,
                // FIX A8: uploaded_by baseado em autenticação real
                uploaded_by: user?.id ? 'nutritionist' : 'patient',
                uploaded_at: new Date().toISOString(),
            };

            const { error: updateErr } = await supabase
                .from('anamnesis_records')
                .update({ attachments: [...currentAttachments, newAttachment] })
                .eq('id', recordId);
            if (updateErr) throw updateErr;

            return newAttachment;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['anamnesis_record', recordId]);
            toast({ title: 'Arquivo enviado com segurança!' });
        },
        onError: (err) =>
            toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' }),
    });

    const deleteAttachment = useMutation({
        mutationFn: async ({ attachmentId, storagePath, currentAttachments }) => {
            // Remover do Storage
            const { error: storageErr } = await supabase.storage
                .from(BUCKET)
                .remove([storagePath]);
            // Ignora erro se o arquivo já não existia no storage
            if (storageErr && storageErr.status !== 404) throw storageErr;

            // Remover do JSONB
            const updated = currentAttachments.filter((a) => a.id !== attachmentId);
            const { error } = await supabase
                .from('anamnesis_records')
                .update({ attachments: updated })
                .eq('id', recordId);
            if (error) throw error;
            return updated;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['anamnesis_record', recordId]);
            toast({ title: 'Arquivo removido.' });
        },
        onError: (err) =>
            toast({ title: 'Erro ao remover', description: err.message, variant: 'destructive' }),
    });

    return { uploadAttachment, deleteAttachment, getSignedUrl };
}
