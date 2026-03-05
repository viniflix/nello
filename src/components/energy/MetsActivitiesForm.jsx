import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Flame } from 'lucide-react';
import { searchPhysicalActivities } from '@/lib/constants/physical-activities';
import {
  calculateActivityExpenditure,
  sumMetsActivitiesAverageDaily
} from '@/lib/utils/energy-calculations';

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Por dia' },
  { value: 'weekly', label: 'Por semana' },
  { value: 'monthly', label: 'Por mês' }
];

function generateId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Formulário de atividades METs com frequência (diária/semanal/mensal) e autocomplete.
 * Contrato do item: id, name, met, duration_min, frequency_value, frequency_type, kcal_per_session, average_daily_kcal.
 */
export default function MetsActivitiesForm({ activities = [], onChange, weightKg }) {
  const [openCombo, setOpenCombo] = useState(null); // index of row for which combobox is open
  const [search, setSearch] = useState({}); // { [index]: string }
  const weight = weightKg || 0;

  const { totalAverageDailyKcal, items } = useMemo(
    () => sumMetsActivitiesAverageDaily(activities, weight),
    [activities, weight]
  );

  const addActivity = () => {
    onChange([
      ...activities,
      {
        id: generateId(),
        name: '',
        met: 3,
        duration_min: 30,
        frequency_value: 3,
        frequency_type: 'weekly'
      }
    ]);
  };

  const removeActivity = (index) => {
    onChange(activities.filter((_, i) => i !== index));
    setOpenCombo(null);
  };

  const updateActivity = (index, field, value) => {
    const next = [...activities];
    if (!next[index]) return;
    const numFields = ['met', 'duration_min', 'frequency_value', 'kcal_per_session', 'average_daily_kcal'];
    next[index] = {
      ...next[index],
      [field]: numFields.includes(field) ? (Number(value) || 0) : value
    };
    onChange(next);
  };

  const selectActivity = (index, activity) => {
    updateActivity(index, 'name', activity.name);
    updateActivity(index, 'met', activity.met);
    setOpenCombo(null);
    setSearch((s) => ({ ...s, [index]: '' }));
  };

  const searchResults = (index) => {
    const q = search[index] ?? '';
    return searchPhysicalActivities(q);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Flame className="w-4 h-4" />
          Atividades físicas (METs)
        </CardTitle>
        <CardDescription>
          Selecione a atividade, duração e frequência. O gasto médio diário é calculado automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {activities.map((a, i) => {
          const computed = items[i];
          return (
            <div
              key={a.id || i}
              className="flex flex-col gap-3 p-3 rounded-lg bg-muted/50 border border-border/50"
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[180px] space-y-1">
                  <Label className="text-xs">Atividade</Label>
                  <Popover
                    open={openCombo === i}
                    onOpenChange={(open) => setOpenCombo(open ? i : null)}
                  >
                    <PopoverTrigger asChild>
                      <Input
                        placeholder="Buscar atividade..."
                        value={openCombo === i ? (search[i] ?? a.name ?? '') : (a.name || '')}
                        onChange={(e) => {
                          setSearch((s) => ({ ...s, [i]: e.target.value }));
                          if (openCombo !== i) setOpenCombo(i);
                          updateActivity(i, 'name', e.target.value);
                        }}
                        onFocus={() => setOpenCombo(i)}
                        className="h-9"
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <ul className="max-h-48 overflow-auto py-1">
                        {searchResults(i).map((act) => (
                          <li key={act.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                              onClick={() => selectActivity(i, act)}
                            >
                              {act.name} <span className="text-muted-foreground">(MET {act.met})</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="w-20 space-y-1">
                  <Label className="text-xs">MET</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={a.met ?? ''}
                    onChange={(e) => updateActivity(i, 'met', e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">Duração (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={a.duration_min ?? ''}
                    onChange={(e) => updateActivity(i, 'duration_min', e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="w-20 space-y-1">
                  <Label className="text-xs">Frequência</Label>
                  <Input
                    type="number"
                    min={0}
                    value={a.frequency_value ?? ''}
                    onChange={(e) => updateActivity(i, 'frequency_value', e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="w-28 space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select
                    value={a.frequency_type || 'weekly'}
                    onValueChange={(v) => updateActivity(i, 'frequency_type', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeActivity(i)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              {(computed?.kcal_per_session != null || computed?.average_daily_kcal != null) && (
                <p className="text-xs text-muted-foreground">
                  Gasto por sessão: <strong>{Math.round(computed.kcal_per_session ?? 0)} kcal</strong>
                  {' | '}
                  Gasto médio diário: <strong>{Math.round(computed.average_daily_kcal ?? 0)} kcal</strong>
                </p>
              )}
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addActivity}>
          <Plus className="w-4 h-4" />
          Adicionar atividade
        </Button>
        {totalAverageDailyKcal > 0 && (
          <div className="pt-3 border-t text-sm font-medium">
            Total de Gasto Médio Diário em Atividades Físicas:{' '}
            <span className="text-primary">{Math.round(totalAverageDailyKcal)} kcal</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
