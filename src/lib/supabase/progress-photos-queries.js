import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

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
            .order('photo_date', { ascending: true })
            .order('created_at', { ascending: true })
            .limit(limit);
        if (error) throw error;
        return { data: data || [], error: null };
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
export async function addProgressPhoto({ patientId, photoUrl, photoDate, uploadedBy = null, notes = null }) {
    try {
        const { data, error } = await supabase
            .from('progress_photos')
            .insert({
                patient_id: patientId,
                photo_url: photoUrl,
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
        const { error } = await supabase.from('progress_photos').delete().eq('id', photoId);
        if (error) throw error;
        return { error: null };
    } catch (e) {
        logSupabaseError('deleteProgressPhoto', e);
        return { error: e };
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
