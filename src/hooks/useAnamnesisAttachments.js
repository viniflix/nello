import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { toPortugueseError } from '@/lib/utils/errorMessages';

const BUCKET = 'anamnesis-attachments';
const EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
};

export function useAnamnesisAttachments(recordId, patientId, publicToken = null, onAttachmentsChange = null) {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const refreshAttachments = (attachments) => {
        onAttachmentsChange?.(attachments);
        queryClient.invalidateQueries({ queryKey: ['anamnesis_record', recordId] });
    };

    const getSignedUrl = async (storagePath) => {
        const { data, error } = await supabase.storage.from(BUCKET)
            .createSignedUrl(storagePath, publicToken ? 30 : 3600);
        if (error) throw error;
        return data.signedUrl;
    };

    const uploadAttachment = useMutation({
        mutationFn: async ({ file, fieldId, fieldLabel }) => {
            if (!recordId || (!publicToken && (!user?.id || !patientId))) {
                throw new Error('Formulário indisponível para anexos. Recarregue e tente novamente.');
            }
            const ext = EXTENSIONS[file.type];
            if (!ext || file.size <= 0 || file.size > 10 * 1024 * 1024) {
                throw new Error('Envie JPG, PNG, WebP ou PDF de até 10 MB.');
            }
            const path = publicToken
                ? `public/${publicToken}/${recordId}/${crypto.randomUUID()}.${ext}`
                : `nutritionist/${user.id}/${recordId}/${crypto.randomUUID()}.${ext}`;
            const { error: uploadError } = await supabase.storage.from(BUCKET)
                .upload(path, file, { upsert: false, contentType: file.type });
            if (uploadError) throw uploadError;
            const { data, error } = await supabase.rpc('attach_anamnesis_file', {
                p_record_id: recordId,
                p_token: publicToken,
                p_path: path,
                p_field_id: fieldId,
                p_field_label: fieldLabel,
                p_file_name: file.name,
            });
            if (error) {
                await supabase.storage.from(BUCKET).remove([path]);
                throw error;
            }
            return data;
        },
        onSuccess: (attachments) => {
            refreshAttachments(attachments);
            toast({ title: 'Arquivo anexado com segurança.' });
        },
        onError: (error) => toast({
            title: 'Erro no upload', description: toPortugueseError(error, 'Não foi possível anexar o arquivo.'), variant: 'destructive'
        }),
    });

    const deleteAttachment = useMutation({
        mutationFn: async ({ attachmentId }) => {
            if (!recordId) throw new Error('Formulário indisponível.');
            const { data, error } = await supabase.rpc('detach_anamnesis_file', {
                p_record_id: recordId,
                p_token: publicToken,
                p_attachment_id: attachmentId,
            });
            if (error) throw error;
            const { error: storageError } = await supabase.storage.from(BUCKET)
                .remove([data.storage_path]);
            if (storageError) console.error('Falha na limpeza do anexo removido:', storageError.code || 'storage_error');
            return data.attachments;
        },
        onSuccess: (attachments) => {
            refreshAttachments(attachments);
            toast({ title: 'Arquivo removido.' });
        },
        onError: (error) => toast({
            title: 'Erro ao remover', description: toPortugueseError(error, 'Não foi possível remover o arquivo.'), variant: 'destructive'
        }),
    });

    return { uploadAttachment, deleteAttachment, getSignedUrl };
}
