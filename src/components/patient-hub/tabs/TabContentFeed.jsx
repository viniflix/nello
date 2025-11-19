import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Utensils, Calendar, Clock, ArrowRight, Flame, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import PatientActivityFeed from '@/components/patient-hub/PatientActivityFeed';
import { supabase } from '@/lib/customSupabaseClient';

const TabContentFeed = ({ patientId, activities, loading, onLoadMore }) => {
    const navigate = useNavigate();
    const [recentMeals, setRecentMeals] = useState([]);
    const [mealsLoading, setMealsLoading] = useState(true);

    useEffect(() => {
        const fetchRecentMeals = async () => {
            if (!patientId) return;

            setMealsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('meal_audit_log')
                    .select('id, action, meal_type, meal_date, meal_time, details, created_at')
                    .eq('patient_id', patientId)
                    .order('created_at', { ascending: false })
                    .limit(4);

                if (error) throw error;
                setRecentMeals(data || []);
            } catch (error) {
                console.error('Erro ao buscar refeições:', error);
                setRecentMeals([]);
            } finally {
                setMealsLoading(false);
            }
        };

        fetchRecentMeals();
    }, [patientId]);

    const translateMealType = (mealType) => {
        const translations = {
            'breakfast': 'Café da Manhã',
            'morning_snack': 'Lanche da Manhã',
            'lunch': 'Almoço',
            'afternoon_snack': 'Lanche da Tarde',
            'dinner': 'Jantar',
            'supper': 'Ceia'
        };
        return translations[mealType] || mealType;
    };

    const translateAction = (action) => {
        const translations = {
            'create': 'Registrado',
            'update': 'Editado',
            'delete': 'Deletado'
        };
        return translations[action] || action;
    };

    const getActionBadgeColor = (action) => {
        const colors = {
            'create': 'bg-[#5f6f52]',
            'update': 'bg-blue-600',
            'delete': 'bg-red-600'
        };
        return colors[action] || 'bg-gray-600';
    };

    const FoodDiaryHistoryCard = () => {
        return (
            <Card className="border-l-4 border-l-[#b99470] bg-gradient-to-br from-[#fefae0]/30 to-[#f9ebc7]/20">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Utensils className="w-4 h-4 text-[#b99470]" />
                            Diário Alimentar
                        </CardTitle>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/food-diary`)}
                            className="h-7 text-xs text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10"
                        >
                            Ver tudo
                            <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Últimos registros</p>
                </CardHeader>

                <CardContent className="space-y-2">
                    {mealsLoading ? (
                        <div className="text-center py-6">
                            <Loader2 className="w-6 h-6 animate-spin text-[#5f6f52] mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">Carregando...</p>
                        </div>
                    ) : recentMeals.length > 0 ? (
                        <>
                            {recentMeals.map((meal) => {
                                const createdDate = new Date(meal.created_at);
                                const totalCalories = meal.details?.total_calories || 0;
                                return (
                                    <div
                                        key={meal.id}
                                        className="flex items-center justify-between p-2 rounded-lg bg-[#fefae0]/50 hover:bg-[#fefae0] transition-colors border border-[#a9b388]/20"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-medium text-foreground truncate">
                                                    {translateMealType(meal.meal_type)}
                                                </span>
                                                <Badge className={`${getActionBadgeColor(meal.action)} text-white text-xs`}>
                                                    {translateAction(meal.action)}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Clock className="w-3 h-3" />
                                                <span>{createdDate.toLocaleDateString('pt-BR')}</span>
                                                <span>•</span>
                                                <span>{createdDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>

                                        <div className="text-right ml-2 flex-shrink-0">
                                            <div className="flex items-center gap-1">
                                                <Flame className="w-3 h-3 text-[#c4661f]" />
                                                <span className="text-sm font-bold text-[#5f6f52]">
                                                    {totalCalories}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/nutritionist/patients/${patientId}/food-diary`)}
                                className="w-full mt-2 border-[#5f6f52] text-[#5f6f52] hover:bg-[#5f6f52]/10"
                            >
                                Ver diário completo
                                <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                        </>
                    ) : (
                        <div className="text-center py-6">
                            <Utensils className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground mb-2">
                                Nenhuma refeição registrada
                            </p>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/nutritionist/patients/${patientId}/food-diary`)}
                                className="text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10 text-xs"
                            >
                                Abrir Diário Alimentar
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
                <PatientActivityFeed
                    patientId={patientId}
                    activities={activities}
                    loading={loading}
                    onLoadMore={onLoadMore}
                />
            </div>

            <div className="lg:col-span-1">
                <FoodDiaryHistoryCard />
            </div>
        </div>
    );
};

export default TabContentFeed;
