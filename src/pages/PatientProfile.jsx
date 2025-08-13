
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Calendar, Target, Scale, Ruler, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';

export default function PatientProfile() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    birth_date: '',
    gender: '',
    height: '',
    weight: '',
    goal: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && user.profile) {
      setFormData({
        name: user.profile.name || '',
        birth_date: user.profile.birth_date || '',
        gender: user.profile.gender || '',
        height: user.profile.height?.toString() || '',
        weight: user.profile.weight?.toString() || '',
        goal: user.profile.goal || ''
      });
    }
  }, [user]);

  const calculateAge = (birthDate) => {
    if (!birthDate) return '-';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const calculateBMI = (weight, height) => {
    if(!weight || !height) return '-';
    const heightInMeters = height / 100;
    return (weight / (heightInMeters * heightInMeters)).toFixed(1);
  };

  const getBMICategory = (bmi) => {
    if(bmi === '-') return { category: 'Não calculado', color: 'text-muted-foreground' };
    if (bmi < 18.5) return { category: 'Abaixo do peso', color: 'text-blue-600' };
    if (bmi < 25) return { category: 'Peso normal', color: 'text-green-600' };
    if (bmi < 30) return { category: 'Sobrepeso', color: 'text-yellow-600' };
    return { category: 'Obesidade', color: 'text-red-600' };
  };

  const getGoalText = (goal) => {
    const goals = {
      lose: 'Perder peso',
      maintain: 'Manter peso',
      gain: 'Ganhar peso'
    };
    return goals[goal] || goal || '-';
  };

  const getGenderText = (gender) => {
    const genders = {
        male: 'Masculino',
        female: 'Feminino'
    }
    return genders[gender] || gender || '-';
  };

  const handleSave = async () => {
    setLoading(true);
    const { error } = await supabase
      .from('user_profiles')
      .update({ 
        name: formData.name,
        birth_date: formData.birth_date,
        gender: formData.gender,
        height: parseFloat(formData.height),
        weight: parseFloat(formData.weight),
        goal: formData.goal,
       })
      .eq('id', user.id);

    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Perfil atualizado!",
        description: "Suas informações foram salvas com sucesso.",
      });
      setIsEditing(false);
    }
    setLoading(false);
  };

  const handleCancel = () => {
    if (user && user.profile) {
      setFormData({
        name: user.profile.name,
        birth_date: user.profile.birth_date,
        gender: user.profile.gender,
        height: user.profile.height.toString(),
        weight: user.profile.weight.toString(),
        goal: user.profile.goal
      });
    }
    setIsEditing(false);
  };
  
  if (!user || !user.profile) {
      return <div>Carregando perfil...</div>
  }

  const bmi = calculateBMI(user.profile.weight, user.profile.height);
  const bmiInfo = getBMICategory(parseFloat(bmi));

  return (
    <div className="pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="p-4 space-y-6"
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Informações Pessoais</CardTitle>
                      <CardDescription>Mantenha seus dados atualizados</CardDescription>
                    </div>
                    {!isEditing ? (
                      <Button onClick={() => setIsEditing(true)}>
                        Editar
                      </Button>
                    ) : (
                      <div className="flex space-x-2">
                        <Button variant="outline" onClick={handleCancel} disabled={loading}>
                          Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={loading}>
                          {loading ? "Salvando..." : "Salvar"}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome completo</Label>
                      {isEditing ? (
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          className="bg-muted"
                        />
                      ) : (
                        <p className="font-medium p-2">{user.profile.name || '-'}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                       <p className="font-medium p-2 text-muted-foreground">{user.email}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="birth_date">Data de nascimento</Label>
                      {isEditing ? (
                        <Input
                          id="birth_date"
                          type="date"
                          value={formData.birth_date}
                          onChange={(e) => setFormData({...formData, birth_date: e.target.value})}
                          className="bg-muted"
                        />
                      ) : (
                        <p className="font-medium p-2">
                          {user.profile.birth_date ? new Date(user.profile.birth_date).toLocaleDateString('pt-BR') : '-'}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gender">Sexo</Label>
                      {isEditing ? (
                        <Select value={formData.gender} onValueChange={(value) => setFormData({...formData, gender: value})}>
                          <SelectTrigger className="bg-muted"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="male">Masculino</SelectItem><SelectItem value="female">Feminino</SelectItem></SelectContent>
                        </Select>
                      ) : (
                        <p className="font-medium p-2">{getGenderText(user.profile.gender)}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="height">Altura (cm)</Label>
                      {isEditing ? (
                        <Input id="height" type="number" value={formData.height} onChange={(e) => setFormData({...formData, height: e.target.value})} className="bg-muted" />
                      ) : (
                        <p className="font-medium p-2">{user.profile.height ? `${user.profile.height} cm` : '-'}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="weight">Peso (kg)</Label>
                      {isEditing ? (
                        <Input id="weight" type="number" step="0.1" value={formData.weight} onChange={(e) => setFormData({...formData, weight: e.target.value})} className="bg-muted" />
                      ) : (
                        <p className="font-medium p-2">{user.profile.weight ? `${user.profile.weight} kg` : '-'}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="goal">Objetivo</Label>
                    {isEditing ? (
                      <Select value={formData.goal} onValueChange={(value) => setFormData({...formData, goal: value})}>
                        <SelectTrigger className="bg-muted"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="lose">Perder peso</SelectItem>
                            <SelectItem value="maintain">Manter peso</SelectItem>
                            <SelectItem value="gain">Ganhar peso</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-medium p-2">{getGoalText(user.profile.goal)}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card><CardHeader><CardTitle className="flex items-center space-x-2"><Scale className="w-5 h-5 text-primary" /><span>IMC</span></CardTitle></CardHeader><CardContent><div className="text-center"><div className="text-3xl font-bold text-primary mb-2">{bmi}</div><p className={`text-sm font-medium ${bmiInfo.color}`}>{bmiInfo.category}</p></div></CardContent></Card>
              <Card><CardHeader><CardTitle className="flex items-center space-x-2"><Target className="w-5 h-5 text-accent" /><span>Objetivo</span></CardTitle></CardHeader><CardContent><div className="text-center"><div className="text-lg font-semibold text-accent mb-2">{getGoalText(user.profile.goal)}</div><p className="text-sm text-muted-foreground">Meta atual</p></div></CardContent></Card>
              <Card><CardHeader><CardTitle className="flex items-center space-x-2"><Calendar className="w-5 h-5 text-secondary" /><span>Idade</span></CardTitle></CardHeader><CardContent><div className="text-center"><div className="text-3xl font-bold text-secondary mb-2">{calculateAge(user.profile.birth_date)}</div><p className="text-sm text-muted-foreground">anos</p></div></CardContent></Card>
            </div>
          </div>
        </motion.div>
    </div>
  );
}
