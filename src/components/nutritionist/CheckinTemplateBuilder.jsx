import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, GripVertical } from 'lucide-react';

const FIELD_TYPES = [
  { value: 'scale_1_10', label: 'Escala 1 a 10' },
  { value: 'yes_no', label: 'Sim ou Não' },
  { value: 'number', label: 'Número' },
  { value: 'text', label: 'Texto Livre' },
  { value: 'multiple_choice', label: 'Múltipla Escolha' },
];

export default function CheckinTemplateBuilder({ fields, setFields }) {
  const addField = () => {
    setFields([...fields, { 
      label: '', 
      field_type: 'scale_1_10', 
      options: [], 
      score_weight: 1.0,
      scoring_rule: {version:2,mode:'none'},
      is_required: true 
    }]);
  };

  const updateField = (index, key, value) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], [key]: value };
    setFields(newFields);
  };

  const removeField = (index) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium">Perguntas do Check-in</h3>
        <Button type="button" variant="outline" size="sm" onClick={addField}>
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Pergunta
        </Button>
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div key={index} className="flex flex-col gap-3 p-4 border rounded-lg bg-card hover:border-primary/50 transition-colors">
            <div className="flex gap-3 items-start">
              <div className="pt-2 cursor-move text-muted-foreground hover:text-foreground">
                <GripVertical className="w-5 h-5" />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 flex-1">
                <div className="md:col-span-6 space-y-1">
                  <Label>Pergunta</Label>
                  <Input 
                    value={field.label} 
                    onChange={(e) => updateField(index, 'label', e.target.value)} 
                    placeholder="Ex: Como foi sua hidratação hoje?"
                    required
                  />
                </div>
                
                <div className="md:col-span-4 space-y-1">
                  <Label>Tipo de Resposta</Label>
                  <Select 
                    value={field.field_type} 
                    onValueChange={(val) => {setFields(fields.map((item,i)=>i===index?{...item,field_type:val,scoring_rule:{version:2,mode:'none'}}:item));}}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2 space-y-1">
                  <Label>Peso da pontuação</Label>
                  <Input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    max="100"
                    disabled={!field.scoring_rule || field.scoring_rule.mode==='none'}
                    value={field.score_weight} 
                    onChange={(e) => updateField(index, 'score_weight', parseFloat(e.target.value))} 
                  />
                </div>

                <div className="md:col-span-12 space-y-1">
                  <Label>Critério de pontuação</Label>
                  <Select value={field.scoring_rule?.mode || 'none'} onValueChange={mode=>updateField(index,'scoring_rule',{version:2,mode})}>
                    <SelectTrigger aria-label={`Critério da pergunta ${index+1}`}><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Descritiva — sem pontuação</SelectItem>
                      {field.field_type==='yes_no'&&<><SelectItem value="yes">Resposta “Sim” atende ao critério</SelectItem><SelectItem value="no">Resposta “Não” atende ao critério</SelectItem></>}
                      {field.field_type==='scale_1_10'&&<><SelectItem value="higher_better">Maior valor corresponde mais ao critério (1 = 0%, 10 = 100%)</SelectItem><SelectItem value="lower_better">Menor valor corresponde mais ao critério (1 = 100%, 10 = 0%)</SelectItem></>}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Só critérios definidos entram na nota. Texto, números, opções descritivas, peso zero e opcionais sem resposta ficam fora do cálculo. A pontuação não avalia eficácia clínica.</p>
                </div>

                {field.field_type === 'multiple_choice' && (
                  <div className="md:col-span-12 space-y-1 mt-2">
                    <Label>Opções (separadas por vírgula)</Label>
                    <Input 
                      value={field.options?.join(', ') || ''} 
                      onChange={(e) => updateField(index, 'options', e.target.value.split(',').map(s => s.trim()))} 
                      placeholder="Opção 1, Opção 2, Opção 3"
                      required
                    />
                  </div>
                )}
                
                {field.field_type === 'number' && (
                  <div className="md:col-span-12 space-y-1 mt-2">
                    <Label>Unidade de Medida (opcional)</Label>
                    <Input 
                      value={field.unit || ''} 
                      onChange={(e) => updateField(index, 'unit', e.target.value)} 
                      placeholder="Ex: ml, kg, horas"
                    />
                  </div>
                )}
              </div>

              <Button type="button" variant="ghost" size="icon" aria-label={`Remover pergunta ${index + 1}`} className="text-destructive hover:bg-destructive/10" onClick={() => removeField(index)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        {fields.length === 0 && (
          <div className="text-center p-8 border border-dashed rounded-lg text-muted-foreground bg-muted/30">
            Nenhuma pergunta adicionada. Seu template está vazio.
          </div>
        )}
      </div>
    </div>
  );
}
