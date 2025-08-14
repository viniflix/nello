
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from '@/components/ui/slider';
import MealPlanEditor from '@/components/nutritionist/MealPlanEditor';
import { Plus } from 'lucide-react';

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

const TemplateManagerDialog = ({ nutritionistId, onTemplateCreated, onTemplateSaved, selectedTemplateId, setSelectedTemplateId, templates }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState('');
    const [notes, setNotes] = useState('');
    const [mealPlan, setMealPlan] = useState({});
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();
    const daysOfWeek = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];

    const loadTemplateDetails = useCallback(async (templateId) => {
        if (templateId === 0) {
            setName('');
            setNotes('');
            setMealPlan({});
            return;
        }

        const template = templates.find(t => t.id === templateId);
        if (template) {
            setName(template.name);
            setNotes(template.notes || '');
        }

        const { data, error } = await supabase
            .from('meal_plan_template_items')
            .select('day_of_week, meal_type, quantity, measure, foods(id, name)')
            .eq('template_id', templateId);

        if (error) {
            toast({ title: "Erro", description: "Não foi possível carregar os itens do template.", variant: "destructive" });
            return;
        }

        const plan = data.reduce((acc, item) => {
            if (!acc[item.day_of_week]) acc[item.day_of_week] = {};
            if (!acc[item.day_of_week][item.meal_type]) acc[item.day_of_week][item.meal_type] = [];
            
            acc[item.day_of_week][item.meal_type].push({
                food_id: item.foods.id,
                food_name: item.foods.name,
                quantity: item.quantity,
                measure: item.measure
            });
            return acc;
        }, {});
        setMealPlan(plan);
    }, [templates, toast]);

    useEffect(() => {
        if (isOpen && selectedTemplateId) {
            loadTemplateDetails(selectedTemplateId);
        } else if (isOpen && !selectedTemplateId) {
            setName('');
            setNotes('');
            setMealPlan({});
        }
    }, [isOpen, selectedTemplateId, loadTemplateDetails]);

    const handleSaveTemplate = async () => {
        if (!name.trim()) {
            toast({ title: "Erro", description: "O nome do template é obrigatório.", variant: "destructive" });
            return;
        }
        setLoading(true);

        let templateId = selectedTemplateId;
        if (templateId === 0) { // Creating new template
            const { data: newTemplate, error } = await supabase
                .from('meal_plan_templates')
                .insert({ name, notes, nutritionist_id: nutritionistId })
                .select()
                .single();
            if (error) {
                toast({ title: "Erro", description: "Não foi possível criar o template.", variant: "destructive" });
                setLoading(false);
                return;
            }
            templateId = newTemplate.id;
            onTemplateCreated(newTemplate);
        } else { // Updating existing template
            const { error } = await supabase
                .from('meal_plan_templates')
                .update({ name, notes })
                .eq('id', templateId);
            if (error) {
                toast({ title: "Erro", description: "Não foi possível atualizar o template.", variant: "destructive" });
                setLoading(false);
                return;
            }
        }

        const itemsToSave = Object.entries(mealPlan).flatMap(([day, meals]) => 
            Object.entries(meals).flatMap(([mealType, foods]) =>
                foods.map(food => ({
                    template_id: templateId,
                    day_of_week: day,
                    meal_type: mealType,
                    food_id: food.food_id,
                    quantity: food.quantity,
                    measure: food.measure,
                }))
            )
        );

        await supabase.from('meal_plan_template_items').delete().eq('template_id', templateId);
        if (itemsToSave.length > 0) {
            const { error: itemsError } = await supabase.from('meal_plan_template_items').insert(itemsToSave);
            if(itemsError) {
                toast({ title: "Erro", description: `Não foi possível salvar os itens do plano. ${itemsError.message}`, variant: "destructive" });
                setLoading(false);
                return;
            }
        }
        
        toast({ title: "Sucesso!", description: "Template salvo." });
        onTemplateSaved();
        setLoading(false);
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    {selectedTemplateId ? 'Editar Template' : 'Novo Template'}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>{selectedTemplateId ? 'Editar' : 'Novo'} Template de Cardápio</DialogTitle>
                    <DialogDescription>Crie ou edite um template para reutilizar em prescrições futuras.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[75vh] overflow-y-auto pr-2 space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="template-name">Nome do Template</Label>
                        <Input id="template-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Plano para Hipertrofia" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="template-notes">Notas</Label>
                        <Textarea id="template-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações sobre o template" />
                    </div>
                    <Tabs defaultValue={daysOfWeek[0]} className="w-full">
                        <TabsList>
                            {daysOfWeek.map(day => <TabsTrigger key={day} value={day}>{day.substring(0,3)}</TabsTrigger>)}
                        </TabsList>
                        {daysOfWeek.map(day => (
                            <TabsContent key={day} value={day}>
                                <MealPlanEditor plan={mealPlan} setPlan={setMealPlan} dayOfWeek={day} />
                            </TabsContent>
                        ))}
                    </Tabs>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSaveTemplate} disabled={loading}>
                        {loading ? 'Salvando...' : 'Salvar Template'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const PrescriptionDialog = ({ isOpen, setIsOpen, onSave, patient, nutritionistId, existingPrescription }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [currentTab, setCurrentTab] = useState("macros");
  const [selectedTemplateId, setSelectedTemplateId] = useState(0);
  const [prescription, setPrescription] = useState({
    calories: 2000, protein: 150, fat: 60, carbs: 250,
    diet_type: '', start_date: '', end_date: '',
    notes: '',
  });

  const fetchTemplates = useCallback(async () => {
    if (!nutritionistId) return;
    const { data, error } = await supabase
        .from('meal_plan_templates')
        .select(`id, name, notes`)
        .eq('nutritionist_id', nutritionistId)
        .order('name', { ascending: true });
    
    if (error) {
        console.error("Error fetching templates:", error);
        toast({ title: "Erro", description: "Não foi possível carregar os templates.", variant: "destructive" });
    } else {
        setTemplates(data || []);
    }
  }, [nutritionistId, toast]);

  const resetForm = useCallback(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const nextMonth = format(new Date(new Date().setMonth(new Date().getMonth() + 1)), 'yyyy-MM-dd');
    
    if (existingPrescription) {
      setPrescription({
        id: existingPrescription.id,
        calories: existingPrescription.calories, 
        protein: existingPrescription.protein, 
        fat: existingPrescription.fat, 
        carbs: existingPrescription.carbs,
        diet_type: existingPrescription.diet_type, 
        start_date: format(new Date(existingPrescription.start_date), 'yyyy-MM-dd'), 
        end_date: format(new Date(existingPrescription.end_date), 'yyyy-MM-dd'),
        notes: existingPrescription.notes, 
      });
      setSelectedTemplateId(existingPrescription.template_id || 0);
    } else {
      setPrescription({
        calories: 2000, protein: 150, fat: 60, carbs: 250,
        diet_type: 'Equilibrada', start_date: today, end_date: nextMonth,
        notes: '',
      });
      setSelectedTemplateId(0);
    }
  }, [existingPrescription]);

  useEffect(() => {
    if(isOpen){
      resetForm();
      fetchTemplates();
    }
  }, [isOpen, resetForm, fetchTemplates]);
  
  const handleTemplateChange = (templateIdStr) => {
    const templateId = parseInt(templateIdStr, 10);
    setSelectedTemplateId(templateId);
  };

  const handleSave = async () => {
    if (!patient) return;
    setLoading(true);
    
    const payload = {
        patient_id: patient.id,
        nutritionist_id: nutritionistId,
        calories: Number(prescription.calories),
        protein: Number(prescription.protein),
        fat: Number(prescription.fat),
        carbs: Number(prescription.carbs),
        diet_type: prescription.diet_type,
        start_date: prescription.start_date,
        end_date: prescription.end_date,
        notes: prescription.notes,
        template_id: selectedTemplateId === 0 ? null : selectedTemplateId,
    };

    const { error: prescriptionError } = prescription.id 
      ? await supabase.from('prescriptions').update(payload).eq('id', prescription.id)
      : await supabase.from('prescriptions').insert(payload);

    if (prescriptionError) {
      toast({ title: "Erro", description: `Não foi possível salvar a prescrição. ${prescriptionError.message}`, variant: "destructive" });
    } else {
      toast({ title: "Sucesso!", description: "Prescrição salva." });
      onSave();
      setIsOpen(false);
    }
    setLoading(false);
  };
  
  const onTemplateSaved = () => {
    fetchTemplates();
  }

  const onTemplateCreated = (newTemplate) => {
    fetchTemplates().then(() => {
        setSelectedTemplateId(newTemplate.id);
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{existingPrescription ? 'Editar' : 'Nova'} Prescrição para {patient?.name}</DialogTitle>
          <DialogDescription>Defina metas e orientações para o paciente. Selecione ou crie um template de cardápio.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[75vh] overflow-y-auto pr-2">
            <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="macros">Metas e Macros</TabsTrigger>
                    <TabsTrigger value="plan">Plano Alimentar</TabsTrigger>
                </TabsList>
                <TabsContent value="macros" className="space-y-4 py-4">
                     <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2 col-span-1"><Label>Calorias (kcal)</Label><Input type="number" value={prescription.calories} onChange={e => setPrescription({...prescription, calories: e.target.value})} /></div>
                     </div>
                    <Tabs defaultValue="grams">
                        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="grams">Grama (g)</TabsTrigger><TabsTrigger value="percent">Porcentagem (%)</TabsTrigger></TabsList>
                        <TabsContent value="grams" className="grid grid-cols-3 gap-4 pt-2">
                            <div className="space-y-2"><Label>Proteínas (g)</Label><Input type="number" value={prescription.protein} onChange={e => setPrescription({...prescription, protein: e.target.value})} /></div>
                            <div className="space-y-2"><Label>Gorduras (g)</Label><Input type="number" value={prescription.fat} onChange={e => setPrescription({...prescription, fat: e.target.value})} /></div>
                            <div className="space-y-2"><Label>Carboidratos (g)</Label><Input type="number" value={prescription.carbs} onChange={e => setPrescription({...prescription, carbs: e.target.value})} /></div>
                        </TabsContent>
                        <TabsContent value="percent" className="pt-2"><MacroCalculator calories={prescription.calories} macros={{protein: prescription.protein, fat: prescription.fat, carbs: prescription.carbs}} setMacros={(newMacros) => setPrescription(prev => ({...prev, ...newMacros}))} /></TabsContent>
                    </Tabs>
                    <div className="space-y-2"><Label>Tipo de Dieta</Label><Input value={prescription.diet_type} onChange={e => setPrescription({...prescription, diet_type: e.target.value})} placeholder="Ex: Hipocalórica, Low Carb, Cetogênica..." /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Data de Início</Label><Input type="date" value={prescription.start_date} onChange={e => setPrescription({...prescription, start_date: e.target.value})} /></div>
                        <div className="space-y-2"><Label>Data de Fim</Label><Input type="date" value={prescription.end_date} onChange={e => setPrescription({...prescription, end_date: e.target.value})} /></div>
                    </div>
                    <div className="space-y-2"><Label>Observações</Label><Textarea value={prescription.notes} onChange={e => setPrescription({...prescription, notes: e.target.value})} placeholder="Orientações gerais, suplementação, etc." /></div>
                </TabsContent>
                <TabsContent value="plan" className="space-y-4 py-4">
                    <div className="flex items-end gap-2">
                      <div className="flex-grow space-y-2">
                        <Label htmlFor="meal-plan-template">Template de Cardápio</Label>
                        <Select onValueChange={handleTemplateChange} value={selectedTemplateId.toString() || '0'}>
                          <SelectTrigger id="meal-plan-template"><SelectValue placeholder="Usar um template..." /></SelectTrigger>
                          <SelectContent>
                              <SelectItem value="0">Nenhum</SelectItem>
                              {templates.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                       <TemplateManagerDialog 
                         nutritionistId={nutritionistId} 
                         onTemplateCreated={onTemplateCreated}
                         onTemplateSaved={onTemplateSaved}
                         selectedTemplateId={selectedTemplateId}
                         setSelectedTemplateId={setSelectedTemplateId}
                         templates={templates}
                       />
                    </div>
                    <p className="text-sm text-muted-foreground">A edição do plano alimentar é feita no diálogo de templates. Selecione um template e clique em "Editar Template" para modificá-lo, ou crie um novo.</p>
                </TabsContent>
            </Tabs>
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
