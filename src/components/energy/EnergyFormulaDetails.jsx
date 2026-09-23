import React from 'react';
import { Calculator, ExternalLink } from 'lucide-react';

const twoDecimals = value => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function EnergyFormulaDetails({ plan }) {
  if (!plan?.formula) return null;
  return <details className="group rounded-xl border bg-white text-sm shadow-sm">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-medium [&::-webkit-details-marker]:hidden">
      <span className="flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" />Validar fórmula e memória de cálculo</span>
      <span className="text-xs text-muted-foreground group-open:hidden">Ver detalhes</span>
      <span className="hidden text-xs text-muted-foreground group-open:inline">Ocultar</span>
    </summary>
    <div className="space-y-4 border-t p-4">
      <div><p className="font-semibold">{plan.formula.formulaName}</p><p className="mt-2 overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs leading-relaxed">{plan.formula.equationStr}</p></div>
      <p className="text-xs text-muted-foreground">P = peso (kg); A = altura (cm), A_m = altura (m); I = idade (anos). Resultados arredondados apenas na exibição.</p>
      <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valores aplicados</p><p className="overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">{plan.formula.appliedStr}</p></div>
      {plan.isHarris && plan.formula.terms && <div className="rounded-lg border p-3 text-xs leading-relaxed">
        <strong>Memória da TMB:</strong> constante {twoDecimals(plan.formula.terms.constant)} + peso {twoDecimals(plan.formula.terms.weight)} + altura {twoDecimals(plan.formula.terms.height)} − idade {twoDecimals(plan.formula.terms.age)} = <strong>{twoDecimals(plan.formula.terms.result)} kcal/dia</strong>.
      </div>}
      {plan.isHarris && plan.valid && plan.afterMobilityKcal != null && <div className="rounded-lg border p-3 text-xs leading-relaxed"><strong>Etapas Harris:</strong> TMB {twoDecimals(plan.tmbResult)} × mobilidade {twoDecimals(plan.mobilityFactor)} = {twoDecimals(plan.afterMobilityKcal)} kcal/dia; × injúria {twoDecimals(plan.injuryFactor)} = {twoDecimals(plan.getResult)} kcal/dia.</div>}
      <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-primary-50 p-3"><p className="text-xs text-primary-700">{plan.totalEquation}</p><p className="mt-1 font-mono text-xs font-semibold text-primary-900">{plan.appliedTotal}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Ajuste VENTA: (peso atual − peso-alvo) × 7.700 ÷ dias</p><p className="mt-1 font-mono text-xs font-semibold">{plan.finalEquation}</p></div></div>
      {plan.formula.sourceUrl && <a className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" href={plan.formula.sourceUrl} target="_blank" rel="noreferrer">Abrir referência científica <ExternalLink className="h-3.5 w-3.5" /></a>}
    </div>
  </details>;
}
