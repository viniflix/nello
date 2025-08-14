
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import AnamneseForm from '@/components/AnamneseForm';

const AddPatientDialog = ({ isOpen, setIsOpen, onAddPatient, nutritionistId }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showAnamnese, setShowAnamnese] = useState(false);
  const [newPatient, setNewPatient] = useState({
    name: '',
    email: '',
    password: '',
    birth_date: '',
    gender: '',
    height: '',
    weight: '',
    goal: '',
    patient_category: 'adult'
  });
  const [anamneseData, setAnamneseData] = useState({
    clinical_history: '',
    nutritional_history: '',
    lifestyle_habits: '',
    physical_activity: '',
    family_history: '',
    medications_supplements: '',
  });

  const resetForm = () => {
    setNewPatient({ name: '', email: '', password: '', birth_date: '', gender: '', height: '', weight: '', goal: '', patient_category: 'adult' });
    setAnamneseData({ clinical_history: '', nutritional_history: '', lifestyle_habits: '', physical_activity: '', family_history: '', medications_supplements: '' });
    setShowAnamnese(false);
  };

  const handleAdd = async () => {
    if (!newPatient.name || !newPatient.email || !newPatient.password || !newPatient.birth_date || !newPatient.gender || !newPatient.height || !newPatient.weight || !newPatient.goal) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }
    setLoading(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: newPatient.email,
      password: newPatient.password,
      options: {
        data: {
          name: newPatient.name,
          user_type: 'patient',
          birth_date: newPatient.birth_date,
          gender: newPatient.gender,
          height: parseInt(newPatient.height),
          weight: parseFloat(newPatient.weight),
          goal: newPatient.goal,
          nutritionist_id: nutritionistId,
          patient_category: newPatient.patient_category
        }
      }
    });

    if (signUpError) {
      setLoading(false);
      toast({ title: "Erro ao criar paciente", description: signUpError.message, variant: "destructive" });
      return;
    }

    if (showAnamnese && signUpData.user) {
      const { error: anamneseError } = await supabase
        .from('anamneses')
        .upsert({
          patient_id: signUpData.user.id,
          nutritionist_id: nutritionistId,
          data: anamneseData
        }, { onConflict: 'patient_id' });

      if (anamneseError) {
        toast({ title: "Aviso", description: `Paciente criado, mas houve um erro ao salvar a anamnese: ${anamneseError.message}`, variant: "destructive" });
      }
    }

    setLoading(false);
    toast({ title: "Sucesso!", description: "Paciente adicionado com sucesso. Peça para que verifique o e-mail de confirmação." });
    onAddPatient();
    setIsOpen(false);
    resetForm();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Paciente</DialogTitle>
          <DialogDescription>Cadastre um novo paciente e defina suas credenciais de acesso.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={newPatient.name} onChange={(e) => setNewPatient({...newPatient, name: e.target.value})} placeholder="Nome completo" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email de Acesso</Label>
            <Input id="email" type="email" value={newPatient.email} onChange={(e) => setNewPatient({...newPatient, email: e.target.value})} placeholder="email@exemplo.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha de Acesso</Label>
            <Input id="password" type="text" value={newPatient.password} onChange={(e) => setNewPatient({...newPatient, password: e.target.value})} placeholder="Crie uma senha forte" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="birthDate">Data de Nascimento</Label>
              <Input id="birthDate" type="date" value={newPatient.birth_date} onChange={(e) => setNewPatient({...newPatient, birth_date: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Sexo</Label>
              <Select value={newPatient.gender} onValueChange={(value) => setNewPatient({...newPatient, gender: value})}>
                <SelectTrigger><SelectValue placeholder="Sexo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Masculino</SelectItem>
                  <SelectItem value="female">Feminino</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="height">Altura (cm)</Label>
              <Input id="height" type="number" value={newPatient.height} onChange={(e) => setNewPatient({...newPatient, height: e.target.value})} placeholder="175" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Peso (kg)</Label>
              <Input id="weight" type="number" step="0.1" value={newPatient.weight} onChange={(e) => setNewPatient({...newPatient, weight: e.target.value})} placeholder="70.5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="goal">Objetivo</Label>
                <Select value={newPatient.goal} onValueChange={(value) => setNewPatient({...newPatient, goal: value})}>
                <SelectTrigger><SelectValue placeholder="Objetivo" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="lose">Perder peso</SelectItem>
                    <SelectItem value="maintain">Manter peso</SelectItem>
                    <SelectItem value="gain">Ganhar peso</SelectItem>
                </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="patient_category">Categoria</Label>
                <Select value={newPatient.patient_category} onValueChange={(value) => setNewPatient({...newPatient, patient_category: value})}>
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="adult">Adulto</SelectItem>
                    <SelectItem value="pregnant">Gestante</SelectItem>
                    <SelectItem value="child">Criança</SelectItem>
                </SelectContent>
                </Select>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 pt-4">
            <Checkbox id="show-anamnese" checked={showAnamnese} onCheckedChange={setShowAnamnese} />
            <Label htmlFor="show-anamnese" className="cursor-pointer">Preencher anamnese agora</Label>
          </div>

          <AnamneseForm
            anamneseData={anamneseData}
            setAnamneseData={setAnamneseData}
            isExpanded={showAnamnese}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleAdd} disabled={loading}>{loading ? 'Adicionando...' : 'Adicionar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddPatientDialog;
