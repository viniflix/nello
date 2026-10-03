import React, { useMemo, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import CustomMeasureFormDialog from '@/components/nutritionist/CustomMeasureFormDialog';
import { useCreateCustomMeasure } from '@/hooks/useCustomMeasures';
import { calculateNutrition, foodPer100Grams } from '@/lib/utils/nutrition-calculations';
import { isGramUnit, portionGrams, changePortionMeasure } from '@/lib/utils/foodPortions';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { useFoodMeasures } from '@/hooks/useFoodMeasures';
import { useAllMeasures } from '@/hooks/useHouseholdMeasures';
import {
  Scale,
  Star,
  User,
  Utensils,
  Info
} from 'lucide-react';

/**
 * PremiumPortionSelector — Seletor de Porção de Alta Performance e UX
 *
 * Atualizado para a nova arquitetura do banco:
 * Mostra APENAS gramas e as medidas específicas do alimento,
 * eliminando listas genéricas incorretas.
 */
export function PremiumPortionSelector({
  food,
  value = { quantity: 100, measureId: null, measureCode: 'gram' },
  onChange,
  showNutrition = true,
  onNutritionChange = null,
}) {
  const { customMeasures = [], isLoading: loadingCustom, refetch } = useAllMeasures();
  const [creatingMeasure, setCreatingMeasure] = useState(false);
  const createMeasure = useCreateCustomMeasure();
  const { data: foodMeasures = [], isLoading: loadingFood } = useFoodMeasures(food?.id);
  const isLoading = loadingCustom || loadingFood;

  // Determinar o code selecionado atualmente
  const selectedCode = useMemo(() => {
    const mid = value.measureId ?? value.measureCode;
    if (isGramUnit(mid)) return 'gram';
    return String(mid);
  }, [value.measureId, value.measureCode]);

  // Cálculo de gramas totais
  const measures = useMemo(() => [...customMeasures, ...foodMeasures.map(m => ({ ...m, name: m.label || m.measure_label, source: 'specific' }))], [customMeasures, foodMeasures]);
  const totalGrams = useMemo(() => portionGrams(value.quantity, selectedCode, measures, value.measure), [selectedCode, value.quantity, value.measure, measures]);

  // Cálculo Nutricional
  const nutrition = useMemo(() => {
    if (!food || totalGrams === null) return null;
    const normalized = foodPer100Grams(food);
    return normalized ? calculateNutrition(normalized, totalGrams) : null;
  }, [food, totalGrams]);

  useEffect(() => {
    if (onNutritionChange) onNutritionChange(nutrition);
  }, [nutrition, onNutritionChange]);

  // Agrupamento
  const groups = useMemo(() => {
    const grouped = {};

    // Medidas do Alimento (Banco Novo)
    if (foodMeasures.length > 0) {
      grouped.specific = foodMeasures.map(m => ({
        code: String(m.id),
        name: m.label || m.measure_label,
        grams: m.weight_in_grams || m.quantity_grams || m.grams,
        source: 'specific'
      }));
    }

    // Custom Measures (Nutricionista)
    if (customMeasures.length > 0) {
      grouped.custom = customMeasures.map(m => ({ ...m, source: 'custom' }));
    }

    return grouped;
  }, [customMeasures, foodMeasures]);

  const handleValueChange = code => onChange(changePortionMeasure(value, code, measures));
  const handleCreateMeasure = async payload => {
    try {
      const result = await createMeasure.mutateAsync(payload);
      const measure = { ...result.data, source: 'custom' };
      onChange(changePortionMeasure(value, measure.code, [...measures, measure]));
      await refetch();
      setCreatingMeasure(false);
    } catch { /* Mutation displays the error and keeps the form open. */ }
  };

  const getMeasureLabel = (code) => {
    if (code === 'gram') return 'g (gramas)';
    if (String(code).startsWith('custom_')) {
      const m = customMeasures.find(c => c.code === code);
      return m ? `${m.name} (Minha Medida)` : (value.measure?.name || 'Medida indisponível');
    }
    const m = foodMeasures.find(s => String(s.id) === code);
    return m ? (m.label || m.measure_label) : (value.measure?.name || 'Medida indisponível');
  };

  return (
    <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-200">
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Configurar Porção</Label>
        {totalGrams > 0 && (
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
            Total: {totalGrams.toFixed(0)}g
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {/* Quantidade */}
        <div className="flex-1 sm:flex-none sm:w-32">
          <div className="relative">
            <Input
              type="number"
              value={value.quantity}
              onChange={(e) => onChange({ ...value, quantity: e.target.value })}
              className="h-12 text-lg font-bold pl-4 pr-10 rounded-xl border-slate-200 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
              placeholder="0"
              min={0}
              step={0.5}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none font-medium">
              #
            </div>
          </div>
        </div>

        {/* Medida */}
        <div className="flex-[2]">
          <Select value={selectedCode} onValueChange={handleValueChange} disabled={!food || isLoading}>
            <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white hover:border-emerald-200 transition-all focus:ring-emerald-500">
              <div className="flex items-center gap-2 truncate">
                {selectedCode === 'gram' ? <Scale className="w-4 h-4 text-slate-400" /> :
                 selectedCode.startsWith('custom_') ? <User className="w-4 h-4 text-emerald-500" /> :
                 <Utensils className="w-4 h-4 text-emerald-600" />}
                <span className="font-medium text-slate-700 truncate">{getMeasureLabel(selectedCode)}</span>
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-[350px] rounded-xl shadow-xl border-slate-200">
              <SelectItem value="gram" className="h-11 rounded-lg focus:bg-emerald-50 focus:text-emerald-700 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 opacity-50" />
                  <span className="font-semibold text-slate-800">g (Gramas)</span>
                  <span className="text-xs text-slate-400 font-normal ml-auto italic">Padrão universal</span>
                </div>
              </SelectItem>

              {groups.specific && (
                <SelectGroup>
                  <SelectLabel className="px-2 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mt-2 border-t border-slate-50 pt-3">
                    <Utensils className="w-3.5 h-3.5" />
                    Medidas do Alimento
                  </SelectLabel>
                  {groups.specific.map(m => (
                    <SelectItem
                      key={m.code}
                      value={m.code}
                      className="h-12 rounded-lg cursor-pointer focus:bg-emerald-50 focus:text-emerald-800"
                    >
                      <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between w-full pr-1">
                          <span className="font-medium text-emerald-800">
                            {m.name}
                          </span>
                          <span title="Medida mapeada p/ este alimento" className="cursor-help">
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0 ml-2" />
                          </span>
                        </div>
                        <span className="text-xs text-emerald-600/70 font-normal leading-tight">
                          Equivale a {m.grams}g
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}

              {groups.custom && (
                <SelectGroup>
                  <SelectLabel className="px-2 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mt-2 border-t border-slate-50 pt-3">
                    <User className="w-3.5 h-3.5" />
                    Minhas Medidas
                  </SelectLabel>
                  {groups.custom.map(m => (
                    <SelectItem
                      key={m.code}
                      value={m.code}
                      className="h-12 rounded-lg cursor-pointer focus:bg-emerald-50 focus:text-emerald-800"
                    >
                      <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between w-full pr-1">
                          <span className="font-medium text-emerald-700">
                            {m.name}
                          </span>
                        </div>
                        <span className="text-xs text-emerald-600/70 font-normal leading-tight">
                          Equivale a {m.grams_equivalent}g
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}

            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={() => setCreatingMeasure(true)}>+ Criar medida personalizada</Button>
      <CustomMeasureFormDialog open={creatingMeasure} onOpenChange={setCreatingMeasure} onSave={handleCreateMeasure} isSaving={createMeasure.isPending} />
      {totalGrams === null && <p role="alert" className="text-sm text-destructive">Selecione uma medida com equivalência em gramas para calcular a porção.</p>}
      {/* Info de Conversão Visual */}
      {selectedCode !== 'gram' && totalGrams > 0 && (
        <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100/50">
          <Info className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <p className="text-xs text-emerald-800 leading-none">
            Convertido para <span className="font-bold underline">{totalGrams.toFixed(0)}g</span> para cálculos nutricionais.
          </p>
        </div>
      )}
    </div>
  );
}

export default PremiumPortionSelector;
