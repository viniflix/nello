import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import FoodSelector from './FoodSelector';
import { PremiumPortionSelector } from '@/components/nutrition';
import { calculateEquivalentGrams } from '@/lib/utils/nutritionCalculations';
import { calculateNutrition, foodPer100Grams } from '@/lib/utils/nutrition-calculations';
import { portionGrams, isGramUnit } from '@/lib/utils/foodPortions';
import { formatQuantityWithUnit } from '@/lib/utils/measureTranslations';

export function substitutionNutrition(substitute) {
  const grams = portionGrams(substitute.quantity ?? 100, substitute.unit, [], substitute.measure || substitute.measure_snapshot);
  const food = foodPer100Grams(substitute);
  return grams !== null && food ? calculateNutrition(food, grams) : null;
}
const nutrientFields = [['calories','Energia','kcal'], ['protein','Proteínas','g'], ['carbs','Carboidratos','g'], ['fat','Gorduras','g']];

const SubstitutionDialog = ({ isOpen, onClose, originalFood, initialSubstitutes = [], onSave }) => {
  const [substitutes, setSubstitutes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  useEffect(() => {
    if (isOpen) {
      setSubstitutes(initialSubstitutes || []);
      setSelectedId(initialSubstitutes?.[0]?.id ?? null);
    }
    // Opening starts one working copy; parent renders must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, originalFood?.id, originalFood?.tempId]);
  const selected = substitutes.find(sub => sub.id === selectedId);
  const nutrition = selected ? substitutionNutrition(selected) : null;
  const addSubstitute = food => {
    if (!substitutes.some(sub => sub.id === food.id)) {
      setSubstitutes(previous => [...previous, {
        ...food, quantity: Number(calculateEquivalentGrams(Number(originalFood?.calories || 0), food).toFixed(2)), unit: 'gram', measure: null,
      }]);
    }
    setSelectedId(food.id);
  };
  const remove = id => {
    const remaining = substitutes.filter(sub => sub.id !== id);
    setSubstitutes(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);
  };
  const save = () => { onSave(substitutes); onClose(); };

  return <>
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[94dvh] w-[96vw] max-w-[1440px] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Substituições de alimento</DialogTitle>
          <DialogDescription>Escolha alternativas e ajuste cada porção. A comparação usa a quantidade prescrita, convertida em gramas.</DialogDescription>
        </DialogHeader>
        <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <div className="font-semibold">{originalFood?.patient_description || originalFood?.food?.name}</div>
          <div className="text-sm text-muted-foreground">Porção original: {formatQuantityWithUnit(originalFood?.quantity ?? 0, originalFood?.unit, originalFood?.measure || originalFood?.measure_snapshot)}</div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {nutrientFields.map(([field,label,unit]) => <span key={field}>{label}: <strong>{Math.round(Number(originalFood?.[field] || 0))} {unit}</strong></span>)}
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:overflow-hidden">
          <section className="min-h-[360px] min-w-0 lg:min-h-0">
            <FoodSelector embedded isOpen={isOpen} onClose={() => {}} onSelect={addSubstitute} targetGroup={originalFood?.food?.group} targetCalories={originalFood?.calories} originalFood={originalFood} selectedFoodId={selectedId} />
          </section>
          <section className="min-h-0 space-y-4 overflow-y-auto rounded-xl border border-primary/20 bg-white p-4">
            <h3 className="text-sm font-semibold text-primary">2 · Sua lista de alternativas ({substitutes.length})</h3>
            <div className="space-y-2">
              {!substitutes.length && <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Adicione alimentos para montar a lista de substituições.</p>}
              {substitutes.map(sub => {
                const totals = substitutionNutrition(sub);
                return <div key={sub.id} className={`flex items-start gap-2 rounded-lg border p-3 ${selectedId===sub.id ? 'border-primary bg-primary/5' : ''}`}>
                  <button type="button" className="min-w-0 flex-1 text-left" aria-pressed={selectedId===sub.id} onClick={() => setSelectedId(sub.id)}>
                    <span className="block font-medium">{sub.name}</span>
                    <span className="block text-sm text-muted-foreground">{formatQuantityWithUnit(sub.quantity ?? 100, sub.unit, sub.measure || sub.measure_snapshot)}{totals ? ` · ${Math.round(totals.calories)} kcal` : ' · Selecione a medida'}</span>
                  </button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remover substituto ${sub.name}`} onClick={() => remove(sub.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>;
              })}
            </div>
            {selected ? <>
              <h3 className="text-lg font-semibold">{selected.name}</h3>
              <PremiumPortionSelector food={selected} value={{quantity: selected.quantity ?? 100, measureId: isGramUnit(selected.unit) ? 'gram' : selected.unit, measure: selected.measure || selected.measure_snapshot}}
                onChange={value => setSubstitutes(previous => previous.map(sub => sub.id===selected.id ? {...sub,quantity:value.quantity,unit:value.measureCode,measure:value.measure} : sub))} />
              <h4 className="font-medium">Comparação das porções</h4>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead><tr className="border-b"><th className="py-2">Nutriente</th><th>Original</th><th>Alternativa</th><th>Diferença</th></tr></thead>
                <tbody>{nutrientFields.map(([field,label,unit]) => {
                  const base = Number(originalFood?.[field] || 0);
                  const alternative = nutrition?.[field];
                  const diff = alternative == null ? null : alternative-base;
                  return <tr key={field} className="border-b"><td className="py-3">{label}</td><td>{Math.round(base)} {unit}</td><td>{alternative == null ? '—' : `${Math.round(alternative)} ${unit}`}</td><td>{diff===null ? '—' : `${diff>0 ? '+' : ''}${Math.round(diff)} ${unit}`}</td></tr>;
                })}</tbody>
              </table></div>
              <p className="text-sm text-muted-foreground">A quantidade inicial aproxima a energia da porção original. Confira também os macronutrientes antes de salvar.</p>
            </> : <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-muted-foreground"><Plus className="h-8 w-8" /><p>Adicione ou selecione uma alternativa para editar.</p></div>}
          </section>
        </div>
        <DialogFooter className="shrink-0 border-t pt-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={save} disabled={substitutes.some(sub => !substitutionNutrition(sub))}>Salvar substituições</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
};
export default SubstitutionDialog;
