import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"

const PrescriptionDialog = ({ isOpen, setIsOpen, patient, nutritionistId, onAddPrescription, existingPrescription }) => {
  const { toast } = useToast();
  const [dietTemplates, setDietTemplates] = useState([]);
  const [activeTab, setActiveTab] = useState('templates');
  const [loading, setLoading] = useState(false);
  
  const [customPrescription, setCustomPrescription] = useState({
    calories: '', protein: '', fat: '', carbs: '', diet_type: '', start_date: '', end_date: '', notes: ''
  });

  useEffect(() => {
    const fetchTemplates = async () => {
      const { data, error } = await supabase.from('diet_templates').select('*');
      if (error) {
        toast({ title: "Erro", description: "Não foi possível carregar os modelos de dieta.", variant: "destructive" });
      } else {
        setDietTemplates(data);
      }
    };
    fetchTemplates();
  }, [toast]);

  useEffect(() => {
    if (patient && existingPrescription) {
      if (existingPrescription.template_id) {
        setActiveTab('templates');
      } else {
        setActiveTab('custom');
        setCustomPrescription({
          calories: existingPrescription.calories.toString(),
          protein: existingPrescription.protein.toString(),
          fat: existingPrescription.fat.toString(),
          carbs: existingPrescription.carbs.toString(),
          diet_type: existingPrescription.diet_type,
          start_date: existingPrescription.start_date,
          end_date: existingPrescription.end_date,
          notes: existingPrescription.notes || ''
        });
      }
    } else if (patient) {
      setActiveTab('templates');
      setCustomPrescription({
        calories: '', protein: '', fat: '', carbs: '', diet_type: '', 
        start_date: new Date().toISOString().split('T')[0], 
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
        notes: ''
      });
    }
  }, [patient, existingPrescription, isOpen]);

  const handleSelectTemplate = async (template) => {
    if (!patient) return;
    setLoading(true);
    const prescription = {
      patient_id: patient.id,
      nutritionist_id: nutritionistId,
      calories: template.calories,
      protein: template.protein,
      fat: template.fat,
      carbs: template.carbs,
      diet_type: template.name,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: template.description,
      template_id: template.id
    };
    await onAddPrescription(prescription);
    setLoading(false);
  };

  const handleSaveCustom = async () => {
    if (!patient || !customPrescription.calories || !customPrescription.protein || !customPrescription.fat || !customPrescription.carbs) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatórios de macronutrientes.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const prescription = {
      patient_id: patient.id,
      nutritionist_id: nutritionistId,
      calories: parseInt(customPrescription.calories),
      protein: parseFloat(customPrescription.protein),
      fat: parseFloat(customPrescription.fat),
      carbs: parseFloat(customPrescription.carbs),
      diet_type: customPrescription.diet_type || 'Metas Personalizadas',
      start_date: customPrescription.start_date,
      end_date: customPrescription.end_date,
      notes: customPrescription.notes
    };
    if (existingPrescription) {
      prescription.id = existingPrescription.id;
    }
    await onAddPrescription(prescription);
    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existingPrescription ? 'Editar' : 'Nova'} Prescrição de Dieta</DialogTitle>
          <DialogDescription>Atribuir uma dieta pronta ou definir metas personalizadas para {patient?.name}</DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="templates">Dietas Prontas</TabsTrigger>
            <TabsTrigger value="custom">Personalizada</TabsTrigger>
          </TabsList>
          <TabsContent value="templates">
            <ScrollArea className="h-96">
              <div className="p-1 space-y-4">
                {dietTemplates.map(template => (
                  <div key={template.id} className="p-4 rounded-lg border bg-background/50">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-foreground">{template.name}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                        <p className="text-xs text-muted-foreground mt-2">{template.calories}kcal • P:{template.protein}g F:{template.fat}g C:{template.carbs}g</p>
                      </div>
                      <Button size="sm" onClick={() => handleSelectTemplate(template)} disabled={loading}>
                        {loading ? '...' : 'Selecionar'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="custom">
            <div className="space-y-4 py-4 max-h-96 overflow-y-auto pr-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="calories">Calorias (kcal)</Label><Input id="calories" type="number" value={customPrescription.calories} onChange={(e) => setCustomPrescription({...customPrescription, calories: e.target.value})} placeholder="2000" /></div>
                <div className="space-y-2"><Label htmlFor="protein">Proteína (g)</Label><Input id="protein" type="number" step="0.1" value={customPrescription.protein} onChange={(e) => setCustomPrescription({...customPrescription, protein: e.target.value})} placeholder="150" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="fat">Gordura (g)</Label><Input id="fat" type="number" step="0.1" value={customPrescription.fat} onChange={(e) => setCustomPrescription({...customPrescription, fat: e.target.value})} placeholder="60" /></div>
                <div className="space-y-2"><Label htmlFor="carbs">Carboidrato (g)</Label><Input id="carbs" type="number" step="0.1" value={customPrescription.carbs} onChange={(e) => setCustomPrescription({...customPrescription, carbs: e.target.value})} placeholder="220" /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="dietType">Tipo de Dieta</Label><Input id="dietType" value={customPrescription.diet_type} onChange={(e) => setCustomPrescription({...customPrescription, diet_type: e.target.value})} placeholder="Ex: Hipercalórica, Jejum" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="startDate">Data de Início</Label><Input id="startDate" type="date" value={customPrescription.start_date} onChange={(e) => setCustomPrescription({...customPrescription, start_date: e.target.value})} /></div>
                <div className="space-y-2"><Label htmlFor="endDate">Data de Fim</Label><Input id="endDate" type="date" value={customPrescription.end_date} onChange={(e) => setCustomPrescription({...customPrescription, end_date: e.target.value})} /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="notes">Observações</Label><Input id="notes" value={customPrescription.notes} onChange={(e) => setCustomPrescription({...customPrescription, notes: e.target.value})} placeholder="Observações adicionais..." /></div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>Cancelar</Button>
              <Button onClick={handleSaveCustom} disabled={loading}>{loading ? 'Salvando...' : 'Salvar Dieta'}</Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default PrescriptionDialog;
