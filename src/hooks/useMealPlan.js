import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMealPlans, getActiveMealPlan, getDraftMealPlans } from '@/lib/supabase/meal-plan-queries';
import { Events, track } from '@/infrastructure/analytics/posthog';

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

            const [plansResult, activeResult, draftsResult] = await Promise.all([
                getMealPlans(patientId),
                getActiveMealPlan(patientId),
                nutritionistId ? getDraftMealPlans(patientId, nutritionistId) : Promise.resolve({ data: [] })
            ]);

            if (plansResult.error) throw plansResult.error;
            if (activeResult.error) throw activeResult.error;
            if (draftsResult.error) throw draftsResult.error;
            track(Events.DATA_LOAD_TIMING, { operation: 'meal_plan_open', duration_ms: Math.round(performance.now() - started) });

            return {
                plans: plansResult.data || [],
                activePlan: activeResult.data || null,
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
