import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';
import { Target, TrendingUp } from 'lucide-react';

const CHART_COLORS = {
  tmb: '#f97316',       // orange-500
  rotina: '#3b82f6',    // blue-500
  exercicios: '#22c55e', // green-500
  eta: '#eab308'        // yellow-500
};

/**
 * Painel de resultados com gráfico de composição do GET e meta final (VENTA).
 * Fatias: TMB, Rotina (fator de atividade), Exercícios (METs média diária), ETA (se ativado).
 *
 * @param {number|null} tmbResult - TMB em kcal (null se protocolo EER)
 * @param {number} getBase - GET base (TMB×FA×injúria ou valor EER)
 * @param {number} metsAverageDaily - Gasto médio diário das atividades METs
 * @param {boolean} etaEnabled - Se ETA está incluído
 * @param {number} etaKcal - Valor do ETA em kcal
 * @param {number|null} ventaAdjustmentKcal - Ajuste diário VENTA (positivo = déficit)
 * @param {number} finalPlannedKcal - Meta calórica final da dieta
 */
export default function EnergyExpenditureResultsPanel({
  tmbResult = 0,
  getBase = 0,
  metsAverageDaily = 0,
  etaEnabled = false,
  etaKcal = 0,
  ventaAdjustmentKcal = null,
  finalPlannedKcal = 0
}) {
  const isEer = tmbResult == null || tmbResult <= 0;
  const etaValue = etaEnabled ? etaKcal : 0;
  const getTotal = getBase + metsAverageDaily + etaValue;

  const chartData = useMemo(() => {
    const slices = [];
    if (isEer) {
      if (getBase > 0) slices.push({ name: 'GET base (EER)', value: Math.round(getBase), key: 'base' });
    } else {
      if (tmbResult > 0) slices.push({ name: 'TMB', value: Math.round(tmbResult), key: 'tmb' });
      const rotina = getBase - tmbResult;
      if (rotina > 0) slices.push({ name: 'Rotina (FA × injúria)', value: Math.round(rotina), key: 'rotina' });
    }
    if (metsAverageDaily > 0) slices.push({ name: 'Exercícios (média diária)', value: Math.round(metsAverageDaily), key: 'exercicios' });
    if (etaValue > 0) slices.push({ name: 'ETA', value: Math.round(etaValue), key: 'eta' });
    return slices;
  }, [isEer, tmbResult, getBase, metsAverageDaily, etaValue]);

  const hasChartData = chartData.length > 0 && chartData.some((d) => d.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Composição do Gasto Energético
        </CardTitle>
        <CardDescription>
          Distribuição do GET (TMB, rotina, exercícios e ETA). Abaixo, aplicação do VENTA para a meta final.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasChartData ? (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                label={({ name, value, percent }) =>
                  `${name}: ${value} kcal (${(percent * 100).toFixed(0)}%)`
                }
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={entry.key}
                    fill={
                      entry.key === 'tmb'
                        ? CHART_COLORS.tmb
                        : entry.key === 'rotina' || entry.key === 'base'
                          ? CHART_COLORS.rotina
                          : entry.key === 'exercicios'
                            ? CHART_COLORS.exercicios
                            : CHART_COLORS.eta
                    }
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value} kcal`, '']} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            Preencha biometria e protocolo para ver a composição.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">GET total</p>
            <p className="text-2xl font-bold">{Math.round(getTotal)} <span className="text-base font-normal">kcal/dia</span></p>
          </div>
          {ventaAdjustmentKcal != null && ventaAdjustmentKcal !== 0 && (
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Ajuste VENTA (diário)</p>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-400">
                {ventaAdjustmentKcal > 0 ? '-' : '+'}{Math.abs(ventaAdjustmentKcal).toFixed(0)} kcal
              </p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-lg border-2 border-primary/20 bg-primary/5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Meta calórica final da dieta</p>
              <p className="text-3xl font-bold text-primary">{Math.round(finalPlannedKcal)} kcal/dia</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
