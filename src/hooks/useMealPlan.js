import {queryRead} from '@/lib/utils/readPolicy';
import { useQueryResource } from '@/hooks/useQueryResource';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMealPlans, getMealPlansByIds, getDraftMealPlans } from '@/lib/supabase/meal-plan-queries';
import { Events, track } from '@/infrastructure/analytics/posthog';
import { getTodayIsoDate } from '@/lib/utils/date';

export function useMealPlan(patientId, nutritionistId) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['mealPlans', patientId, nutritionistId],
        queryFn: queryRead(async ({signal}) => {
            if (!patientId) return { plans: [], activePlan: null, pendingDrafts: [] };
            const started = performance.now();

            const [plansResult, draftsResult] = await Promise.all([
                getMealPlans(patientId, undefined, {signal}),
                nutritionistId ? getDraftMealPlans(patientId, nutritionistId, {signal}) : Promise.resolve({ data: [] })
            ]);

            if (plansResult.error) throw plansResult.error;
            if (draftsResult.error) throw draftsResult.error;
            const today = getTodayIsoDate();
            const activeMeta = (plansResult.data || [])
                .filter(plan => plan.is_active && plan.start_date <= today && (!plan.end_date || plan.end_date >= today))
                .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0];
            const activeResult = activeMeta
                ? await getMealPlansByIds([activeMeta.id], [activeMeta],{signal:signal})
                : { data: [], error: null };
            if (activeResult.error) throw activeResult.error;
            track(Events.DATA_LOAD_TIMING, { operation: 'meal_plan_open', duration_ms: Math.round(performance.now() - started) });

            return {
                plans: plansResult.data || [],
                activePlan: activeResult.data?.[0] || null,
                pendingDrafts: draftsResult.data || []
            };
        }),
        enabled: !!patientId,
        staleTime: 30000, // 30 seconds cache to avoid unneeded refetches
        refetchOnWindowFocus: false, // Prevents aggressive refetching when switching tabs
    });

    const resource = useQueryResource(query, JSON.stringify([nutritionistId, patientId]));
    const data = resource.data;
    return {
        resource, plans: data?.plans || [],
        activePlan: data?.activePlan || null,
        pendingDrafts: data?.pendingDrafts || [],
        loading: resource.initialLoading, // Only true on initial load with no cache
        isFetching: query.isFetching, // True whenever a background request is in flight
        error: query.error,
        loadPlans: query.refetch,
        // Utility to manually invalidate the cache and force a refetch
        invalidatePlans: () => {
            return queryClient.invalidateQueries({ queryKey: ['mealPlans', patientId, nutritionistId], exact: true });
        }
    };
}
