import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Utensils, Calendar, ArrowRight, Flame, Loader2, BookHeart, TrendingUp, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getActiveMealPlan } from '@/lib/supabase/meal-plan-queries';
import { calculateDiaryAdherence, getNutritionalSummary } from '@/lib/supabase/food-diary-queries';
import EnergyExpenditureSummaryCard from '@/components/patient-hub/EnergyExpenditureSummaryCard';

const TabContentNutrition = ({ patientId, modulesStatus = {} }) => {
    const navigate = useNavigate();
    const [activePlan, setActivePlan] = useState(null);
    const [planLoading, setPlanLoading] = useState(true);
    const [diaryStats, setDiaryStats] = useState(null);
    const [diaryLoading, setDiaryLoading] = useState(true);

    useEffect(() => {
        const fetchActivePlan = async () => {
            if (!patientId) return;

            setPlanLoading(true);
            try {
                const { data, error } = await getActiveMealPlan(patientId);
                if (error) throw error;
                setActivePlan(data);
            } catch (error) {
                console.error('Erro ao buscar plano ativo:', error);
                setActivePlan(null);
            } finally {
                setPlanLoading(false);
            }
        };

        fetchActivePlan();
    }, [patientId]);

    useEffect(() => {
        const fetchDiaryStats = async () => {
            if (!patientId) return;

            setDiaryLoading(true);
            try {
                // Buscar adesão dos últimos 7 dias
                const { data: adherence } = await calculateDiaryAdherence(patientId, 7);

                // Buscar resumo nutricional dos últimos 7 dias
                const endDate = new Date().toISOString().split('T')[0];
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 7);
                const startDateStr = startDate.toISOString().split('T')[0];

                const { data: summary } = await getNutritionalSummary(patientId, startDateStr, endDate);

                setDiaryStats({
                    adherence: adherence || { adherencePercentage: 0, totalMeals: 0, currentStreak: 0 },
                    summary: summary || { avgCaloriesPerDay: 0, avgProteinPerDay: 0 }
                });
            } catch (error) {
                console.error('Erro ao buscar estatísticas do diário:', error);
                setDiaryStats(null);
            } finally {
                setDiaryLoading(false);
            }
        };

        fetchDiaryStats();
    }, [patientId]);

    const MealPlanCard = () => {
        if (planLoading) {
            return (
                <Card className="h-full">
                    <CardContent className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-[#5f6f52]" />
                    </CardContent>
                </Card>
            );
        }

        if (!activePlan) {
            return (
                <Card
                    className="border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30 hover:shadow-lg transition-all cursor-pointer h-full"
                    onClick={() => navigate(`/nutritionist/patients/${patientId}/meal-plan`)}
                >
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-16 h-16 rounded-full bg-[#fefae0] flex items-center justify-center mb-4">
                            <Utensils className="w-8 h-8 text-[#5f6f52]" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                            Nenhum Plano Alimentar Ativo
                        </h3>
                        <p className="text-sm text-muted-foreground mb-6 max-w-md">
                            Crie um plano alimentar personalizado com refeições, alimentos e valores nutricionais
                        </p>
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-[#5f6f52]">
                            <Utensils className="w-4 h-4" />
                            Criar Plano Alimentar
                            <ArrowRight className="w-4 h-4" />
                        </span>
                    </CardContent>
                </Card>
            );
        }

        return (
            <Card
                className="border-l-4 border-l-[#5f6f52] hover:shadow-xl transition-all bg-gradient-to-br from-[#fefae0]/20 to-[#fefae0]/30 cursor-pointer h-full"
                onClick={() => navigate(`/nutritionist/patients/${patientId}/meal-plan`)}
            >
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 mb-1">
                        <Utensils className="w-5 h-5 text-[#5f6f52]" />
                        <CardTitle className="text-lg">Plano Alimentar</CardTitle>
                        <Badge className="bg-[#a9b388]/20 text-[#5f6f52] border-[#5f6f52]">
                            Vigente
                        </Badge>
                    </div>
                    <CardDescription className="text-base font-semibold text-foreground">
                        {activePlan.name}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="text-center p-2 bg-[#fefae0] rounded-lg border border-[#c4661f]">
                            <Flame className="w-4 h-4 text-[#c4661f] mx-auto mb-0.5" />
                            <div className="text-xl font-bold text-foreground">
                                {activePlan.daily_calories ? Math.round(activePlan.daily_calories) : 0}
                            </div>
                            <div className="text-xs text-muted-foreground">kcal/dia</div>
                        </div>

                        <div className="text-center p-2 bg-[#fefae0] rounded-lg border border-[#8B3BF2]">
                            <div className="text-xs text-[#8B3BF2] font-medium mb-0.5">Proteínas</div>
                            <div className="text-lg font-bold text-[#8B3BF2]">
                                {activePlan.daily_protein ? Math.round(activePlan.daily_protein) : 0}g
                            </div>
                            <div className="text-xs text-[#8B3BF2]">
                                {activePlan.daily_calories
                                    ? Math.round((activePlan.daily_protein * 4 / activePlan.daily_calories) * 100)
                                    : 0}%
                            </div>
                        </div>

                        <div className="text-center p-2 bg-[#a9b388]/10 rounded-lg border border-[#3B6FF2]">
                            <div className="text-xs text-[#3B6FF2] font-medium mb-0.5">Carboidratos</div>
                            <div className="text-lg font-bold text-[#3B6FF2]">
                                {activePlan.daily_carbs ? Math.round(activePlan.daily_carbs) : 0}g
                            </div>
                            <div className="text-xs text-[#3B6FF2]">
                                {activePlan.daily_calories
                                    ? Math.round((activePlan.daily_carbs * 4 / activePlan.daily_calories) * 100)
                                    : 0}%
                            </div>
                        </div>

                        <div className="text-center p-2 bg-[#f9ebc7] rounded-lg border border-[#F28B3B]">
                            <div className="text-xs text-[#F28B3B] font-medium mb-0.5">Gorduras</div>
                            <div className="text-lg font-bold text-[#F28B3B]">
                                {activePlan.daily_fat ? Math.round(activePlan.daily_fat) : 0}g
                            </div>
                            <div className="text-xs text-[#F28B3B]">
                                {activePlan.daily_calories
                                    ? Math.round((activePlan.daily_fat * 9 / activePlan.daily_calories) * 100)
                                    : 0}%
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-3 border-t">
                        <span className="flex items-center gap-1 text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            Iniciado em {new Date(activePlan.start_date).toLocaleDateString('pt-BR')}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/meal-plan`)}
                        >
                            Abrir <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    const FoodDiaryCard = () => {
        if (diaryLoading) {
            return (
                <Card className="h-full">
                    <CardContent className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-[#5f6f52]" />
                    </CardContent>
                </Card>
            );
        }

        const hasData = diaryStats && diaryStats.adherence.totalMeals > 0;

        return (
            <Card
                className="border-l-4 border-l-[#c4661f] hover:shadow-lg transition-all h-full bg-gradient-to-br from-[#fefae0]/20 to-white cursor-pointer"
                onClick={() => navigate(`/nutritionist/patients/${patientId}/food-diary`)}
            >
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 mb-1">
                        <BookHeart className="w-5 h-5 text-[#c4661f]" />
                        <CardTitle className="text-lg">Diário Alimentar</CardTitle>
                    </div>
                    <CardDescription className="text-sm">
                        Últimos 7 dias
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {hasData ? (
                        <>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="text-center p-3 bg-[#fefae0]/50 rounded-lg border border-[#a9b388]/30">
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                        <TrendingUp className="w-3 h-3 text-[#5f6f52]" />
                                        <span className="text-xs text-muted-foreground">Adesão</span>
                                    </div>
                                    <div className="text-2xl font-bold text-[#5f6f52]">
                                        {diaryStats.adherence.adherencePercentage}%
                                    </div>
                                </div>

                                <div className="text-center p-3 bg-[#fefae0]/50 rounded-lg border border-[#a9b388]/30">
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                        <Activity className="w-3 h-3 text-[#c4661f]" />
                                        <span className="text-xs text-muted-foreground">Sequência</span>
                                    </div>
                                    <div className="text-2xl font-bold text-[#c4661f]">
                                        {diaryStats.adherence.currentStreak}
                                    </div>
                                    <div className="text-xs text-muted-foreground">dias</div>
                                </div>
                            </div>

                            <div className="bg-[#fefae0]/40 rounded-lg p-3 mb-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-muted-foreground">Média Calórica</span>
                                    <div className="flex items-center gap-1">
                                        <Flame className="w-3 h-3 text-[#c4661f]" />
                                        <span className="text-sm font-bold text-[#c4661f]">
                                            {diaryStats.summary.avgCaloriesPerDay}
                                        </span>
                                        <span className="text-xs text-muted-foreground">kcal/dia</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">Total de Refeições</span>
                                    <span className="text-sm font-semibold text-foreground">
                                        {diaryStats.adherence.totalMeals}
                                    </span>
                                </div>
                            </div>

                            <div className="pt-3 border-t flex justify-center">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-[#5f6f52] hover:bg-[#5f6f52]/10"
                                    onClick={() => navigate(`/nutritionist/patients/${patientId}/food-diary`)}
                                >
                                    Ver Diário Completo
                                    <ArrowRight className="w-3 h-3 ml-1" />
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-6">
                            <div className="w-12 h-12 rounded-full bg-[#fefae0] flex items-center justify-center mx-auto mb-3">
                                <BookHeart className="w-6 h-6 text-[#c4661f]" />
                            </div>
                            <p className="text-sm font-medium text-foreground mb-2">
                                Nenhum Registro Recente
                            </p>
                            <p className="text-xs text-muted-foreground mb-4">
                                Paciente ainda não registrou refeições nos últimos 7 dias
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-[#c4661f] text-[#c4661f] hover:bg-[#c4661f]/10"
                                onClick={() => navigate(`/nutritionist/patients/${patientId}/food-diary`)}
                            >
                                Abrir Diário
                                <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };


    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-foreground mb-1">Nutrição</h3>
                <p className="text-sm text-muted-foreground">
                    Prescrição dietética, gasto energético e acompanhamento alimentar
                </p>
            </div>

            <div className="space-y-4">
                <MealPlanCard />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <EnergyExpenditureSummaryCard patientId={patientId} />
                    <FoodDiaryCard />
                </div>
            </div>
        </div>
    );
};

export default TabContentNutrition;
