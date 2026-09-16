import React from 'react';
import { DRI_ACTIVITY_LEVELS, driActivityOptionLabel, normalizeEnergySex } from '@/lib/utils/dri-energy';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default function DriActivitySelector({ value, onChange, protocol, gender, onEditBiometry }) {
  const hasSex = !!normalizeEnergySex(gender);
  return <div className="space-y-3">
    <Label htmlFor="dri-activity">Nível de atividade física</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id="dri-activity" aria-label="Atividade nas DRIs">
        <SelectValue placeholder="Selecione o nível de atividade" />
      </SelectTrigger>
      <SelectContent>{DRI_ACTIVITY_LEVELS.map(item => <SelectItem key={item.id} value={item.id}>
        {driActivityOptionLabel(item.id, protocol, gender)}
      </SelectItem>)}</SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">Sedentário (inativo) descreve a rotina do paciente; não significa que o cálculo está desativado. Escolha a categoria avaliada, incluindo as atividades habituais e os exercícios.</p>
    {!hasSex && <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p>Informe o sexo na aba Biometria e TMB para calcular as DRIs{protocol === 'eer_iom' ? ' e o coeficiente PA' : ''}.</p>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onEditBiometry}>Preencher sexo na biometria</Button>
    </div>}
    <p className="text-xs text-muted-foreground">{protocol === 'dri_2023'
      ? 'DRIs 2023: o nível de atividade seleciona os coeficientes da equação. PAL: sedentário 1,00–<1,53; pouco ativo 1,53–<1,68; ativo 1,68–<1,85; muito ativo 1,85–<2,50.'
      : 'DRIs 2005: PA é o coeficiente por sexo aplicado aos termos de peso e altura. PAL: sedentário 1,00–<1,40; pouco ativo 1,40–<1,60; ativo 1,60–<1,90; muito ativo 1,90–<2,50.'} O fator não é reaplicado ao GET.</p>
  </div>;
}
