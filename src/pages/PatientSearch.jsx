import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';


const FoodItem = ({ food }) => (
    <Card className="bg-card/80">
        <CardHeader>
            <CardTitle className="text-base">{food.name}</CardTitle>
            <CardDescription>{food.group}</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm">
                <p><strong className="text-destructive">{food.calories}</strong> kcal</p>
                <p><strong className="text-primary">{food.protein}g</strong> Proteína</p>
                <p><strong className="text-accent">{food.fat}g</strong> Gordura</p>
                <p><strong className="text-secondary">{food.carbs}g</strong> Carboidrato</p>
            </div>
             <p className="text-xs text-muted-foreground mt-2">Valores por 100g</p>
        </CardContent>
    </Card>
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
        const query = supabase
            .from('foods')
            .select('*')
            .or(`nutritionist_id.is.null,nutritionist_id.eq.${nutritionistId}`);

        const { data, error } = await query;
        
        if (error) {
            console.error("Error fetching foods", error);
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
        if (!searchTerm) return foods;
        return foods.filter(food =>
            food.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (food.group && food.group.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [searchTerm, foods]);

  return (
    <div className="pb-24 p-4">
        <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input 
                placeholder="Pesquisar alimento..." 
                className="pl-10 h-12 text-base"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        {loading ? (
            <p className="text-center text-muted-foreground">Carregando alimentos...</p>
        ) : (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
            >
                {filteredFoods.length > 0 ? (
                    filteredFoods.map((food, index) => (
                        <motion.div
                            key={food.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                        >
                            <FoodItem food={food} />
                        </motion.div>
                    ))
                ) : (
                    <p className="text-center text-muted-foreground mt-8">Nenhum alimento encontrado.</p>
                )}
            </motion.div>
        )}
    </div>
  )
}

export default PatientSearch;