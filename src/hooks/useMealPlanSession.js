import { useCallback, useRef } from 'react';
import { useShadowDraft } from './useShadowDraft';

export function isMealPlanSession(value) {
    return value?.kind === 'meal-plan-session' && value.version === 1
        && value.formData && typeof value.formData === 'object' && Array.isArray(value.meals);
}

/** One complete, owner-scoped working session per patient. Never publishes a plan. */
export function useMealPlanSession({ ownerId, patientId }) {
    const draft = useShadowDraft({ ownerId, draftKey: patientId ? `meal-plan-session:${patientId}` : null, enabled: Boolean(ownerId && patientId) });
    const latest = useRef(null);
    const queueDraft = draft.queue;
    const queue = useCallback(value => {
        latest.current = value;
        queueDraft({ ...value, kind: 'meal-plan-session', version: 1 });
    }, [queueDraft]);
    return { ...draft, queue, latest };
}
