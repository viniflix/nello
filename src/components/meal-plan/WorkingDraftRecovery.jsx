import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';

export default function WorkingDraftRecovery({ ownerId, patientId, onResume }) {
    const [drafts, setDrafts] = useState([]);
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(null);
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
        setDrafts([]); setError(false); setExpanded(false);
        if (!ownerId || !patientId) return undefined;
        let active = true;
        const load = async () => {
            const { data, error: failure } = await supabase.from('editor_shadow_drafts')
                .select('id,draft_key,updated_at').eq('owner_id', ownerId)
                .or(`draft_key.like.meal-plan:${patientId}:%,draft_key.like.meal-plan-meal:${patientId}:%`)
                .order('updated_at', { ascending: false });
            if (active) { setError(Boolean(failure)); setDrafts(data || []); }
        };
        void load();
        const refresh = () => { void load(); };
        window.addEventListener('focus', refresh);
        return () => { active = false; window.removeEventListener('focus', refresh); };
    }, [ownerId, patientId]);
    const resume = async (draft) => {
        setBusy(draft.id); setError(false);
        try {
            const { data, error: failure } = await supabase.from('editor_shadow_drafts')
                .select('id,draft_key,payload,updated_at').eq('owner_id', ownerId).eq('id', draft.id).single();
            if (failure || !data || ![`meal-plan:${patientId}:`, `meal-plan-meal:${patientId}:`].some(prefix => data.draft_key.startsWith(prefix))) throw new Error('Draft unavailable');
            await onResume(data);
        } catch { setError(true); } finally { setBusy(null); }
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
