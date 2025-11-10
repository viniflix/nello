import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { BrainCircuit, User, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

const MacroCalculatorPage = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    weight: '',
    height: '',
    age: '',
    gender: 'male',
    activityLevel: 1.55,
    goal: 'maintain'
  });
  const [proteinRatio, setProteinRatio] = useState([1.8]);
  const [fatRatio, setFatRatio] = useState([25]);

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSelectChange = (id, value) => {
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const calculatedMacros = useMemo(() => {
    const { weight, height, age, gender, activityLevel, goal } = formData;
    if (!weight || !height || !age) return null;

    const bmr = gender === 'male'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;

    const tdee = bmr * activityLevel;

    let goalAdjustment = 0;
    if (goal === 'lose') goalAdjustment = -500;
    if (goal === 'gain') goalAdjustment = 500;

    const targetCalories = tdee + goalAdjustment;
    const proteinGrams = weight * proteinRatio[0];
    const proteinCalories = proteinGrams * 4;
    const fatCalories = targetCalories * (fatRatio[0] / 100);
    const fatGrams = fatCalories / 9;
    const carbCalories = targetCalories - proteinCalories - fatCalories;
    const carbGrams = carbCalories / 4;

    return {
      calories: Math.round(targetCalories),
      protein: Math.round(proteinGrams),
      fat: Math.round(fatGrams),
      carbs: Math.round(carbGrams)
    };
  }, [formData, proteinRatio, fatRatio]);

  const handleCopyToClipboard = () => {
    if (!calculatedMacros) return;
    const text = `Calorias: ${calculatedMacros.calories} kcal, Proteínas: ${calculatedMacros.protein}g, Gorduras: ${calculatedMacros.fat}g, Carboidratos: ${calculatedMacros.carbs}g`;
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!", description: "Metas copiadas para a área de transferência." });
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
        <div className="flex flex-col justify-center flex-1">
            <h1 className="font-clash text-4xl sm:text-5xl font-semibold text-primary">
            CALCULADORA DE MACROS
            </h1>
            <p className="text-lg text-accent mt-2 gap-8 mb-8">
            Estime as necessidades diárias de macronutrientes para seus pacientes.
            </p>
        </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="font-clash font-semibold text-primary">Dados do Paciente</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-accent">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2"><Label htmlFor="weight">Peso (kg)</Label><Input id="weight" type="number" value={formData.weight} onChange={handleInputChange} placeholder="70" /></div>
                    <div className="space-y-2"><Label htmlFor="height">Altura (cm)</Label><Input id="height" type="number" value={formData.height} onChange={handleInputChange} placeholder="175" /></div>
                    <div className="space-y-2"><Label htmlFor="age">Idade</Label><Input id="age" type="number" value={formData.age} onChange={handleInputChange} placeholder="30" /></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="gender">Sexo</Label>
                      <Select value={formData.gender} onValueChange={(v) => handleSelectChange('gender', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="male">Masculino</SelectItem><SelectItem value="female">Feminino</SelectItem></SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="activityLevel">Nível de Atividade</Label>
                      <Select value={formData.activityLevel} onValueChange={(v) => handleSelectChange('activityLevel', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={1.2}>Sedentário</SelectItem><SelectItem value={1.375}>Leve</SelectItem><SelectItem value={1.55}>Moderado</SelectItem><SelectItem value={1.725}>Ativo</SelectItem><SelectItem value={1.9}>Muito Ativo</SelectItem></SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="goal">Objetivo</Label>
                      <Select value={formData.goal} onValueChange={(v) => handleSelectChange('goal', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="lose">Perder Peso</SelectItem><SelectItem value="maintain">Manter Peso</SelectItem><SelectItem value="gain">Ganhar Peso</SelectItem></SelectContent></Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader className="font-clash font-semibold text-primary"><CardTitle>Ajustes Finos</CardTitle></CardHeader>
                <CardContent className="space-y-6 text-accent">
                  <div className="space-y-2">
                    <Label>Proteína (g por kg de peso): {proteinRatio[0]}g/kg</Label>
                    <Slider value={proteinRatio} onValueChange={setProteinRatio} max={3} step={0.1} />
                  </div>
                  <div className="space-y-2">
                    <Label>Gordura (% do total de calorias): {fatRatio[0]}%</Label>
                    <Slider value={fatRatio} onValueChange={setFatRatio} max={40} step={1} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="glass-card sticky top-24">
                <CardHeader>
                  <CardTitle className="font-clash font-semibold text-primary">Resultados Estimados</CardTitle>
                  <CardDescription>Metas diárias calculadas</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {calculatedMacros ? (
                    <>
                      <div className="flex justify-between items-baseline p-3 bg-muted rounded-lg">
                        <span className="font-medium text-foreground">Calorias</span>
                        <span className="text-2xl font-bold text-destructive">{calculatedMacros.calories} kcal</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Proteínas</span><span className="font-medium">{calculatedMacros.protein} g</span></div>
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Gorduras</span><span className="font-medium">{calculatedMacros.fat} g</span></div>
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Carboidratos</span><span className="font-medium">{calculatedMacros.carbs} g</span></div>
                      </div>
                      <Button className="w-full mt-4" onClick={handleCopyToClipboard}>
                        <Save className="w-4 h-4 mr-2" />
                        Copiar Metas
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <BrainCircuit className="mx-auto w-12 h-12 mb-4" />
                      <p>Preencha os dados para calcular.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default MacroCalculatorPage;