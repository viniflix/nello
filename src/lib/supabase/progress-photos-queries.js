import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

const BUCKET = 'patient-photos';
const SIGNED_URL_TTL_SECONDS = 300;

export function normalizePatientPhotoPath(value) {
    if (!value || typeof value !== 'string') return null;
    if (value.startsWith(`${BUCKET}/`)) return value.slice(BUCKET.length + 1);

    const publicMarker = `/storage/v1/object/public/${BUCKET}/`;
    const signedMarker = `/storage/v1/object/sign/${BUCKET}/`;
    if (value.includes(publicMarker)) return value.split(publicMarker)[1]?.split('?')[0] || null;
    if (value.includes(signedMarker)) return value.split(signedMarker)[1]?.split('?')[0] || null;
    return value.replace(/^\/+/, '').split('?')[0] || null;
}

export async function getActiveCareEpisodeId(patientId) {
    if (!patientId) return { data: null, error: new Error('Paciente não informado.') };
    try {
        const { data, error } = await supabase
            .from('care_episodes')
            .select('id')
            .eq('patient_id', patientId)
            .eq('status', 'active')
            .maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error('Não há acompanhamento ativo para vincular esta foto.');
        return { data: data.id, error: null };
    } catch (error) {
        logSupabaseError('getActiveCareEpisodeId', error);
        return { data: null, error };
    }
}

export async function createPatientPhotoSignedUrl(value) {
    const path = normalizePatientPhotoPath(value);
    if (!path) return { data: null, path: null, error: new Error('Caminho da foto inválido.') };
    const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return { data: data?.signedUrl || null, path, error };
}

/**
 * Lista fotos de progresso do paciente, ordenadas por data (mais antiga primeiro para "antes/depois").
 * @param {{ patientId: string, limit?: number }} opts
 */
export async function getProgressPhotos({ patientId, limit = 100 }) {
    if (!patientId) return { data: [], error: null };
    try {
        const { data, error } = await supabase
            .from('progress_photos')
            .select('*')
            .eq('patient_id', patientId)
            .eq('status', 'active')
            .order('photo_date', { ascending: true })
            .order('created_at', { ascending: true })
            .limit(limit);
        if (error) throw error;

        const resolved = await Promise.all((data || []).map(async (photo) => {
            const signed = await createPatientPhotoSignedUrl(photo.storage_path || photo.photo_url);
            if (signed.error || !signed.data) {
                throw signed.error || new Error('Não foi possível autorizar a visualização da foto.');
            }
            return {
                ...photo,
                storage_path: signed.path,
                photo_url: signed.data,
            };
        }));
        return { data: resolved, error: null };
    } catch (e) {
        logSupabaseError('getProgressPhotos', e);
        return { data: [], error: e };
    }
}

/**
 * Retorna a primeira e a última foto (para card Antes/Depois) e dados para peso.
 * @param {{ patientId: string }} opts
 */
export async function getProgressPhotosSummary({ patientId }) {
    if (!patientId) return { first: null, last: null, all: [], error: null };
    const { data: all, error } = await getProgressPhotos({ patientId });
    if (error) return { first: null, last: null, all: [], error };
    const first = all.length > 0 ? all[0] : null;
    const last = all.length > 0 ? all[all.length - 1] : null;
    return { first, last, all, error: null };
}

/**
 * Adiciona uma foto de progresso (URL já deve estar no storage).
 * @param {{ patientId: string, photoUrl: string, photoDate: string, uploadedBy?: string, notes?: string }} opts
 */
export async function addProgressPhoto({
    patientId,
    storagePath,
    careEpisodeId,
    photoDate,
    uploadedBy = null,
    notes = null
}) {
    try {
        if (!storagePath || !careEpisodeId) throw new Error('Foto sem vínculo clínico válido.');
        const { data, error } = await supabase
            .from('progress_photos')
            .insert({
                patient_id: patientId,
                photo_url: storagePath,
                storage_path: storagePath,
                care_episode_id: careEpisodeId,
                photo_date: photoDate,
                uploaded_by: uploadedBy || null,
                notes: notes || null
            })
            .select()
            .single();
        if (error) throw error;
        return { data, error: null };
    } catch (e) {
        logSupabaseError('addProgressPhoto', e);
        return { data: null, error: e };
    }
}

/**
 * Atualiza data e/ou notas de uma foto de progresso.
 * @param {{ photoId: string, photoDate?: string, notes?: string }} opts
 */
export async function updateProgressPhoto({ photoId, photoDate, notes }) {
    try {
        const patch = {};
        if (photoDate != null) patch.photo_date = photoDate;
        if (notes !== undefined) patch.notes = notes;
        if (Object.keys(patch).length === 0) return { data: null, error: null };
        const { data, error } = await supabase
            .from('progress_photos')
            .update(patch)
            .eq('id', photoId)
            .select()
            .single();
        if (error) throw error;
        return { data, error: null };
    } catch (e) {
        logSupabaseError('updateProgressPhoto', e);
        return { data: null, error: e };
    }
}

/**
 * Remove uma foto de progresso (não remove do storage; o caller pode fazer isso).
 */
export async function deleteProgressPhoto({ photoId }) {
    try {
        const { error } = await supabase.rpc('invalidate_progress_photo', {
            p_photo_id: photoId,
            p_reason: 'Removida da visualização pelo usuário',
        });
        if (error) throw error;
        return { error: null };
    } catch (e) {
        logSupabaseError('deleteProgressPhoto', e);
        return { error: e };
    }
}

export async function uploadProgressPhoto({
    patientId,
    file,
    extension,
    contentType,
    photoDate,
    uploadedBy,
    notes = null,
}) {
    let storagePath = null;
    try {
        const episode = await getActiveCareEpisodeId(patientId);
        if (episode.error) throw episode.error;

        storagePath = `${patientId}/${episode.data}/progress_photos/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, file, {
                upsert: false,
                contentType,
                cacheControl: '3600',
            });
        if (uploadError) throw uploadError;

        const inserted = await addProgressPhoto({
            patientId,
            storagePath,
            careEpisodeId: episode.data,
            photoDate,
            uploadedBy,
            notes,
        });
        if (inserted.error) throw inserted.error;
        return { data: inserted.data, error: null };
    } catch (error) {
        if (storagePath) {
            await supabase.storage.from(BUCKET).remove([storagePath]);
        }
        logSupabaseError('uploadProgressPhoto', error);
        return { data: null, error };
    }
}

/**
 * Peso mais próximo da data informada (antes ou na data).
 * Usado para "peso no antes" e "peso no depois" no card de fotos.
 * @param {{ patientId: string, date: string (YYYY-MM-DD) }} opts
 */
export async function getWeightClosestToDate({ patientId, date }) {
    if (!patientId || !date) return { data: null, error: null };
    try {
        const d = new Date(date);
        const dateStr = d.toISOString().slice(0, 10);
        const { data, error } = await supabase
            .from('growth_records')
            .select('weight, record_date')
            .eq('patient_id', patientId)
            .not('weight', 'is', null)
            .lte('record_date', dateStr)
            .order('record_date', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        if (data) return { data: { weight: parseFloat(data.weight), record_date: data.record_date }, error: null };
        // Se não houver peso até a data, pegar o mais próximo depois
        const { data: after } = await supabase
            .from('growth_records')
            .select('weight, record_date')
            .eq('patient_id', patientId)
            .not('weight', 'is', null)
            .gte('record_date', dateStr)
            .order('record_date', { ascending: true })
            .limit(1)
            .maybeSingle();
        return { data: after ? { weight: parseFloat(after.weight), record_date: after.record_date } : null, error: null };
    } catch (e) {
        logSupabaseError('getWeightClosestToDate', e);
        return { data: null, error: e };
    }
}
