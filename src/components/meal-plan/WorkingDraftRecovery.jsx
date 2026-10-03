import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { removeMemoryDraft } from '@/lib/utils/memoryDrafts';

export async function trimWorkingDrafts(ownerId, drafts, limit) {
    const retained = drafts.slice(0, limit);
    for (const draft of drafts.slice(limit)) {
        // A concurrent change must not be deleted using stale list metadata.
        const { data, error } = await supabase.from('editor_shadow_drafts').delete()
            .eq('owner_id', ownerId).eq('id', draft.id).eq('revision', draft.revision)
            .select('id').maybeSingle();
        if (error || !data) throw new Error('Draft cleanup unconfirmed');
        removeMemoryDraft(`nello_shadow:${ownerId}:${draft.draft_key}`);
    }
    return retained;
}

export default function WorkingDraftRecovery({ ownerId, patientId, onResume, maxDrafts = 3 }) {
    const [drafts, setDrafts] = useState([]);
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const context = useRef({ ownerId, patientId });
    if (context.current.ownerId !== ownerId || context.current.patientId !== patientId) context.current = { ownerId, patientId };
    useEffect(() => { context.current = { ownerId, patientId }; return () => { context.current = {}; }; }, [ownerId, patientId]);
    useEffect(() => {
        setDrafts([]); setError(false); setExpanded(false); setBusy(null);
        if (!ownerId || !patientId) return undefined;
        let active = true;
        const load = async () => {
            const { data, error: failure } = await supabase.from('editor_shadow_drafts')
                .select('id,draft_key,updated_at,revision').eq('owner_id', ownerId)
                .or(`draft_key.like.meal-plan:${patientId}:%,draft_key.like.meal-plan-meal:${patientId}:%`)
                .order('updated_at', { ascending: false });
            if (!active) return;
            try {
                if (failure) throw failure;
                const retained = await trimWorkingDrafts(ownerId, data || [], maxDrafts);
                if (active) { setError(false); setDrafts(retained); }
            } catch { if (active) { setError(true); setDrafts((data || []).slice(0, maxDrafts)); } }
        };
        void load();
        const refresh = () => { void load(); };
        window.addEventListener('focus', refresh);
        return () => { active = false; window.removeEventListener('focus', refresh); };
    }, [ownerId, patientId, maxDrafts]);
    const resume = async (draft) => {
        const startedContext = context.current;
        setBusy(draft.id); setError(false);
        try {
            const { data, error: failure } = await supabase.from('editor_shadow_drafts')
                .select('id,draft_key,payload,updated_at').eq('owner_id', ownerId).eq('id', draft.id).single();
            if (context.current !== startedContext) return;
            if (failure || !data || ![`meal-plan:${patientId}:`, `meal-plan-meal:${patientId}:`].some(prefix => data.draft_key.startsWith(prefix))) throw new Error('Draft unavailable');
            await onResume(data);
        } catch { if (context.current === startedContext) setError(true); } finally { if (context.current === startedContext) setBusy(null); }
    };
    if (!drafts.length && !error) return null;
    return <section aria-label="Edições salvas para retomar" className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <h2 className="font-semibold">Continue de onde parou</h2>
        <p className="mb-3 text-sm">Edições salvas no servidor, incluindo refeições e alimentos ainda não aplicados ao plano.</p>
        {error && <p role="alert" className="mb-2 text-sm">Não foi possível recuperar a edição. Tente novamente; o rascunho foi preservado.</p>}
        <div className="flex flex-col gap-2">{drafts.slice(0, expanded ? drafts.length : 3).map(draft => <div key={draft.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-white p-3">
            <span className="text-sm">{draft.draft_key.includes(':food:') ? 'Alimento em edição' : draft.draft_key.startsWith('meal-plan-meal:') ? 'Refeição em edição' : 'Plano em edição'} · {new Date(draft.updated_at).toLocaleString('pt-BR')}</span>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => { void resume(draft); }}>{busy === draft.id ? 'Abrindo...' : 'Retomar edição'}</Button>
        </div>)}</div>
        {drafts.length > 3 && <Button type="button" variant="ghost" className="mt-2" onClick={() => setExpanded(value => !value)}>{expanded ? 'Mostrar menos' : `Ver todas as edições (${drafts.length})`}</Button>}
    </section>;
}
