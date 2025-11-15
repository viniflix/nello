import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { User, Trash2, Edit } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from '@/components/ui/dialog';

const FoodForm = ({ onSave, foodToEdit, nutritionistId }) => {
    const [foodData, setFoodData] = useState({ name: '', calories: '', protein: '', fat: '', carbs: '', group: 'Personalizado' });
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (foodToEdit) {
            setFoodData(foodToEdit);
        } else {
            setFoodData({ name: '', calories: '', protein: '', fat: '', carbs: '', group: 'Personalizado' });
        }
    }, [foodToEdit]);

    const handleSave = async () => {
        if (!foodData.name || !foodData.calories || !foodData.protein || !foodData.fat || !foodData.carbs) {
            toast({ title: "Erro", description: "Preencha todos os campos.", variant: "destructive" });
            return;
        }
        setLoading(true);

        const payload = {
            name: foodData.name,
            calories: parseFloat(foodData.calories),
            protein: parseFloat(foodData.protein),
            fat: parseFloat(foodData.fat),
            carbs: parseFloat(foodData.carbs),
            group: foodData.group,
            nutritionist_id: nutritionistId
        };
        
        let error;
        if(foodToEdit?.id) {
            const { error: updateError } = await supabase.from('foods').update(payload).eq('id', foodToEdit.id);
            error = updateError;
        } else {
            const { error: insertError } = await supabase.from('foods').insert(payload);
            error = insertError;
        }

        if (error) {
            toast({ title: "Erro", description: `Não foi possível salvar o alimento. ${error.message}`, variant: "destructive" });
        } else {
            toast({ title: "Sucesso!", description: `Alimento ${foodToEdit ? 'atualizado' : 'adicionado'}.` });
            onSave();
        }
        setLoading(false);
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="foodName">Nome do Alimento</Label><Input id="foodName" value={foodData.name} onChange={e => setFoodData({...foodData, name: e.target.value})} placeholder="Ex: Frango Grelhado" /></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2"><Label htmlFor="calories">Calorias</Label><Input id="calories" type="number" value={foodData.calories} onChange={e => setFoodData({...foodData, calories: e.target.value})} placeholder="165" /></div>
                <div className="space-y-2"><Label htmlFor="protein">Proteínas</Label><Input id="protein" type="number" value={foodData.protein} onChange={e => setFoodData({...foodData, protein: e.target.value})} placeholder="31" /></div>
                <div className="space-y-2"><Label htmlFor="fat">Gorduras</Label><Input id="fat" type="number" value={foodData.fat} onChange={e => setFoodData({...foodData, fat: e.target.value})} placeholder="3.6" /></div>
                <div className="space-y-2"><Label htmlFor="carbs">Carbs</Label><Input id="carbs" type="number" value={foodData.carbs} onChange={e => setFoodData({...foodData, carbs: e.target.value})} placeholder="0" /></div>
            </div>
            <Button onClick={handleSave} disabled={loading}>{loading ? 'Salvando...' : 'Salvar Alimento'}</Button>
        </div>
    );
};

const EditFoodDialog = ({ food, onSaved, nutritionistId }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    const handleSave = () => {
        onSaved();
        setIsOpen(false);
    }
    
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon"><Edit className="w-4 h-4 text-accent" /></Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Alimento</DialogTitle>
                </DialogHeader>
                <FoodForm onSave={handleSave} foodToEdit={food} nutritionistId={nutritionistId} />
            </DialogContent>
        </Dialog>
    )
}

const FoodBankPage = () => {
    const { user, signOut } = useAuth();
    const { toast } = useToast();
    const [foods, setFoods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchFoods = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from('foods').select('*').or(`nutritionist_id.eq.${user.id},nutritionist_id.is.null`).limit(1000); // OTIMIZADO: Limita a 1000 alimentos
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
        const { error } = await supabase.from('foods').delete().eq('id', foodId);
        if (error) {
            toast({ title: "Erro", description: `Não foi possível remover o alimento: ${error.message}`, variant: "destructive" });
        } else {
            fetchFoods();
            toast({ title: "Sucesso!", description: "Alimento removido." });
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    
                    <div className="flex flex-col justify-center flex-1">
                        <h1 className="font-clash text-4xl sm:text-5xl font-semibold text-primary">
                        BANCO DE ALIMENTOS
                        </h1>
                        <p className="text-lg text-accent mt-2 gap-8 mb-8">
                        Gerencie seus alimentos personalizados, e verifique o banco de alimentos público.
                        </p>
                    </div>
                    <Card className="mb-8">
                        <CardHeader>
                            <CardTitle className="font-clash font-semibold text-primary">Adicionar Novo Alimento</CardTitle>
                            <CardDescription className="text-accent mt-2 gap-8 mb-8">Adicione itens personalizados ao seu banco de alimentos. Eles estarão disponíveis apenas para você e seus pacientes.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-primary">
                            <FoodForm onSave={fetchFoods} nutritionistId={user.id} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="font-clash font-semibold text-primary">Consultar Banco de Alimentos</CardTitle>
                            <div className="mt-4">
                                <Input placeholder="Buscar alimento..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <h3 className="text-lg font-semibold mb-4 text-primary">Meus Alimentos Personalizados</h3>
                            <div className="space-y-2 mb-6">
                                {customFoods.length > 0 ? customFoods.map(food => (
                                    <div key={food.id} className="flex justify-between items-center text-accent p-3 bg-muted rounded-lg">
                                        <p>{food.name}</p>
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm text-muted-foreground hidden sm:block">{food.calories}kcal | P:{food.protein}g F:{food.fat}g C:{food.carbs}g</p>
                                            <EditFoodDialog food={food} onSaved={fetchFoods} nutritionistId={user.id} />
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteFood(food.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                        </div>
                                    </div>
                                )) : <p className="text-muted-foreground">Nenhum alimento personalizado.</p>}
                            </div>

                            <h3 className="text-lg font-semibold mb-4 text-primary">Banco de Dados Público</h3>
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {publicFoods.map(food => (
                                    <div key={food.id} className="flex justify-between text-accent items-center p-3 bg-muted/50 rounded-lg">
                                        <p>{food.name}</p>
                                        <p className="text-sm text-muted-foreground hidden sm:block">{food.calories}kcal | P:{food.protein}g F:{food.fat}g C:{food.carbs}g</p>
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