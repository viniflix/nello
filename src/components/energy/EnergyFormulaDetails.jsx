import React from 'react';

export default function EnergyFormulaDetails({ plan }) {
  if (!plan?.formula) return null;
  return <details className="rounded-lg border p-4 text-sm space-y-3">
    <summary className="cursor-pointer font-medium">Como o resultado foi calculado</summary>
    <p className="font-medium">{plan.formula.formulaName}</p>
    <p className="font-mono break-words">{plan.formula.equationStr}</p>
    <p className="text-xs text-muted-foreground">P = peso (kg); A = altura (cm), A_m = altura (m); I = idade (anos). Resultados arredondados apenas na exibição.</p>
    <p className="font-mono break-words">{plan.formula.appliedStr}</p>
    <p>{plan.totalEquation}</p><p className="font-mono">{plan.appliedTotal}</p>
    <p className="text-xs text-muted-foreground">Ajuste VENTA = (peso atual − peso-alvo) × 7.700 ÷ dias. Positivo: déficit; negativo: superávit. Sem meta de peso: ajuste zero.</p>
    <p className="font-mono">{plan.finalEquation}</p>
    {plan.formula.sourceUrl && <a className="text-primary underline" href={plan.formula.sourceUrl} target="_blank" rel="noreferrer">Referência da fórmula</a>}
  </details>;
}
