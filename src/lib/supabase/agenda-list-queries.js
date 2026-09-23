import { supabase } from '@/lib/customSupabaseClient';
import { Events, track } from '@/infrastructure/analytics/posthog';

const PAGE_SIZE = 500;

export async function fetchAppointmentsInPeriod(nutritionistId, start, end, select = '*, patient:user_profiles!appointments_patient_id_fkey(name, id)', operation = 'agenda_period') {
    const started = performance.now();
    const rows = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        let query = supabase.from('appointments')
            .select(select)
            .eq('nutritionist_id', nutritionistId)
            .order('appointment_time', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
        if (start) query = query.gte('appointment_time', start.toISOString());
        if (end) query = query.lt('appointment_time', end.toISOString());
        const { data, error } = await query;
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) {
            track(Events.DATA_LOAD_TIMING, { operation, duration_ms: Math.round(performance.now() - started), result_count: rows.length, pages: Math.floor(offset / PAGE_SIZE) + 1 });
            return rows;
        }
    }
}
