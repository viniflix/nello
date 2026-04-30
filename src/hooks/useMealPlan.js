import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMealPlans, getActiveMealPlan, getDraftMealPlans } from '@/lib/supabase/meal-plan-queries';

export function useMealPlan(patientId, nutritionistId) {
    const queryClient = useQueryClient();

    const {
        data,
        isLoading,
        isFetching,
        refetch: loadPlans
    } = useQuery({
        queryKey: ['mealPlans', patientId, nutritionistId],
        queryFn: async () => {
            if (!patientId) return { plans: [], activePlan: null, pendingDrafts: [] };

            const [plansResult, activeResult, draftsResult] = await Promise.all([
                getMealPlans(patientId),
                getActiveMealPlan(patientId),
                nutritionistId ? getDraftMealPlans(patientId, nutritionistId) : Promise.resolve({ data: [] })
            ]);

            if (plansResult.error) throw plansResult.error;

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
        loadPlans,
        // Utility to manually invalidate the cache and force a refetch
        invalidatePlans: () => {
            queryClient.invalidateQueries(['mealPlans', patientId, nutritionistId]);
        }
    };
}
