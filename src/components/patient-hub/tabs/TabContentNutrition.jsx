import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Utensils, Calculator, Calendar, ArrowRight, Flame, Activity, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getActiveMealPlan } from '@/lib/supabase/meal-plan-queries';

/**
 * TabContentNutrition - Dashboard de Nutrição
 * Estilo: Prontuário moderno com cards informativos
 */
const TabContentNutrition = ({ patientId, modulesStatus = {} }) => {
    const navigate = useNavigate();
    const [activePlan, setActivePlan] = useState(null);
    const [planLoading, setPlanLoading] = useState(true);

    // Buscar plano alimentar ativo
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

    // ============================================================
    // CARD 1: PLANO ALIMENTAR (Principal - Destaque)
    // ============================================================
    const MealPlanCard = () => {
        if (planLoading) {
            return (
                <Card className="col-span-2">
                    <CardContent className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-[#5f6f52]" />
                    </CardContent>
                </Card>
            );
        }

        if (!activePlan) {
            // Estado Vazio - Sem Plano
            return (
                <Card className="col-span-2 border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30 hover:shadow-lg transition-all">
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
                        <Button
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/meal-plan`)}
                            className="gap-2"
                        >
                            <Utensils className="w-4 h-4" />
                            Criar Plano Alimentar
                        </Button>
                    </CardContent>
                </Card>
            );
        }

        // Estado Preenchido - Com Plano Ativo
        return (
            <Card className="col-span-2 border-l-4 border-l-[#5f6f52] hover:shadow-xl transition-all bg-gradient-to-br from-[#fefae0]/20 to-[#fefae0]/30">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <Utensils className="w-5 h-5 text-[#5f6f52]" />
                                <CardTitle className="text-lg">Plano Alimentar</CardTitle>
                                <Badge className="bg-[#a9b388]/20 text-[#5f6f52] border-[#5f6f52]">
                                    Vigente
                                </Badge>
                            </div>
                            <CardDescription className="text-base font-semibold text-foreground mt-1">
                                {activePlan.name}
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/meal-plan`)}
                            className="gap-1"
                        >
                            Gerenciar
                            <ArrowRight className="w-3 h-3" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent>
                    {/* Métricas Principais */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        {/* Calorias Totais */}
                        <div className="text-center p-2.5 bg-[#fefae0] rounded-lg border border-[#c4661f]">
                            <Flame className="w-4 h-4 text-[#c4661f] mx-auto mb-0.5" />
                            <div className="text-xl md:text-2xl font-bold text-foreground">
                                {activePlan.daily_calories ? Math.round(activePlan.daily_calories) : 0}
                            </div>
                            <div className="text-xs text-muted-foreground">kcal/dia</div>
                        </div>

                        {/* Proteínas */}
                        <div className="text-center p-2.5 bg-[#fefae0] rounded-lg border border-[#8B3BF2]">
                            <div className="text-xs text-[#8B3BF2] font-medium mb-0.5">Proteínas</div>
                            <div className="text-lg md:text-xl font-bold text-[#8B3BF2]">
                                {activePlan.daily_protein ? Math.round(activePlan.daily_protein) : 0}g
                            </div>
                            <div className="text-xs text-[#8B3BF2]">
                                {activePlan.daily_calories
                                    ? Math.round((activePlan.daily_protein * 4 / activePlan.daily_calories) * 100)
                                    : 0}%
                            </div>
                        </div>

                        {/* Carboidratos */}
                        <div className="text-center p-2.5 bg-[#a9b388]/10 rounded-lg border border-[#3B6FF2]">
                            <div className="text-xs text-[#3B6FF2] font-medium mb-0.5">Carboidratos</div>
                            <div className="text-lg md:text-xl font-bold text-[#3B6FF2]">
                                {activePlan.daily_carbs ? Math.round(activePlan.daily_carbs) : 0}g
                            </div>
                            <div className="text-xs text-[#3B6FF2]">
                                {activePlan.daily_calories
                                    ? Math.round((activePlan.daily_carbs * 4 / activePlan.daily_calories) * 100)
                                    : 0}%
                            </div>
                        </div>

                        {/* Gorduras */}
                        <div className="text-center p-2.5 bg-[#f9ebc7] rounded-lg border border-[#F28B3B]">
                            <div className="text-xs text-[#F28B3B] font-medium mb-0.5">Gorduras</div>
                            <div className="text-lg md:text-xl font-bold text-[#F28B3B]">
                                {activePlan.daily_fat ? Math.round(activePlan.daily_fat) : 0}g
                            </div>
                            <div className="text-xs text-[#F28B3B]">
                                {activePlan.daily_calories
                                    ? Math.round((activePlan.daily_fat * 9 / activePlan.daily_calories) * 100)
                                    : 0}%
                            </div>
                        </div>
                    </div>

                    {/* Info Adicional */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t">
                        <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Iniciado em {new Date(activePlan.start_date).toLocaleDateString('pt-BR')}
                            </span>
                            <span>• {activePlan.meals?.length || 0} refeições/dia</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/meal-plan`)}
                            className="h-7 text-xs"
                        >
                            Ver detalhes completos →
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    // ============================================================
    // CARD 2: GASTO ENERGÉTICO (Módulo ainda não implementado)
    // ============================================================
    const EnergyExpenditureCard = () => {
        return (
            <Card className="hover:shadow-md transition-all border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-[#5f6f52]" />
                        <CardTitle className="text-base">Gasto Energético</CardTitle>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="text-center py-8">
                        <Activity className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-sm font-medium text-foreground mb-2">
                            Módulo em Desenvolvimento
                        </p>
                        <p className="text-xs text-muted-foreground">
                            O cálculo de gasto energético (VET/TMB) será implementado em breve
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    };


    // ============================================================
    // RENDER PRINCIPAL
    // ============================================================
    return (
        <div className="space-y-6">
            {/* Header da Seção */}
            <div>
                <h3 className="text-xl font-bold text-foreground mb-1">Nutrição</h3>
                <p className="text-sm text-muted-foreground">
                    Prescrição dietética, gasto energético e acompanhamento alimentar
                </p>
            </div>

            {/* Grid de Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Card Principal ocupa 2 colunas */}
                <MealPlanCard />

                {/* Card secundário ocupa 1 coluna */}
                <EnergyExpenditureCard />
            </div>
        </div>
    );
};

export default TabContentNutrition;
