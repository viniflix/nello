import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, TrendingDown, TrendingUp, Scale, Trophy, ArrowRight, Calendar, Flame } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { getActiveGoal, getDaysRemaining, getProgressStatus } from '@/lib/supabase/goals-queries';

const TabContentAdherence = ({ patientId, modulesStatus = {} }) => {
    const navigate = useNavigate();
    const [activeGoal, setActiveGoal] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadActiveGoal();
    }, [patientId]);

    const loadActiveGoal = async () => {
        setLoading(true);
        try {
            const { data } = await getActiveGoal(patientId);
            setActiveGoal(data);
        } catch (error) {
            console.error('Erro ao carregar meta ativa:', error);
        } finally {
            setLoading(false);
        }
    };

    const getGoalTypeIcon = (type) => {
        const icons = {
            weight_loss: TrendingDown,
            weight_gain: TrendingUp,
            weight_maintenance: Scale,
            custom: Target
        };
        return icons[type] || Target;
    };

    const GoalsCard = () => {
        if (loading) {
            return (
                <Card className="border-l-4 border-l-[#a9b388] h-full">
                    <CardContent className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">Carregando meta...</p>
                    </CardContent>
                </Card>
            );
        }

        // Se não tem meta ativa, mostrar card de criação
        if (!activeGoal) {
            return (
                <Card
                    className="border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30 hover:shadow-md transition-all cursor-pointer h-full"
                    onClick={() => navigate(`/nutritionist/patients/${patientId}/goals`)}
                >
                    <CardContent className="py-8 text-center">
                        <div className="w-12 h-12 rounded-full bg-[#fefae0] flex items-center justify-center mx-auto mb-3">
                            <Target className="w-6 h-6 text-[#5f6f52]" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground mb-2">
                            Metas Nutricionais
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                            Nenhuma meta ativa. Defina um objetivo nutricional para o paciente
                        </p>
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-[#5f6f52]">
                            <Target className="w-4 h-4" />
                            Criar Meta
                            <ArrowRight className="w-3 h-3" />
                        </span>
                    </CardContent>
                </Card>
            );
        }

        // Card com meta ativa
        const GoalIcon = getGoalTypeIcon(activeGoal.goal_type);
        const daysRemaining = getDaysRemaining(activeGoal.target_date);
        const progressStatus = getProgressStatus(activeGoal);
        const weightRemaining = Math.abs(activeGoal.current_weight - activeGoal.target_weight);

        return (
            <Card
                className="border-l-4 border-l-[#5f6f52] hover:shadow-xl transition-all bg-gradient-to-br from-[#fefae0]/20 to-[#fefae0]/30 cursor-pointer h-full"
                onClick={() => navigate(`/nutritionist/patients/${patientId}/goals`)}
            >
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <GoalIcon className="w-5 h-5 text-[#5f6f52]" />
                        <CardTitle className="text-base">Meta Ativa</CardTitle>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 text-xs">
                            Em andamento
                        </Badge>
                    </div>
                </CardHeader>

                <CardContent>
                    {/* Título e progresso */}
                    <div className="mb-3">
                        <h3 className="font-semibold text-foreground mb-2">{activeGoal.title}</h3>
                        <div className="mb-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                <span>Progresso</span>
                                <span className="font-semibold text-[#5f6f52]">
                                    {activeGoal.progress_percentage?.toFixed(0) || 0}%
                                </span>
                            </div>
                            <Progress value={activeGoal.progress_percentage || 0} className="h-2" />
                        </div>
                        {progressStatus && (
                            <Badge variant="outline" className={`text-xs ${progressStatus.color}`}>
                                {progressStatus.label}
                            </Badge>
                        )}
                    </div>

                    {/* Estatísticas */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-[#fefae0] border border-[#a9b388] rounded p-2 text-center">
                            <div className="text-lg font-bold text-foreground">
                                {activeGoal.current_weight?.toFixed(1)}
                            </div>
                            <div className="text-xs text-muted-foreground">Peso Atual</div>
                        </div>
                        <div className="bg-[#fefae0] border border-[#5f6f52] rounded p-2 text-center">
                            <div className="text-lg font-bold text-[#5f6f52]">
                                {activeGoal.target_weight?.toFixed(1)}
                            </div>
                            <div className="text-xs text-muted-foreground">Meta</div>
                        </div>
                    </div>

                    {/* Info adicional */}
                    <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center justify-between">
                            <span>Faltam:</span>
                            <span className="font-semibold text-foreground">{weightRemaining.toFixed(1)} kg</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Prazo:
                            </span>
                            <span className="font-semibold text-foreground">
                                {daysRemaining > 0 ? `${daysRemaining} dias` : 'Prazo expirado'}
                            </span>
                        </div>
                        {activeGoal.daily_calorie_goal && (
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                    <Flame className="w-3 h-3" />
                                    Meta diária:
                                </span>
                                <span className="font-semibold text-foreground">
                                    {Math.round(activeGoal.daily_calorie_goal)} kcal
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="text-xs pt-3 mt-3 border-t flex items-center justify-between">
                        <span className="text-muted-foreground">Meta criada em {new Date(activeGoal.start_date).toLocaleDateString('pt-BR')}</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[#5f6f52] hover:bg-[#5f6f52]/10"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/goals`)}
                        >
                            Abrir <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    const AchievementsCard = () => {
        return (
            <Card className="border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30 hover:shadow-md transition-all">
                <CardContent className="py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-[#fefae0] flex items-center justify-center mx-auto mb-3">
                        <Trophy className="w-6 h-6 text-[#5f6f52]" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-2">
                        Conquistas
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                        Sistema de gamificação em desenvolvimento - Badges e conquistas para motivar o paciente
                    </p>
                    <Button
                        variant="outline"
                        onClick={() => navigate(`/nutritionist/patients/${patientId}/achievements`)}
                        className="gap-2 border-[#5f6f52] text-[#5f6f52] hover:bg-[#5f6f52]/10"
                    >
                        <Trophy className="w-4 h-4" />
                        Ver Conquistas
                    </Button>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-foreground mb-1">Adesão ao Tratamento</h3>
                <p className="text-sm text-muted-foreground">
                    Metas, prescrições e sistema de conquistas
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <GoalsCard />
                <AchievementsCard />
            </div>
        </div>
    );
};

export default TabContentAdherence;
