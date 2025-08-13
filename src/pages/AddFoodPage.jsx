
import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, Trash2, Utensils, Save, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog.jsx"
import { useNavigate } from 'react-router-dom';

const AddFoodPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [foods, setFoods] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [mealItems, setMealItems] = useState([]);
  const [selectedFood, setSelectedFood] = useState(null);
  const [quantity, setQuantity] = useState('');

  useEffect(() => {
    const fetchFoods = async () => {
      const { data, error } = await supabase.from('foods').select('*');
      if (error) {
        toast({ title: "Erro", description: "Não foi possível carregar os alimentos.", variant: "destructive" });
      } else {
        setFoods(data);
      }
    };
    fetchFoods();
  }, [toast]);

  const filteredFoods = useMemo(() => {
    if (!searchTerm) return [];
    return foods.filter(food =>
      food.name.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5);
  }, [searchTerm, foods]);

  const calculateNutrients = (food, grams) => {
    const factor = grams / 100;
    return {
      calories: food.calories * factor,
      protein: food.protein * factor,
      fat: food.fat * factor,
      carbs: food.carbs * factor
    };
  };

  const handleAddFoodToMeal = () => {
    if (!selectedFood || !quantity) {
      toast({ title: "Erro", description: "Selecione um alimento e a quantidade.", variant: "destructive" });
      return;
    }
    const grams = parseFloat(quantity);
    if (grams <= 0) {
      toast({ title: "Erro", description: "A quantidade deve ser maior que zero.", variant: "destructive" });
      return;
    }

    const nutrients = calculateNutrients(selectedFood, grams);
    const newItem = {
      id: Date.now(),
      food_id: selectedFood.id,
      food_name: selectedFood.name,
      quantity: grams,
      calories: nutrients.calories,
      protein: nutrients.protein,
      fat: nutrients.fat,
      carbs: nutrients.carbs,
    };
    setMealItems(prev => [...prev, newItem]);
    setSelectedFood(null);
    setSearchTerm('');
    setQuantity('');
  };

  const handleRemoveItem = (id) => {
    setMealItems(prev => prev.filter(item => item.id !== id));
  };

  const mealTotals = useMemo(() => {
    return mealItems.reduce((acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      fat: acc.fat + item.fat,
      carbs: acc.carbs + item.carbs
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
  }, [mealItems]);

  const handleSaveToDiary = async () => {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().slice(0, 8);

    const newEntries = mealItems.map(item => ({
      patient_id: user.id,
      entry_date: today,
      entry_time: now,
      food_id: item.food_id,
      food_name: item.food_name,
      quantity: item.quantity,
      calories: item.calories,
      protein: item.protein,
      fat: item.fat,
      carbs: item.carbs
    }));
    
    const { error } = await supabase.from('food_entries').insert(newEntries);

    if (error) {
      toast({ title: "Erro", description: "Não foi possível salvar a refeição.", variant: "destructive" });
    } else {
      setMealItems([]);
      toast({ title: "Sucesso!", description: "Refeição adicionada ao seu diário." });
      navigate('/patient');
    }
  };

  return (
    <div className="min-h-screen bg-background">
       <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mr-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Adicionar Refeição</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Montar Refeição</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="search">Buscar alimento</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                      <Input id="search" placeholder="Digite o nome do alimento..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 bg-muted" />
                    </div>
                    {filteredFoods.length > 0 && (
                      <div className="mt-2 border rounded-lg bg-card max-h-48 overflow-y-auto">
                        {filteredFoods.map(food => (
                          <div key={food.id} className="p-3 border-b cursor-pointer hover:bg-muted" onClick={() => { setSelectedFood(food); setSearchTerm(food.name); }}>
                            <p className="font-medium">{food.name}</p>
                            <p className="text-xs text-muted-foreground">{food.calories} kcal por 100g</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedFood && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                      <div className="sm:col-span-2">
                        <Label htmlFor="quantity">Quantidade (gramas)</Label>
                        <Input id="quantity" type="number" placeholder="100" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="bg-muted" />
                      </div>
                      <Button onClick={handleAddFoodToMeal} className="w-full">
                        <Plus className="w-4 h-4 mr-2" />
                        Adicionar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Itens da Refeição</CardTitle>
                </CardHeader>
                <CardContent>
                  {mealItems.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Utensils className="mx-auto w-12 h-12 mb-4" />
                      <p>Nenhum item adicionado ainda.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {mealItems.map(item => (
                        <div key={item.id} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="font-medium">{item.food_name}</p>
                            <p className="text-sm text-muted-foreground">{item.quantity}g</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-destructive">{Math.round(item.calories)} kcal</p>
                            <p className="text-xs text-muted-foreground">
                              P:{item.protein.toFixed(1)}g G:{item.fat.toFixed(1)}g C:{item.carbs.toFixed(1)}g
                            </p>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle>Total da Refeição</CardTitle>
                  <CardDescription>Soma dos macronutrientes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-baseline p-3 bg-muted rounded-lg">
                    <span className="font-medium text-foreground">Calorias</span>
                    <span className="text-2xl font-bold text-destructive">{Math.round(mealTotals.calories)} kcal</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Proteínas</span>
                      <span className="font-medium">{mealTotals.protein.toFixed(1)} g</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gorduras</span>
                      <span className="font-medium">{mealTotals.fat.toFixed(1)} g</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Carboidratos</span>
                      <span className="font-medium">{mealTotals.carbs.toFixed(1)} g</span>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button className="w-full mt-4" disabled={mealItems.length === 0}>
                        <Save className="w-4 h-4 mr-2" />
                        Salvar no Diário
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Ação</AlertDialogTitle>
                        <AlertDialogDescription>
                          Isso adicionará todos os itens desta refeição ao seu diário alimentar de hoje. Deseja continuar?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleSaveToDiary}>Confirmar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default AddFoodPage;
