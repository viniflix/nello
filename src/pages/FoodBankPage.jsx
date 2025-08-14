import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { User, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardHeader from '@/components/DashboardHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const AddFoodForm = ({ onFoodAdded, nutritionistId }) => {
    const [newFood, setNewFood] = useState({ name: '', calories: '', protein: '', fat: '', carbs: '', group: 'Personalizado' });
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleAddFood = async () => {
        if (!newFood.name || !newFood.calories || !newFood.protein || !newFood.fat || !newFood.carbs) {
            toast({ title: "Erro", description: "Preencha todos os campos.", variant: "destructive" });
            return;
        }
        setLoading(true);
        const { error } = await supabase.from('foods').insert({
            ...newFood,
            calories: parseFloat(newFood.calories),
            protein: parseFloat(newFood.protein),
            fat: parseFloat(newFood.fat),
            carbs: parseFloat(newFood.carbs),
            nutritionist_id: nutritionistId
        });

        if (error) {
            toast({ title: "Erro", description: "Não foi possível adicionar o alimento.", variant: "destructive" });
        } else {
            toast({ title: "Sucesso!", description: "Alimento adicionado ao seu banco de dados." });
            setNewFood({ name: '', calories: '', protein: '', fat: '', carbs: '', group: 'Personalizado' });
            onFoodAdded();
        }
        setLoading(false);
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="foodName">Nome do Alimento</Label><Input id="foodName" value={newFood.name} onChange={e => setNewFood({...newFood, name: e.target.value})} placeholder="Ex: Frango Grelhado" /></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2"><Label htmlFor="calories">Calorias</Label><Input id="calories" type="number" value={newFood.calories} onChange={e => setNewFood({...newFood, calories: e.target.value})} placeholder="165" /></div>
                <div className="space-y-2"><Label htmlFor="protein">Proteínas</Label><Input id="protein" type="number" value={newFood.protein} onChange={e => setNewFood({...newFood, protein: e.target.value})} placeholder="31" /></div>
                <div className="space-y-2"><Label htmlFor="fat">Gorduras</Label><Input id="fat" type="number" value={newFood.fat} onChange={e => setNewFood({...newFood, fat: e.target.value})} placeholder="3.6" /></div>
                <div className="space-y-2"><Label htmlFor="carbs">Carbs</Label><Input id="carbs" type="number" value={newFood.carbs} onChange={e => setNewFood({...newFood, carbs: e.target.value})} placeholder="0" /></div>
            </div>
            <Button onClick={handleAddFood} disabled={loading}>{loading ? 'Adicionando...' : 'Adicionar Alimento'}</Button>
        </div>
    );
};

const FoodBankPage = () => {
    const { user, signOut } = useAuth();
    const { toast } = useToast();
    const [foods, setFoods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchFoods = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from('foods').select('*').or(`nutritionist_id.eq.${user.id},nutritionist_id.is.null`);
        if (error) {
            toast({ title: "Erro", description: "Não foi possível carregar os alimentos.", variant: "destructive" });
        } else {
            setFoods(data);
        }
        setLoading(false);
    }, [user.id, toast]);

    useEffect(() => {
        fetchFoods();
    }, [fetchFoods]);

    const filteredFoods = useMemo(() => {
        return foods.filter(food => food.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [foods, searchTerm]);

    const customFoods = useMemo(() => {
        return filteredFoods.filter(food => food.nutritionist_id === user.id);
    }, [filteredFoods, user.id]);

    const publicFoods = useMemo(() => {
        return filteredFoods.filter(food => food.nutritionist_id === null);
    }, [filteredFoods]);

    const handleDeleteFood = async (foodId) => {
        const { error } = await supabase.from('foods').delete().match({ id: foodId, nutritionist_id: user.id });
        if (error) {
            toast({ title: "Erro", description: `Não foi possível remover o alimento: ${error.message}`, variant: "destructive" });
        } else {
            fetchFoods(); // Refetch foods from the server
            toast({ title: "Sucesso!", description: "Alimento removido." });
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <DashboardHeader
                user={user.profile}
                logout={signOut}
                title="HipoZero"
                subtitle="Banco de Alimentos"
                icon={<User className="w-6 h-6 text-primary-foreground" />}
                backLink="/nutritionist"
            />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <Card className="mb-8">
                        <CardHeader>
                            <CardTitle>Adicionar Novo Alimento</CardTitle>
                            <CardDescription>Adicione itens personalizados ao seu banco de dados. Eles estarão disponíveis apenas para você e seus pacientes.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <AddFoodForm onFoodAdded={fetchFoods} nutritionistId={user.id} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Consultar Banco de Alimentos</CardTitle>
                            <div className="mt-4">
                                <Input placeholder="Buscar alimento..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <h3 className="text-lg font-semibold mb-4">Meus Alimentos Personalizados</h3>
                            <div className="space-y-2 mb-6">
                                {customFoods.length > 0 ? customFoods.map(food => (
                                    <div key={food.id} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                                        <p>{food.name}</p>
                                        <div className="flex items-center gap-4">
                                            <p className="text-sm text-muted-foreground">{food.calories}kcal | P:{food.protein}g F:{food.fat}g C:{food.carbs}g</p>
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteFood(food.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                        </div>
                                    </div>
                                )) : <p className="text-muted-foreground">Nenhum alimento personalizado.</p>}
                            </div>

                            <h3 className="text-lg font-semibold mb-4">Banco de Dados Público</h3>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {publicFoods.map(food => (
                                    <div key={food.id} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                                        <p>{food.name}</p>
                                        <p className="text-sm text-muted-foreground">{food.calories}kcal | P:{food.protein}g F:{food.fat}g C:{food.carbs}g</p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </main>
        </div>
    );
};

export default FoodBankPage;