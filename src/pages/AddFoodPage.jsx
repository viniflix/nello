
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, Trash2, Save, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useNavigate, useParams } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const getMealType = (time) => {
    if (!time) return '';
    const hour = parseInt(time.split(':')[0], 10);
    if (hour >= 5 && hour < 11) return 'Café da Manhã';
    if (hour >= 11 && hour < 14) return 'Almoço';
    if (hour >= 14 && hour < 18) return 'Lanche';
    if (hour >= 18 && hour < 22) return 'Jantar';
    return 'Ceia';
};

const mealTypes = ['Café da Manhã', 'Almoço', 'Lanche', 'Jantar', 'Ceia'];

const AddFoodPage = () => {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const { mealId } = useParams();
    const [foods, setFoods] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showResults, setShowResults] = useState(false);
    const [mealItems, setMealItems] = useState([]);
    const [selectedFood, setSelectedFood] = useState(null);
    const [measure, setMeasure] = useState('grams');
    const [quantity, setQuantity] = useState('');
    const [mealDetails, setMealDetails] = useState({ time: new Date().toTimeString().slice(0, 5), type: '', notes: '' });
    const [loading, setLoading] = useState(false);
    const [conversions, setConversions] = useState([]);

    useEffect(() => {
        setMealDetails(prev => ({...prev, type: getMealType(prev.time)}));
    }, [mealDetails.time]);

    const fetchFoods = useCallback(async () => {
        if (!user || !user.profile) return;
        const nutritionistId = user.profile.nutritionist_id;
    
        const { data, error } = await supabase
            .from('foods')
            .select('*')
            .or(`nutritionist_id.is.null${nutritionistId ? `,nutritionist_id.eq.${nutritionistId}`: ''}`);
          
        if (error) {
          toast({ title: "Erro", description: "Não foi possível carregar os alimentos.", variant: "destructive" });
        } else {
          setFoods(data || []);
        }
    }, [user, toast]);
    
    useEffect(() => {
        fetchFoods();
        if (mealId) {
            const fetchMeal = async () => {
                const { data, error } = await supabase.from('meals').select('*, meal_items(*)').eq('id', mealId).single();
                if (error || !data) {
                    toast({ title: "Erro", description: "Refeição não encontrada.", variant: "destructive" });
                    navigate('/patient/records');
                } else {
                    setMealDetails({ time: data.meal_time, type: data.meal_type, notes: data.notes || '' });
                    const items = data.meal_items.map(item => ({...item, food_name: item.name}));
                    setMealItems(items);
                }
            };
            fetchMeal();
        }
    }, [mealId, navigate, toast, fetchFoods]);

    const filteredFoods = useMemo(() => {
        if (!searchTerm) return [];
        return foods.filter(food =>
            food.name.toLowerCase().includes(searchTerm.toLowerCase())
        ).slice(0, 5);
    }, [searchTerm, foods]);

    const calculateNutrients = (food, grams) => {
        if(!food || !grams) return { calories: 0, protein: 0, fat: 0, carbs: 0 };
        const factor = grams / 100;
        return {
            calories: food.calories * factor,
            protein: food.protein * factor,
            fat: food.fat * factor,
            carbs: food.carbs * factor
        };
    };

    const handleSelectFood = async (food) => {
        setSelectedFood(food);
        setSearchTerm(food.name);
        setShowResults(false);
        setMeasure('grams');
        setQuantity('');
        
        const { data, error } = await supabase
            .from('measure_conversions')
            .select('*')
            .eq('food_id', food.id);
        
        if(error) console.error(error);
        else setConversions(data || []);
    };

    const getGrams = () => {
        if (!quantity) return 0;
        const parsedQuantity = parseFloat(quantity);
        if(measure === 'grams' || measure === 'ml') return parsedQuantity; // assuming 1ml = 1g for simplicity
        if(measure === 'unit' && selectedFood?.grams_per_unit) {
            return selectedFood.grams_per_unit * parsedQuantity;
        }
        
        const conversion = conversions.find(c => c.measure_name === measure);
        if(conversion) {
            return conversion.grams_equivalent * parsedQuantity;
        }
        if (measure === 'unit') {
            const conversionUnit = conversions.find(c => c.measure_name === 'Unidade');
            if (conversionUnit) return conversionUnit.grams_equivalent * parsedQuantity;
            return 100 * parsedQuantity; 
        }

        return 0;
    };

    const handleAddFoodToMeal = () => {
        if (!selectedFood || !quantity) {
            toast({ title: "Erro", description: "Selecione um alimento e a quantidade.", variant: "destructive" });
            return;
        }

        const parsedQuantity = parseFloat(quantity);
        if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
            toast({ title: "Erro", description: "A quantidade deve ser maior que zero.", variant: "destructive" });
            return;
        }

        const grams = getGrams();
        if (grams <= 0 && measure !== 'unit') {
             toast({ title: "Erro", description: "Não foi possível converter a medida para gramas.", variant: "destructive" });
             return;
        }

        const nutrients = calculateNutrients(selectedFood, grams || parsedQuantity);
        
        const newItem = {
            id: Date.now(),
            food_id: selectedFood.id,
            name: selectedFood.name,
            food_name: selectedFood.name,
            quantity: grams || parsedQuantity,
            calories: nutrients.calories,
            protein: nutrients.protein,
            fat: nutrients.fat,
            carbs: nutrients.carbs,
        };
        setMealItems(prev => [...prev, newItem]);
        setSelectedFood(null);
        setSearchTerm('');
        setQuantity('');
        setConversions([]);
    };

    const handleRemoveItem = (id) => {
        setMealItems(prev => prev.filter(item => item.id !== id));
    };

    const mealTotals = useMemo(() => {
        return mealItems.reduce((acc, item) => ({
            calories: acc.calories + (item.calories || 0),
            protein: acc.protein + (item.protein || 0),
            fat: acc.fat + (item.fat || 0),
            carbs: acc.carbs + (item.carbs || 0)
        }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
    }, [mealItems]);

    const handleSaveMeal = async () => {
        if (mealItems.length === 0) {
            toast({ title: "Refeição vazia", description: "Adicione pelo menos um alimento.", variant: "destructive" });
            return;
        }
        setLoading(true);

        const mealPayload = {
            patient_id: user.id,
            meal_date: new Date().toISOString().split('T')[0],
            meal_time: mealDetails.time,
            meal_type: mealDetails.type,
            notes: mealDetails.notes,
            total_calories: mealTotals.calories,
            total_protein: mealTotals.protein,
            total_fat: mealTotals.fat,
            total_carbs: mealTotals.carbs,
        };

        let mealData, mealError;

        if (mealId) {
            const { data, error } = await supabase
                .from('meals')
                .update(mealPayload)
                .eq('id', mealId)
                .select()
                .single();
            mealData = data;
            mealError = error;
        } else {
            const { data, error } = await supabase
                .from('meals')
                .insert(mealPayload)
                .select()
                .single();
            mealData = data;
            mealError = error;
        }

        if (mealError) {
            toast({ title: "Erro", description: `Não foi possível salvar a refeição: ${mealError.message}`, variant: "destructive" });
            setLoading(false);
            return;
        }

        if (mealId) {
            await supabase.from('meal_items').delete().eq('meal_id', mealId);
        }

        const itemsPayload = mealItems.map(item => ({
            meal_id: mealData.id,
            food_id: item.food_id,
            name: item.name,
            quantity: item.quantity,
            calories: item.calories,
            protein: item.protein,
            fat: item.fat,
            carbs: item.carbs,
        }));
        
        const { error: itemsError } = await supabase.from('meal_items').insert(itemsPayload);

        if (itemsError) {
            toast({ title: "Erro", description: `Não foi possível salvar os itens da refeição: ${itemsError.message}`, variant: "destructive" });
        } else {
            toast({ title: "Sucesso!", description: `Refeição ${mealId ? 'atualizada' : 'salva'} com sucesso.` });
            navigate('/patient/records');
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md">
                <div className="max-w-4xl mx-auto px-4 h-16 flex items-center">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mr-2">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h1 className="text-xl font-bold text-foreground">{mealId ? 'Editar Refeição' : 'Adicionar Refeição'}</h1>
                </div>
            </header>

            <main className="max-w-4xl mx-auto p-4 pb-24">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-6">
                            <Card>
                                <CardHeader><CardTitle>Detalhes da Refeição</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="meal-time">Horário</Label>
                                            <Input id="meal-time" type="time" value={mealDetails.time} onChange={e => setMealDetails({...mealDetails, time: e.target.value})} />
                                        </div>
                                        <div>
                                            <Label htmlFor="meal-type">Tipo de Refeição</Label>
                                            <Select value={mealDetails.type} onValueChange={value => setMealDetails({...mealDetails, type: value})}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {mealTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div>
                                        <Label htmlFor="meal-notes">Observações</Label>
                                        <Textarea id="meal-notes" placeholder="Ex: senti muita fome, comi antes do treino..." value={mealDetails.notes} onChange={e => setMealDetails({...mealDetails, notes: e.target.value})} />
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>Montar Refeição</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="relative">
                                        <Label htmlFor="search">Buscar alimento</Label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                            <Input id="search" placeholder="Digite o nome do alimento..." value={searchTerm} onChange={(e) => {setSearchTerm(e.target.value); setShowResults(true);}} onFocus={() => setShowResults(true)} className="pl-10 bg-muted" />
                                        </div>
                                        {showResults && searchTerm && (
                                            <div className="mt-2 border rounded-lg bg-card max-h-48 overflow-y-auto z-20 absolute w-full shadow-lg">
                                                {filteredFoods.length > 0 ? filteredFoods.map(food => (
                                                    <div key={food.id} className="p-3 border-b cursor-pointer hover:bg-muted" onClick={() => handleSelectFood(food)}>
                                                        <p className="font-medium">{food.name}</p>
                                                        <p className="text-xs text-muted-foreground">{food.calories} kcal por 100g</p>
                                                    </div>
                                                )) : <div className="p-3 text-center text-muted-foreground">Nenhum alimento encontrado.</div>}
                                            </div>
                                        )}
                                    </div>
                                    {selectedFood && (
                                        <motion.div initial={{opacity: 0, height: 0}} animate={{opacity: 1, height: 'auto'}} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end pt-2">
                                            <div className="sm:col-span-1">
                                                <Label htmlFor="measure">Medida</Label>
                                                <Select value={measure} onValueChange={setMeasure}>
                                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="grams">Gramas (g)</SelectItem>
                                                        <SelectItem value="ml">Mililitros (ml)</SelectItem>
                                                        <SelectItem value="unit">Unidade</SelectItem>
                                                        {conversions.map(c => <SelectItem key={c.id} value={c.measure_name}>{c.measure_name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="sm:col-span-1">
                                                <Label htmlFor="quantity">Quantidade</Label>
                                                <Input id="quantity" type="number" placeholder="100" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="bg-muted" />
                                            </div>
                                            <Button onClick={handleAddFoodToMeal} className="w-full"><Plus className="w-4 h-4 mr-2" />Adicionar</Button>
                                        </motion.div>
                                    )}
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>Itens da Refeição</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {mealItems.length > 0 ? mealItems.map(item => (
                                            <div key={item.id} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                                                <div>
                                                    <p className="font-medium">{item.food_name}</p>
                                                    <p className="text-sm text-muted-foreground">{Math.round(item.quantity)}g</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-semibold text-destructive">{Math.round(item.calories)} kcal</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        P:{item.protein.toFixed(1)}g G:{item.fat.toFixed(1)}g C:{item.carbs.toFixed(1)}g
                                                    </p>
                                                </div>
                                                <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                            </div>
                                        )) : <p className="text-muted-foreground text-center py-4">Nenhum item adicionado.</p>}
                                    </div>
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
                                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Proteínas</span><span className="font-medium">{mealTotals.protein.toFixed(1)} g</span></div>
                                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Gorduras</span><span className="font-medium">{mealTotals.fat.toFixed(1)} g</span></div>
                                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Carboidratos</span><span className="font-medium">{mealTotals.carbs.toFixed(1)} g</span></div>
                                    </div>
                                    <Button className="w-full mt-4" disabled={loading} onClick={handleSaveMeal}>
                                        <Save className="w-4 h-4 mr-2" />
                                        {loading ? 'Salvando...' : (mealId ? 'Atualizar Refeição' : 'Salvar no Diário')}
                                    </Button>
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
