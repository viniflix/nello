import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingDown, TrendingUp, Minus, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KCAL_PER_KG_BODY_CHANGE, calculateVentaAdjustment } from '@/lib/utils/energy-calculations';

/**
 * WeightProjectionCard Component
 *
 * Calcula e exibe projeção de mudança de peso. Aceita:
 * - dailyDeficit: déficit/superávit calórico diário (slider legado), ou
 * - Modo VENTA: ventaTargetWeight, ventaTimeframeDays, currentWeight, getResult → mostra diferença de peso, ajuste 7700 kcal/kg e valor calórico final recomendado.
 *
 * @param {number} [dailyDeficit=0] - Déficit calórico diário (negativo = déficit, positivo = superávit)
 * @param {number} [ventaTargetWeight] - Peso alvo (kg) para modo VENTA
 * @param {number} [ventaTimeframeDays] - Prazo em dias para modo VENTA
 * @param {number} [currentWeight] - Peso atual (kg) para modo VENTA
 * @param {number} [getResult] - GET em kcal/dia para exibir valor calórico final
 */
export default function WeightProjectionCard({
  dailyDeficit = 0,
  ventaTargetWeight,
  ventaTimeframeDays,
  currentWeight,
  getResult
}) {
  const venta = useMemo(() => {
    if (
      ventaTargetWeight != null &&
      ventaTimeframeDays != null &&
      ventaTimeframeDays > 0 &&
      currentWeight != null
    ) {
      return calculateVentaAdjustment(currentWeight, ventaTargetWeight, ventaTimeframeDays);
    }
    return null;
  }, [currentWeight, ventaTargetWeight, ventaTimeframeDays]);

  const effectiveDaily = venta ? venta.dailyAdjustmentKcal : dailyDeficit;

  const projections = useMemo(() => {
    if (effectiveDaily == null || effectiveDaily === 0) {
      return {
        weeklyMin: 0,
        weeklyMax: 0,
        weeklyAvg: 0,
        monthlyEstimate: 0,
        isLoss: false,
        isGain: false
      };
    }

    const isLoss = effectiveDaily > 0; // VENTA: positivo = déficit (perder)
    const weeklyChange = (Math.abs(effectiveDaily) * 7) / KCAL_PER_KG_BODY_CHANGE;
    const variation = weeklyChange * 0.1;
    const weeklyMin = Math.max(0, weeklyChange - variation);
    const weeklyMax = weeklyChange + variation;
    const monthlyEstimate = weeklyChange * 4.33;

    return {
      weeklyMin,
      weeklyMax,
      weeklyAvg: weeklyChange,
      monthlyEstimate,
      isLoss,
      isGain: !isLoss
    };
  }, [effectiveDaily]);

  const finalKcal = useMemo(() => {
    if (getResult == null || getResult <= 0) return null;
    if (venta) return getResult - venta.dailyAdjustmentKcal;
    return getResult;
  }, [getResult, venta]);

  if (ventaTargetWeight != null && ventaTimeframeDays != null && ventaTimeframeDays > 0 && !venta) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Informe peso atual para ver a projeção VENTA.</p>
        </CardContent>
      </Card>
    );
  }

  if (effectiveDaily === 0 && !venta) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Minus className="w-4 h-4" />
            <p className="text-sm">Preencha peso desejado e prazo (dias) ou ajuste o slider</p>
          </div>
        </CardContent>
      </Card>
    );
  }

    return (
        <Card className={cn(
            "border-2",
            projections.isLoss 
                ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20" 
                : "border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20"
        )}>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    {projections.isLoss ? (
                        <TrendingDown className="w-5 h-5 text-green-600" />
                    ) : (
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                    )}
                    Projeção de Mudança de Peso
                </CardTitle>
                <CardDescription className="text-xs">
                    {venta
                      ? `Diferença: ${(currentWeight - ventaTargetWeight).toFixed(1)} kg em ${ventaTimeframeDays} dias · ${KCAL_PER_KG_BODY_CHANGE} kcal/kg`
                      : `Baseado em ${Math.abs(effectiveDaily).toFixed(0)} kcal ${projections.isLoss ? 'de déficit' : 'de superávit'} diário`}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {venta && (
                  <div className={cn(
                    "p-3 rounded-lg text-center",
                    projections.isLoss ? "bg-green-50 dark:bg-green-950/20 border border-green-200" : "bg-blue-50 dark:bg-blue-950/20 border border-blue-200"
                  )}>
                    <p className="text-xs text-muted-foreground mb-1">Ajuste diário (VENTA)</p>
                    <p className="text-lg font-semibold">
                      {venta.isDeficit ? '-' : '+'}{Math.abs(venta.dailyAdjustmentKcal).toFixed(0)} kcal/dia
                    </p>
                    {finalKcal != null && (
                      <div className="mt-2 pt-2 border-t border-primary/20">
                        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                          <Target className="w-3.5 h-3.5" />
                          Valor calórico final recomendado
                        </p>
                        <p className="text-xl font-bold text-primary">{Math.round(finalKcal)} kcal/dia</p>
                      </div>
                    )}
                  </div>
                )}
                {/* Ritmo Semanal com Range */}
                <div className={cn(
                    "p-4 rounded-lg",
                    projections.isLoss 
                        ? "bg-green-100 dark:bg-green-900/30" 
                        : "bg-blue-100 dark:bg-blue-900/30"
                )}>
                    <p className="text-xs text-muted-foreground mb-2 text-center">Ritmo Estimado</p>
                    <p className={cn(
                        "text-2xl font-bold text-center",
                        projections.isLoss ? "text-green-700 dark:text-green-400" : "text-blue-700 dark:text-blue-400"
                    )}>
                        {projections.isLoss ? '-' : '+'}{projections.weeklyMin.toFixed(2)}kg - {projections.weeklyMax.toFixed(2)}kg
                    </p>
                    <p className="text-xs text-center text-muted-foreground mt-1">por semana</p>
                </div>

                {/* Estimativa Mensal */}
                <div className={cn(
                    "p-3 rounded-lg text-center",
                    projections.isLoss 
                        ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" 
                        : "bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800"
                )}>
                    <p className="text-xs text-muted-foreground mb-1">Em 1 mês</p>
                    <p className={cn(
                        "text-xl font-semibold",
                        projections.isLoss ? "text-green-700 dark:text-green-400" : "text-blue-700 dark:text-blue-400"
                    )}>
                        ~{projections.isLoss ? '-' : '+'}{projections.monthlyEstimate.toFixed(1)} kg
                    </p>
                </div>
                
                {/* Disclaimer Clínico */}
                <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground text-center leading-relaxed">
                        <span className="font-medium">⚠️ Estimativa matemática.</span> Resultados variam conforme adesão, metabolismo e adaptação metabólica.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

