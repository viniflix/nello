import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getMealPlanById } from '@/lib/supabase/meal-plan-queries';
import PlanMealsOverview from './PlanMealsOverview';
import PlanNutritionTotals from './PlanNutritionTotals';

export default function MealPlanPreviewDialog({ planId, patientId, onClose, onEdit }) {
    const [loadedState, setState] = useState({ plan: null, loading: true, error: false });
    const [retry, setRetry] = useState(0);
    const state = loadedState.plan?.id === planId || !loadedState.plan ? loadedState : {plan:null,loading:true,error:false};
    useEffect(() => {
        let active = true;
        setState({ plan: null, loading: true, error: false });
        if (!planId) return () => { active = false; };
        void getMealPlanById(planId).then(result => {
            if (!active) return;
            if (result.error || !result.data || (patientId && result.data.patient_id !== patientId)) throw new Error('Plan unavailable');
            setState({ plan: result.data, loading: false, error: false });
        }).catch(() => { if (active) setState({ plan: null, loading: false, error: true }); });
        return () => { active = false; };
    }, [planId, patientId, retry]);
    return <Dialog open={Boolean(planId)} onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="flex max-h-[92dvh] w-[96vw] max-w-5xl flex-col overflow-hidden bg-white">
        <DialogHeader className="shrink-0"><DialogTitle className="tracking-normal break-words pr-6">{state.plan?.name || 'Prévia do plano'}</DialogTitle><DialogDescription>Confira refeições e porções sem alterar o plano.</DialogDescription></DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
            {state.loading ? <p role="status" className="p-6 text-center">Carregando plano…</p> : state.error ? <div role="alert"><p>Não foi possível carregar a prévia.</p><Button variant="outline" className="mt-2" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button></div> : <>
                <PlanNutritionTotals plan={state.plan} />
                {state.plan.description && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{state.plan.description}</p>}
                <PlanMealsOverview meals={state.plan.meals || []} dailyCalories={state.plan.daily_calories} />
            </>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t pt-3"><Button variant="outline" onClick={onClose}>Fechar prévia</Button>{state.plan && <Button onClick={() => onEdit(planId)}>Editar este plano</Button>}</div>
    </DialogContent></Dialog>;
}
