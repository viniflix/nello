import { useCallback, useEffect, useRef, useState } from 'react';
import { useShadowDraft } from './useShadowDraft';

export function isMealPlanSession(value) {
    return value?.kind === 'meal-plan-session' && value.version === 1
        && value.formData && typeof value.formData === 'object' && Array.isArray(value.meals);
}

export function latestAppliedAt(plans) {
    return plans.filter(plan => !plan.is_draft && !plan.is_template)
        .map(plan => plan.updated_at || plan.created_at).filter(value => Number.isFinite(Date.parse(value)))
        .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
}

export function sessionWasSuperseded(saved, plans, savedAt, currentPlan) {
    if (currentPlan && !currentPlan.is_draft && saved.baseRevision && currentPlan.updated_at !== saved.baseRevision) return true;
    const appliedAt = latestAppliedAt(plans);
    if (!appliedAt) return false;
    // New sessions remember the clinical baseline, independent of later autosaves.
    const baseline = Object.hasOwn(saved, 'baselineAppliedAt') ? saved.baselineAppliedAt : savedAt;
    return !baseline || !Number.isFinite(Date.parse(baseline)) || Date.parse(appliedAt) > Date.parse(baseline);
}

const withoutHistory = value => { const { history: _history, ...snapshot } = value; return snapshot; };

/** One complete, owner-scoped working session per patient. Never publishes a plan. */
export function useMealPlanSession({ ownerId, patientId }) {
    const confirmedRef = useRef([]);
    const [snapshots, setSnapshots] = useState([]);
    const preparePayload = value => ({ ...withoutHistory(value), history: confirmedRef.current.slice(0, 2) });
    const onSaved = (value, data) => {
        const copies = [{ ...withoutHistory(value), savedAt: data.updated_at }, ...(value.history || [])].slice(0, 3);
        confirmedRef.current = copies;
        setSnapshots(copies);
    };
    const draft = useShadowDraft({ ownerId, draftKey: patientId ? `meal-plan-session:${patientId}` : null, enabled: Boolean(ownerId && patientId), preparePayload, onSaved });
    useEffect(() => { confirmedRef.current = []; setSnapshots([]); }, [ownerId, patientId]);
    useEffect(() => {
        if (!isMealPlanSession(draft.recovery?.payload)) return;
        const value = draft.recovery.payload;
        const copies = [{ ...withoutHistory(value), savedAt: draft.lastSavedAt }, ...(value.history || []).filter(isMealPlanSession)].slice(0, 3);
        confirmedRef.current = copies;
        setSnapshots(copies);
    }, [draft.recovery, draft.lastSavedAt]);
    const latest = useRef(null);
    const queueDraft = draft.queue;
    const queue = useCallback(value => {
        latest.current = value;
        queueDraft({ ...value, kind: 'meal-plan-session', version: 1 });
    }, [queueDraft]);
    const discardDraft = draft.discard;
    const discard = useCallback(async () => {
        if (!(await discardDraft())) return false;
        confirmedRef.current = []; setSnapshots([]);
        return true;
    }, [discardDraft]);
    return { ...draft, queue, latest, snapshots, discard };
}
