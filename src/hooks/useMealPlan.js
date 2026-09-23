import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMealPlans, getMealPlansByIds, getDraftMealPlans } from '@/lib/supabase/meal-plan-queries';
import { Events, track } from '@/infrastructure/analytics/posthog';
import { getTodayIsoDate } from '@/lib/utils/date';

export function useMealPlan(patientId, nutritionistId) {
    const queryClient = useQueryClient();

    const {
        data,
        isLoading,
        isFetching,
        error,
        refetch: loadPlans
    } = useQuery({
        queryKey: ['mealPlans', patientId, nutritionistId],
        queryFn: async () => {
            if (!patientId) return { plans: [], activePlan: null, pendingDrafts: [] };
            const started = performance.now();

            const [plansResult, draftsResult] = await Promise.all([
                getMealPlans(patientId),
                nutritionistId ? getDraftMealPlans(patientId, nutritionistId) : Promise.resolve({ data: [] })
            ]);

            if (plansResult.error) throw plansResult.error;
            if (draftsResult.error) throw draftsResult.error;
            const today = getTodayIsoDate();
            const activeMeta = (plansResult.data || [])
                .filter(plan => plan.is_active && plan.start_date <= today && (!plan.end_date || plan.end_date >= today))
                .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0];
            const activeResult = activeMeta
                ? await getMealPlansByIds([activeMeta.id], [activeMeta])
                : { data: [], error: null };
            if (activeResult.error) throw activeResult.error;
            track(Events.DATA_LOAD_TIMING, { operation: 'meal_plan_open', duration_ms: Math.round(performance.now() - started) });

            return {
                plans: plansResult.data || [],
                activePlan: activeResult.data?.[0] || null,
                pendingDrafts: draftsResult.data || []
            };
        },
        enabled: !!patientId,
        staleTime: 30000, // 30 seconds cache to avoid unneeded refetches
        refetchOnWindowFocus: false, // Prevents aggressive refetching when switching tabs
    });

    return {
        plans: data?.plans || [],
        activePlan: data?.activePlan || null,
        pendingDrafts: data?.pendingDrafts || [],
        loading: isLoading, // Only true on initial load with no cache
        isFetching, // True whenever a background request is in flight
        error,
        loadPlans,
        // Utility to manually invalidate the cache and force a refetch
        invalidatePlans: () => {
            return queryClient.invalidateQueries({ queryKey: ['mealPlans', patientId, nutritionistId], exact: true });
        }
    };
}
