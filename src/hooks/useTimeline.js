import { useQuery } from '@tanstack/react-query';
import { getPatientTimeline } from '@/lib/supabase/timeline-queries';

export function useTimeline(patientId) {
    const {
        data: timelineData,
        isLoading,
        error,
        refetch
    } = useQuery({
        queryKey: ['patientTimeline', patientId],
        queryFn: () => getPatientTimeline(patientId),
        enabled: !!patientId,
    });

    return {
        timelineData: timelineData?.data || [],
        isLoading,
        error: error || timelineData?.error,
        refetch
    };
}
