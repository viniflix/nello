import React, { useState } from 'react';
import { SlidersHorizontal, BarChart3, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { roundedNutrition } from '@/lib/utils/mealPlanPresentation';
export default function QuickPortionAdjustment({ factor, onFactor, scope, onScope, mealId, onMeal, foodId, onFood, mealOptions, foodOptions, simulation, onApply, disabled }) {
    const [preview, setPreview] = useState(null);
    // A preview belongs to one exact set of inputs; changed inputs cannot apply an old simulation.
    const signature = JSON.stringify([factor, scope, mealId, foodId, simulation]);
    const currentPreview = preview === signature && simulation;
    const selectClass = 'h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-sm';
    const changeFactor = value => { onFactor(value); setPreview(null); };
    return <section aria-label="Ajuste rápido de porções" className="rounded-xl border border-l-2 border-l-primary bg-primary/[0.02] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-normal"><SlidersHorizontal aria-hidden="true" className="h-4 w-4 text-primary" />Ajuste rápido de porções</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Simule um fator de ajuste. As porções só mudam depois de aplicar.</p>
        <div className="mt-3 grid grid-cols-[80px_minmax(0,1fr)] items-end gap-3 sm:grid-cols-[100px_minmax(0,1fr)_auto]">
            <div className="space-y-1.5"><Label htmlFor="portion-factor" className="text-xs">Fator de ajuste</Label><Input id="portion-factor" name="portion-factor" type="number" min="0.3" max="3" step="0.05" value={factor} onChange={e => changeFactor(e.target.value)} disabled={disabled} /></div>
            <div className="min-w-0 space-y-1.5"><Label htmlFor="portion-scope" className="text-xs">Aplicar em</Label><select id="portion-scope" value={scope} onChange={e => onScope(e.target.value)} disabled={disabled} className={selectClass}><option value="all">Plano completo</option><option value="meal">Refeição específica</option><option value="food">Alimento específico</option></select></div>
            <Button type="button" variant="outline" className="col-span-2 gap-2 border-primary/30 bg-white text-primary sm:col-span-1" disabled={disabled || !simulation || factor === '' || Number(factor) < 0.3 || Number(factor) > 3} onClick={() => setPreview(signature)}><BarChart3 aria-hidden="true" className="h-4 w-4" />Simular ajuste</Button>
            {scope !== 'all' && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="portion-meal" className="text-xs">Refeição alvo</Label><select id="portion-meal" className={selectClass} value={mealId} onChange={e => onMeal(e.target.value)} disabled={disabled}>{mealOptions.map(meal => <option key={meal.id} value={meal.id}>{meal.name}</option>)}</select></div>}
            {scope === 'food' && <div className="space-y-1.5 sm:col-span-full"><Label htmlFor="portion-food" className="text-xs">Alimento alvo</Label><select id="portion-food" className={selectClass} value={foodId} onChange={e => onFood(e.target.value)} disabled={disabled || !foodOptions.length}>{foodOptions.length ? foodOptions.map(food => <option key={food.id} value={food.id}>{food.name}</option>) : <option value="">Sem alimentos nesta refeição</option>}</select></div>}
        </div>
        {currentPreview && <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/15 bg-white p-3"><div><p className="text-sm font-semibold text-primary">{roundedNutrition(simulation.totalsBefore.calories)} kcal → {roundedNutrition(simulation.totalsAfter.calories)} kcal</p><p className="mt-1 text-xs text-muted-foreground">{simulation.delta.calories > 0 ? '+' : ''}{roundedNutrition(simulation.delta.calories)} kcal · simulação, ainda não aplicada</p></div><Button type="button" size="sm" className="gap-2" onClick={() => { onApply(); setPreview(null); }} disabled={disabled || Math.abs(Number(factor) - 1) < 0.001}><Check className="h-4 w-4" />Aplicar ajuste ao plano</Button></div>}
    </section>;
}
