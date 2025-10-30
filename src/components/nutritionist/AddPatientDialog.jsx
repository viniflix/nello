import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '../ui/use-toast'; 
import { supabase } from '../../lib/customSupabaseClient'; 

const AddPatientDialog = ({ isOpen, setIsOpen, onAddPatient, nutritionistId }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [newPatient, setNewPatient] = useState({
    name: '',
    email: '',
    birth_date: '',
    gender: '',
    height: '',
    weight: '',
    goal: '',
    patient_category: 'adult'
  });

  // Reseta o formulário para o estado inicial
  const resetForm = () => {
    setNewPatient({ name: '', email: '', birth_date: '', gender: '', height: '', weight: '', goal: '', patient_category: 'adult' });
  };

  // Lida com o envio do formulário de adição de paciente
  const handleAdd = async () => {
    // Validação dos campos obrigatórios
    if (!newPatient.name || !newPatient.email || !newPatient.birth_date || !newPatient.gender || !newPatient.height || !newPatient.weight || !newPatient.goal) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }
    setLoading(true);

    // 1. Chamar a Edge Function para criar o paciente
    const { data, error } = await supabase.functions.invoke('create-patient', {
      body: {
        email: newPatient.email,
        // Adiciona a URL de redirecionamento para a página de definir senha
        redirectTo: window.location.origin + '/update-password',
        metadata: {
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

    // 2. Tratar erro DENTRO da função (ex: email já existe)
    if (data && data.error) {
      setLoading(false);
      toast({ title: "Erro ao criar paciente", description: data.error, variant: "destructive" });
      return;
    }

    // 3. Tratar erro NA CHAMADA da função (ex: 404, 500, rede)
    if (error) {
        setLoading(false);
        const errorMessage = error.context?.message || error.message || 'Falha ao chamar a função.';
        toast({ title: "Erro ao chamar função", description: errorMessage, variant: "destructive" });
        console.error("Function Invoke Error:", error);
        return;
    }

    // 4. Lógica de SUCESSO
    setLoading(false);
    toast({ title: "Sucesso!", description: "Convite enviado ao paciente com sucesso." });
    onAddPatient();
    setIsOpen(false);
    resetForm();
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Paciente</DialogTitle>
          <DialogDescription>Cadastre um novo paciente. Um e-mail de convite será enviado para ele definir a própria senha.</DialogDescription>
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
