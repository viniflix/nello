import React from 'react';
import { DRI_ACTIVITY_LEVELS, driActivityOptionLabel, normalizeEnergySex } from '@/lib/utils/dri-energy';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Activity, Check, Dumbbell, Footprints, Sofa } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTIVITY_HELP = {
  inactive: { description: 'Rotina predominantemente sentada', Icon: Sofa },
  low_active: { description: 'Rotina leve e deslocamentos ocasionais', Icon: Footprints },
  active: { description: 'Atividade física frequente', Icon: Activity },
  very_active: { description: 'Treinos intensos ou trabalho físico', Icon: Dumbbell },
};

export default function DriActivitySelector({ value, onChange, protocol, gender, onEditBiometry }) {
  const hasSex = !!normalizeEnergySex(gender);
  return <div className="space-y-4">
    <div><Label id="dri-activity-label">Nível de atividade física *</Label><p className="mt-1 text-xs text-muted-foreground">Considere a rotina habitual e os exercícios do paciente.</p></div>
    <div role="radiogroup" aria-labelledby="dri-activity-label" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {DRI_ACTIVITY_LEVELS.map(item => {
        const { description, Icon } = ACTIVITY_HELP[item.id];
        const selected = value === item.id;
        return <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => onChange(item.id)}
          className={cn('relative flex min-h-20 items-start gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2', selected ? 'border-primary bg-primary-50 ring-1 ring-primary' : 'bg-white hover:border-primary/40 hover:bg-primary-50/40')}
        >
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground')}><Icon className="h-4 w-4" /></span>
          <span className="min-w-0"><span className="block text-sm font-semibold">{driActivityOptionLabel(item.id, protocol, gender)}</span><span className="mt-1 block text-xs leading-snug text-muted-foreground">{description}</span></span>
          {selected && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}
        </button>;
      })}
    </div>
    <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Sedentário (inativo)</strong> é uma categoria de rotina; o cálculo continua ativo.</p>
    {!hasSex && <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p>Informe o sexo na aba Biometria e TMB para calcular as DRIs{protocol === 'eer_iom' ? ' e o coeficiente PA' : ''}.</p>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onEditBiometry}>Preencher sexo na biometria</Button>
    </div>}
    <details className="rounded-lg border px-3 py-2 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">Como o nível de atividade entra no cálculo</summary><p className="mt-2 leading-relaxed">{protocol === 'dri_2023'
      ? 'DRIs 2023: o nível de atividade seleciona os coeficientes da equação. PAL: sedentário 1,00–<1,53; pouco ativo 1,53–<1,68; ativo 1,68–<1,85; muito ativo 1,85–<2,50.'
      : 'DRIs 2005: PA é o coeficiente por sexo aplicado aos termos de peso e altura. PAL: sedentário 1,00–<1,40; pouco ativo 1,40–<1,60; ativo 1,60–<1,90; muito ativo 1,90–<2,50.'} O fator não é reaplicado ao GET.</p></details>
  </div>;
}
