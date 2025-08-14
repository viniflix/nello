import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const FoodListItem = ({ food }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-muted/50 rounded-lg"
    >
        <h3 className="font-semibold text-foreground">{food.name}</h3>
        <p className="text-sm text-muted-foreground">{food.group}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
            <p><strong>Calorias:</strong> {food.calories} kcal</p>
            <p><strong>Proteínas:</strong> {food.protein} g</p>
            <p><strong>Gorduras:</strong> {food.fat} g</p>
            <p><strong>Carbs:</strong> {food.carbs} g</p>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Por 100g</p>
    </motion.div>
);

const PatientSearch = () => {
    const { user } = useAuth();
    const { toast } = useToast();
    const [foods, setFoods] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchFoods = useCallback(async () => {
        if (!user || !user.profile) return;
        setLoading(true);

        const nutritionistId = user.profile.nutritionist_id;
        
        const { data, error } = await supabase
            .from('foods')
            .select('*')
            .or(`nutritionist_id.is.null${nutritionistId ? `,nutritionist_id.eq.${nutritionistId}` : ''}`);

        if (error) {
            toast({ title: "Erro", description: "Não foi possível carregar os alimentos.", variant: "destructive" });
        } else {
            setFoods(data || []);
        }
        setLoading(false);
    }, [user, toast]);

    useEffect(() => {
        fetchFoods();
    }, [fetchFoods]);

    const filteredFoods = useMemo(() => {
        if (!searchTerm) {
            return foods;
        }
        return foods.filter(food =>
            food.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, foods]);
    
    return (
        <div className="p-4 pb-24">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <Card className="glass-card mb-6">
                    <CardHeader>
                        <CardTitle>Pesquisar Alimentos</CardTitle>
                        <CardDescription>Consulte informações nutricionais de diversos alimentos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                            <Input
                                type="text"
                                placeholder="Busque por um alimento..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10"
                            />
                        </div>
                    </CardContent>
                </Card>

                {loading ? (
                    <p className="text-center text-muted-foreground">Carregando banco de alimentos...</p>
                ) : (
                    <div className="space-y-4">
                        {filteredFoods.length > 0 ? (
                            filteredFoods.map(food => <FoodListItem key={food.id} food={food} />)
                        ) : (
                            <p className="text-center text-muted-foreground">Nenhum alimento encontrado.</p>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default PatientSearch;