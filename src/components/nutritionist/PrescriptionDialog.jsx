import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from '@/components/ui/slider';

const MacroCalculator = ({ calories, macros, setMacros }) => {
    const [proteinPercent, setProteinPercent] = useState(25);
    const [fatPercent, setFatPercent] = useState(30);

    useEffect(() => {
        if (!calories) return;
        const proteinGrams = (calories * (proteinPercent / 100)) / 4;
        const fatGrams = (calories * (fatPercent / 100)) / 9;
        const carbGrams = (calories - (proteinGrams * 4) - (fatGrams * 9)) / 4;
        setMacros({
            protein: Math.round(proteinGrams),
            fat: Math.round(fatGrams),
            carbs: Math.round(carbGrams > 0 ? carbGrams : 0)
        });
    }, [calories, proteinPercent, fatPercent, setMacros]);

    const carbPercent = 100 - proteinPercent - fatPercent;

    return (
        <div className="space-y-4 p-4 border rounded-lg">
            <div>
                <Label>Proteína: {proteinPercent}%</Label>
                <Slider value={[proteinPercent]} onValueChange={(val) => setProteinPercent(val[0])} max={50} step={1} />
            </div>
            <div>
                <Label>Gordura: {fatPercent}%</Label>
                <Slider value={[fatPercent]} onValueChange={(val) => setFatPercent(val[0])} max={50} step={1} />
            </div>
            <div>
                <Label>Carboidrato: {carbPercent > 0 ? carbPercent : 0}%</Label>
                <div className="w-full bg-muted rounded-full h-2.5 mt-2">
                    <div className="bg-destructive h-2.5 rounded-full" style={{ width: `${carbPercent > 0 ? carbPercent : 0}%` }}></div>
                </div>
            </div>
        </div>
    );
};

const PrescriptionDialog = ({ isOpen, setIsOpen, onSave, patientId, nutritionistId, existingPrescription }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [prescription, setPrescription] = useState({
    calories: 2000, protein: 150, fat: 60, carbs: 250,
    diet_type: '', start_date: '', end_date: '',
    notes: '', template_id: '', meal_plan: {}
  });
  const [macroMode, setMacroMode] = useState('grams');

  const resetForm = useCallback(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const nextMonth = format(new Date(new Date().setMonth(new Date().getMonth() + 1)), 'yyyy-MM-dd');

    if (existingPrescription) {
      setPrescription({
        ...existingPrescription,
        start_date: format(new Date(existingPrescription.start_date), 'yyyy-MM-dd'),
        end_date: format(new Date(existingPrescription.end_date), 'yyyy-MM-dd'),
      });
    } else {
      setPrescription({
        calories: 2000, protein: 150, fat: 60, carbs: 250,
        diet_type: 'Equilibrada', start_date: today, end_date: nextMonth,
        notes: '', template_id: '', meal_plan: {}
      });
    }
  }, [existingPrescription]);

  useEffect(() => {
    resetForm();
  }, [isOpen, resetForm]);
  
  useEffect(() => {
    const fetchTemplates = async () => {
      const { data } = await supabase.from('meal_plan_templates').select('*').eq('nutritionist_id', nutritionistId);
      setTemplates(data || []);
    };
    if(isOpen) fetchTemplates();
  }, [isOpen, nutritionistId]);

  const handleTemplateChange = (templateId) => {
    const template = templates.find(t => t.id === parseInt(templateId));
    if (template) {
      setPrescription(prev => ({
        ...prev,
        template_id: template.id,
        meal_plan: template.meals,
      }));
    }
  };

  const handleSave = async () => {
    setLoading(true);
    
    const payload = {
        patient_id: patientId,
        nutritionist_id: nutritionistId,
        calories: Number(prescription.calories),
        protein: Number(prescription.protein),
        fat: Number(prescription.fat),
        carbs: Number(prescription.carbs),
        diet_type: prescription.diet_type,
        start_date: prescription.start_date,
        end_date: prescription.end_date,
        notes: prescription.notes,
        meal_plan: prescription.meal_plan
    };

    let query;
    if(prescription.id){
      query = supabase.from('prescriptions').update(payload).eq('id', prescription.id)
    } else {
      query = supabase.from('prescriptions').insert(payload)
    }

    const { error } = await query;

    if (error) {
      toast({ title: "Erro", description: `Não foi possível salvar a prescrição. ${error.message}`, variant: "destructive" });
    } else {
      toast({ title: "Sucesso!", description: "Prescrição salva." });
      onSave();
      setIsOpen(false);
    }
    setLoading(false);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existingPrescription ? 'Editar' : 'Nova'} Prescrição</DialogTitle>
          <DialogDescription>Defina metas e orientações para o paciente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="space-y-2">
              <Label>Template de Cardápio</Label>
              <Select onValueChange={handleTemplateChange}>
                <SelectTrigger><SelectValue placeholder="Usar um template (opcional)" /></SelectTrigger>
                <SelectContent>
                    {templates.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
                <Label>Calorias (kcal)</Label>
                <Input type="number" value={prescription.calories} onChange={e => setPrescription({...prescription, calories: e.target.value})} />
            </div>
            <Tabs value={macroMode} onValueChange={setMacroMode}>
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="grams">Grama (g)</TabsTrigger>
                    <TabsTrigger value="percent">Porcentagem (%)</TabsTrigger>
                </TabsList>
                <TabsContent value="grams" className="grid grid-cols-3 gap-4 pt-2">
                    <div className="space-y-2"><Label>Proteínas (g)</Label><Input type="number" value={prescription.protein} onChange={e => setPrescription({...prescription, protein: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Gorduras (g)</Label><Input type="number" value={prescription.fat} onChange={e => setPrescription({...prescription, fat: e.target.value})} /></div>
                    <div className="space-y-2"><Label>Carboidratos (g)</Label><Input type="number" value={prescription.carbs} onChange={e => setPrescription({...prescription, carbs: e.target.value})} /></div>
                </TabsContent>
                <TabsContent value="percent" className="pt-2">
                    <MacroCalculator 
                        calories={prescription.calories} 
                        macros={{protein: prescription.protein, fat: prescription.fat, carbs: prescription.carbs}}
                        setMacros={(newMacros) => setPrescription(prev => ({...prev, ...newMacros}))}
                    />
                </TabsContent>
            </Tabs>
            <div className="space-y-2">
                <Label>Tipo de Dieta</Label>
                <Input value={prescription.diet_type} onChange={e => setPrescription({...prescription, diet_type: e.target.value})} placeholder="Ex: Hipocalórica, Low Carb, Cetogênica..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Data de Início</Label><Input type="date" value={prescription.start_date} onChange={e => setPrescription({...prescription, start_date: e.target.value})} /></div>
                <div className="space-y-2"><Label>Data de Fim</Label><Input type="date" value={prescription.end_date} onChange={e => setPrescription({...prescription, end_date: e.target.value})} /></div>
            </div>
            <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={prescription.notes} onChange={e => setPrescription({...prescription, notes: e.target.value})} placeholder="Orientações gerais, suplementação, etc." />
            </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? 'Salvando...' : 'Salvar Prescrição'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PrescriptionDialog;