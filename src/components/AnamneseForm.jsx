import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const Section = ({ title, children }) => (
  <div className="space-y-4 pt-6 border-t first:pt-0 first:border-t-0">
    <h3 className="text-xl font-semibold text-foreground">{title}</h3>
    {children}
  </div>
);

const Recordatorio24h = ({ data, onChange }) => {
  const handleItemChange = (index, field, value) => {
    const updatedItems = [...data];
    updatedItems[index][field] = value;
    onChange(updatedItems);
  };

  const addItem = () => {
    onChange([...data, { meal: '', preparations: '', quantity: '', brands: '' }]);
  };

  const removeItem = (index) => {
    onChange(data.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-10 gap-2 font-medium text-sm text-muted-foreground px-2">
        <div className="col-span-2">Refeição</div>
        <div className="col-span-3">Preparações</div>
        <div className="col-span-2">Quantidade</div>
        <div className="col-span-2">Marcas</div>
      </div>
      {data.map((item, index) => (
        <div key={index} className="grid grid-cols-10 gap-2 items-center">
          <Input className="col-span-2" placeholder="Ex: Café da Manhã" value={item.meal} onChange={(e) => handleItemChange(index, 'meal', e.target.value)} />
          <Input className="col-span-3" placeholder="Ex: Café com leite, pão" value={item.preparations} onChange={(e) => handleItemChange(index, 'preparations', e.target.value)} />
          <Input className="col-span-2" placeholder="Ex: 1 xícara, 2 fatias" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} />
          <Input className="col-span-2" placeholder="Ex: Ninho, Pullman" value={item.brands} onChange={(e) => handleItemChange(index, 'brands', e.target.value)} />
          <Button variant="ghost" size="icon" className="col-span-1" onClick={() => removeItem(index)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-4 h-4 mr-2" /> Adicionar Linha</Button>
    </div>
  );
};

const FrequenciaConsumo = ({ data, onChange }) => {
    const handleFrequencyChange = (group, value) => {
        onChange({ ...data, [group]: value });
    };

    const foodGroups = [
        { key: 'dairy', label: 'Leite e derivados' }, { key: 'meats_eggs', label: 'Carnes e ovos' },
        { key: 'legumes', label: 'Leguminosas' }, { key: 'vegetables', label: 'Hortaliças' },
        { key: 'fruits', label: 'Frutas' }, { key: 'cereals_tubers', label: 'Cereais, pães, tubérculos' },
        { key: 'sugars_sweets', label: 'Açúcares e doces' }, { key: 'fats_oils', label: 'Gorduras e óleos' },
    ];
    
    const frequencyOptions = ['Nunca', 'Raramente', '1x/semana', '2x/semana', '3x/semana', '4x/semana', '5x/semana', '6x/semana', 'Todo dia'];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
           {foodGroups.map(group => (
                <div key={group.key} className="space-y-1">
                    <Label>{group.label}</Label>
                    <Select value={data[group.key] || ''} onValueChange={(value) => handleFrequencyChange(group.key, value)}>
                        <SelectTrigger><SelectValue placeholder="Selecione a frequência" /></SelectTrigger>
                        <SelectContent>
                            {frequencyOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            ))}
        </div>
    );
};

const YesNoQuestion = ({ label, field, value, onChange, detailsValue, onDetailsChange }) => (
    <div className="space-y-2">
        <Label>{label}</Label>
        <Select value={value || 'Não'} onValueChange={(val) => onChange(field, val)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
                <SelectItem value="Sim">Sim</SelectItem>
                <SelectItem value="Não">Não</SelectItem>
            </SelectContent>
        </Select>
        {value === 'Sim' && (
            <Input 
                value={detailsValue || ''}
                onChange={(e) => onDetailsChange(field + '_details', e.target.value)}
                placeholder="Especifique (frequência, tipo, etc.)"
                className="mt-2"
            />
        )}
    </div>
);

const AnamneseForm = ({ anamneseData, setAnamneseData, isExpanded }) => {
  const handleDataChange = (field, value) => {
    setAnamneseData(prev => ({ 
        ...prev, 
        data: { ...prev.data, [field]: value }
    }));
  };
  
  const handleTableChange = (tableName, newData) => {
    setAnamneseData(prev => ({
        ...prev,
        data: { ...prev.data, [tableName]: newData }
    }));
  };

  const anamnese = anamneseData.data || {};

  if (!isExpanded) return null;

  return (
    <div className="space-y-8">
      <Section title="Histórico e Preferências Alimentares">
        <div className="space-y-4">
          <div className="space-y-1"><Label>Preferências alimentares</Label><Textarea value={anamnese.food_preferences || ''} onChange={(e) => handleDataChange('food_preferences', e.target.value)} placeholder="Alimentos que o paciente mais gosta..."/></div>
          <div className="space-y-1"><Label>Aversões alimentares</Label><Textarea value={anamnese.food_aversions || ''} onChange={(e) => handleDataChange('food_aversions', e.target.value)} placeholder="Alimentos que o paciente não gosta ou evita..."/></div>
          <div className="space-y-1"><Label>Local das refeições</Label><Input value={anamnese.meal_location || ''} onChange={(e) => handleDataChange('meal_location', e.target.value)} placeholder="Ex: Em casa, restaurante, trabalho..."/></div>
          <div className="space-y-1"><Label>Quem prepara as refeições</Label><Input value={anamnese.meal_preparer || ''} onChange={(e) => handleDataChange('meal_preparer', e.target.value)} placeholder="Ex: O próprio paciente, cônjuge..."/></div>
        </div>
      </Section>
      
      <Section title="Recordatório de 24h">
        <Recordatorio24h data={anamnese.recall_24h || []} onChange={(newData) => handleTableChange('recall_24h', newData)} />
      </Section>

      <Section title="Questionário de Frequência de Consumo">
        <FrequenciaConsumo data={anamnese.consumption_frequency || {}} onChange={(newData) => handleTableChange('consumption_frequency', newData)} />
      </Section>

      <Section title="Histórico de Saúde Adicional">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <YesNoQuestion label="Tratamento dietético anterior?" field="previous_diet_treatment" value={anamnese.previous_diet_treatment} onChange={handleDataChange} detailsValue={anamnese.previous_diet_treatment_details} onDetailsChange={handleDataChange}/>
            <YesNoQuestion label="Tabagismo" field="smoking" value={anamnese.smoking} onChange={handleDataChange} detailsValue={anamnese.smoking_details} onDetailsChange={handleDataChange}/>
            <YesNoQuestion label="Consumo de álcool" field="alcohol_consumption" value={anamnese.alcohol_consumption} onChange={handleDataChange} detailsValue={anamnese.alcohol_consumption_details} onDetailsChange={handleDataChange}/>
            <div className="space-y-1"><Label>Apetite</Label><Input value={anamnese.appetite || ''} onChange={(e) => handleDataChange('appetite', e.target.value)} placeholder="Bom, regular, aumentado, diminuído"/></div>
            <div className="space-y-1"><Label>Número e horário das refeições</Label><Input value={anamnese.meal_times_number || ''} onChange={(e) => handleDataChange('meal_times_number', e.target.value)} placeholder="Ex: 4 refeições, 8h, 12h, 16h, 20h"/></div>
            <div className="space-y-1"><Label>Atividade física</Label><Input value={anamnese.physical_activity_details || ''} onChange={(e) => handleDataChange('physical_activity_details', e.target.value)} placeholder="Tipo, frequência e duração"/></div>
            <div className="space-y-1"><Label>Problemas de alimentação</Label><Textarea value={anamnese.eating_issues || ''} onChange={(e) => handleDataChange('eating_issues', e.target.value)} placeholder="Anorexia, bulimia, perda de paladar..."/></div>
            <div className="space-y-1"><Label>Problemas de mastigação/deglutição</Label><Textarea value={anamnese.chewing_swallowing_issues || ''} onChange={(e) => handleDataChange('chewing_swallowing_issues', e.target.value)} placeholder="Dificuldade ou dor ao mastigar/engolir..."/></div>
            <div className="space-y-1"><Label>Restrições religiosas/culturais</Label><Textarea value={anamnese.religious_cultural_restrictions || ''} onChange={(e) => handleDataChange('religious_cultural_restrictions', e.target.value)} placeholder="Jejum, alimentos proibidos..."/></div>
            <div className="space-y-1"><Label>Interações medicamentosas</Label><Textarea value={anamnese.drug_interactions || ''} onChange={(e) => handleDataChange('drug_interactions', e.target.value)} placeholder="Medicamentos em uso e possíveis interações com alimentos"/></div>
        </div>
      </Section>
      <Section title="Observações Gerais">
        <Textarea value={anamnese.general_observations || ''} onChange={(e) => handleDataChange('general_observations', e.target.value)} placeholder="Informações adicionais relevantes, percepções do nutricionista, etc." rows={5}/>
      </Section>
    </div>
  );
};

export default AnamneseForm;