import { downloadSavedClinicalPdf } from '@/lib/pdf/savedClinicalPdf';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import MealPlanView from './MealPlanView';
import PlanNutritionTotals from '@/components/meal-plan/PlanNutritionTotals';
import { displayNumber, formatMealPlanDate as formatCivilDate } from '@/lib/utils/mealPlanPresentation';

export default function MealPlanViewDialog({ open, onOpenChange, mealPlan, onCloseAutoFocus }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  if (!mealPlan) return null;
  const meals = mealPlan.meal_plan_meals || [];
  const totals = meals.filter(meal => meal.include_in_totals !== false).reduce((result, meal) => {
    for (const food of meal.meal_plan_foods || []) for (const key of ['calories','protein','carbs','fat']) result[`daily_${key}`] += displayNumber(food[key]);
    return result;
  }, {daily_calories:0,daily_protein:0,daily_carbs:0,daily_fat:0});
  const exportPDF = async () => {
    setExporting(true);setExportError(false);
    try { await downloadSavedClinicalPdf('mealPlanId',mealPlan.id); }
    catch(error) { logDiagnostic('error','patient_meal_plan_pdf',error?.code || 'unknown');setExportError(true); }
    finally {setExporting(false);}
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent onCloseAutoFocus={onCloseAutoFocus} className="flex max-h-[92dvh] w-[96vw] max-w-5xl flex-col overflow-hidden bg-white">
    <DialogHeader className="shrink-0"><DialogTitle className="tracking-normal break-words pr-6">{mealPlan.name || 'Meu plano alimentar'}</DialogTitle><DialogDescription>De {formatCivilDate(mealPlan.start_date) || 'início não informado'} até {mealPlan.end_date ? formatCivilDate(mealPlan.end_date) : 'prazo indeterminado'}.</DialogDescription></DialogHeader>
    <div role="region" aria-label="Refeições e detalhes do plano" tabIndex={0} className="min-h-0 space-y-4 overflow-y-auto pr-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><PlanNutritionTotals plan={{...totals, meals:meals.map(meal => ({...meal, foods:meal.meal_plan_foods || []}))}} />{mealPlan.description && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{mealPlan.description}</p>}<MealPlanView mealPlanItems={meals} showNutrition /></div>
    {exportError && <p role="alert" className="text-sm text-destructive">Não foi possível gerar o PDF. Confira sua conexão e tente novamente.</p>}
    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t pt-3"><Button variant="outline" onClick={() => onOpenChange(false)}>Fechar plano</Button><Button className="gap-2" disabled={exporting} onClick={exportPDF}><Download className="h-4 w-4" />{exporting ? 'Gerando PDF…' : 'Baixar PDF'}</Button></div>
  </DialogContent></Dialog>;
}
