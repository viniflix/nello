import { supabase } from '@/infrastructure/supabase/client';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

export const TIMELINE_PAGE_SIZE = 30;

export async function listPatientTimeline(patientId, episodeId, scope = 'all', cursor = null, limit = TIMELINE_PAGE_SIZE) {
  const payload = {
    p_patient_id: patientId,
    p_episode_id: episodeId,
    p_scope: scope,
    p_cursor_at: cursor?.occurredAt || null,
    p_cursor_event_id: cursor?.eventId || null,
    p_limit: limit,
  };
  try {
    const { data, error } = await supabase.rpc('list_patient_timeline', payload);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const lastItem = hasNextPage ? items.at(-1) : null;
    return {
      items,
      nextCursor: lastItem ? { occurredAt: lastItem.occurred_at, eventId: lastItem.event_id } : null,
    };
  } catch (error) {
    logSupabaseError('Erro ao buscar linha do tempo do paciente', error);
    throw error;
  }
}
