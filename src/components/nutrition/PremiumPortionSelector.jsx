import React, { useMemo, useEffect } from 'react';
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
  const { customMeasures = [], isLoading: loadingCustom } = useAllMeasures();
  const { data: foodMeasures = [], isLoading: loadingFood } = useFoodMeasures(food?.id);
  const isLoading = loadingCustom || loadingFood;

  // Determinar o code selecionado atualmente
  const selectedCode = useMemo(() => {
    const mid = value.measureId ?? value.measureCode;
    if (!mid || mid === 'gram') return 'gram';
    return String(mid);
  }, [value.measureId, value.measureCode]);

  // Cálculo de gramas totais
  const totalGrams = useMemo(() => {
    if (!food || !value.quantity) return 0;
    const qty = parseFloat(value.quantity) || 0;
    if (qty <= 0) return 0;

    if (selectedCode === 'gram') return qty;

    // Custom
    if (String(selectedCode).startsWith('custom_')) {
      const c = customMeasures.find(m => m.code === selectedCode);
      return c ? qty * (c.grams_equivalent || 0) : 0;
    }

    // Specific food measure (from new food_measures table)
    const specific = foodMeasures.find(fm => String(fm.id) === selectedCode);
    if (specific) {
      const g = specific.weight_in_grams || specific.quantity_grams || specific.grams || 0;
      return qty * g;
    }

    return qty;
  }, [selectedCode, value.quantity, food, foodMeasures, customMeasures]);

  // Cálculo Nutricional
  const nutrition = useMemo(() => {
    if (!food || totalGrams <= 0) return null;
    const m = totalGrams / 100;
    return {
      grams: totalGrams,
      calories: (food.calories || 0) * m,
      protein: (food.protein || 0) * m,
      carbs: (food.carbs || 0) * m,
      fat: (food.fat || 0) * m,
    };
  }, [food, totalGrams]);

  useEffect(() => {
    if (onNutritionChange && nutrition) onNutritionChange(nutrition);
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

  const handleValueChange = (code) => {
    let measureObj = null;
    if (code !== 'gram') {
      if (String(code).startsWith('custom_')) {
        measureObj = customMeasures.find(m => m.code === code);
      } else {
        // Encontrar a medida específica do alimento para injetar o nome completo
        const fm = foodMeasures.find(m => String(m.id) === code);
        if (fm) {
          measureObj = {
            id: fm.id,
            name: fm.label || fm.measure_label,
            grams_equivalent: fm.weight_in_grams || fm.quantity_grams || fm.grams
          };
        }
      }
    }

    onChange({
      ...value,
      measureId: code,
      measureCode: code,
      measure: measureObj ? { ...measureObj, source: code.startsWith('custom_') ? 'custom' : 'specific' } : null
    });
  };

  const getMeasureLabel = (code) => {
    if (code === 'gram') return 'g (gramas)';
    if (String(code).startsWith('custom_')) {
      const m = customMeasures.find(c => c.code === code);
      return m ? `${m.name} (Minha Medida)` : code;
    }
    const m = foodMeasures.find(s => String(s.id) === code);
    return m ? (m.label || m.measure_label) : code;
  };

  return (
    <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-200">
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Configurar Porção</Label>
        {totalGrams > 0 && (
          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
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
              onChange={(e) => onChange({ ...value, quantity: parseFloat(e.target.value) || 0 })}
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
                  <span className="text-[10px] text-slate-400 font-normal ml-auto italic">Padrão universal</span>
                </div>
              </SelectItem>

              {groups.specific && (
                <SelectGroup>
                  <SelectLabel className="px-2 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mt-2 border-t border-slate-50 pt-3">
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
                        <span className="text-[10px] text-emerald-600/70 font-normal leading-tight">
                          Equivale a {m.grams}g
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}

              {groups.custom && (
                <SelectGroup>
                  <SelectLabel className="px-2 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mt-2 border-t border-slate-50 pt-3">
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
                        <span className="text-[10px] text-emerald-600/70 font-normal leading-tight">
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

      {/* Info de Conversão Visual */}
      {selectedCode !== 'gram' && totalGrams > 0 && (
        <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100/50">
          <Info className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <p className="text-[11px] text-emerald-800 leading-none">
            Convertido para <span className="font-bold underline">{totalGrams.toFixed(0)}g</span> para cálculos nutricionais.
          </p>
        </div>
      )}
    </div>
  );
}

export default PremiumPortionSelector;
