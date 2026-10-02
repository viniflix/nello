



import { Target, TrendingDown, TrendingUp, Calendar, AlertCircle, CheckCircle2, Pause, X, Flame, Scale, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';





import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';




import { getDaysRemaining, getProgressStatus } from '@/lib/supabase/goals-queries';

import { cn } from '@/lib/utils';



export const ActiveGoalCard = ({ goal, onUpdateProgress, onComplete, onPause, onCancel }) => {
    const GoalIcon = getGoalTypeIcon(goal.goal_type);
    const daysRemaining = getDaysRemaining(goal.target_date);
    const progressStatus = getProgressStatus(goal);
    const weightChange = goal.current_weight - goal.target_weight;
    const weightRemaining = Math.abs(weightChange);

    return (
        <Card className="shadow-md bg-gradient-to-br from-[#fefae0]/30 to-white">
            <CardHeader className="bg-[#5f6f52] text-white rounded-t-lg">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center">
                            <GoalIcon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-lg font-bold mb-1">{goal.title}</CardTitle>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-white/20 text-white border-0 text-xs">
                                    <Activity className="w-3 h-3 mr-1" />
                                    Em Andamento
                                </Badge>
                                <span className="text-xs text-white/70">
                                    {new Date(goal.start_date).toLocaleDateString('pt-BR')}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onUpdateProgress}
                            className="bg-white/90 text-[#5f6f52] hover:bg-white text-xs h-8"
                        >
                            <Scale className="w-3.5 h-3.5 mr-1.5" />
                            Atualizar
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onComplete}
                            className="bg-[#a9b388] text-white hover:bg-[#a9b388]/90 h-8 px-2"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
                {/* Progresso Principal */}
                <div className="bg-[#fefae0]/40 p-4 rounded-lg border border-[#a9b388]/40">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase">Progresso</span>
                        <span className="text-2xl font-bold text-[#5f6f52]">
                            {goal.progress_percentage?.toFixed(1) || 0}%
                        </span>
                    </div>
                    <Progress value={goal.progress_percentage || 0} className="h-3 mb-2" />
                    {progressStatus && (
                        <div className="flex items-center justify-between">
                            <Badge variant="outline" className={cn("text-xs", progressStatus.color)}>
                                {progressStatus.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                                {goal.progress_percentage >= 100 ? 'Concluída!' : 'Em progresso'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Estatísticas em Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="text-center p-3 bg-white rounded-lg border border-[#a9b388]/30 hover:border-[#5f6f52]/50 transition-colors">
                        <Scale className="w-4 h-4 text-[#5f6f52] mx-auto mb-1" />
                        <div className="text-xl font-bold text-foreground">
                            {goal.current_weight?.toFixed(1)}
                        </div>
                        <div className="text-xs text-muted-foreground">Peso Atual</div>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border border-[#5f6f52]/40 hover:border-[#5f6f52] transition-colors">
                        <Target className="w-4 h-4 text-[#5f6f52] mx-auto mb-1" />
                        <div className="text-xl font-bold text-[#5f6f52]">
                            {goal.target_weight?.toFixed(1)}
                        </div>
                        <div className="text-xs text-muted-foreground">Meta</div>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border border-[#c4661f]/30 hover:border-[#c4661f]/50 transition-colors">
                        <TrendingDown className="w-4 h-4 text-[#c4661f] mx-auto mb-1" />
                        <div className="text-xl font-bold text-[#c4661f]">
                            {weightRemaining.toFixed(1)}
                        </div>
                        <div className="text-xs text-muted-foreground">Faltam</div>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border border-[#a9b388]/40 hover:border-[#a9b388] transition-colors">
                        <Calendar className="w-4 h-4 text-[#a9b388] mx-auto mb-1" />
                        <div className="text-xl font-bold text-foreground">
                            {daysRemaining > 0 ? daysRemaining : 0}
                        </div>
                        <div className="text-xs text-muted-foreground">Dias</div>
                    </div>
                </div>

                {/* Informações Nutricionais */}
                {(goal.daily_calorie_goal || goal.required_daily_deficit) && (
                    <div className="bg-[#fefae0]/30 border border-[#a9b388]/40 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Flame className="w-4 h-4 text-[#c4661f]" />
                            <h3 className="font-semibold text-foreground">Plano Nutricional</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            {goal.daily_calorie_goal && (
                                <div className="bg-white/60 p-2.5 rounded border border-[#a9b388]/30">
                                    <span className="text-xs text-muted-foreground block mb-0.5">Meta Calórica Diária</span>
                                    <span className="text-lg font-bold text-foreground">{Math.round(goal.daily_calorie_goal)}</span>
                                    <span className="text-xs text-muted-foreground ml-1">kcal</span>
                                </div>
                            )}
                            {goal.required_daily_deficit && (
                                <div className="bg-white/60 p-2.5 rounded border border-[#a9b388]/30">
                                    <span className="text-xs text-muted-foreground block mb-0.5">Déficit Necessário</span>
                                    <span className="text-lg font-bold text-foreground">{Math.round(Math.abs(goal.required_daily_deficit))}</span>
                                    <span className="text-xs text-muted-foreground ml-1">kcal/dia</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Alertas e Notas */}
                {goal.warnings && goal.warnings.length > 0 && (
                    <Alert className="bg-yellow-50/50 border-yellow-300">
                        <AlertCircle className="h-4 w-4 text-yellow-700" />
                        <AlertDescription>
                            <div className="font-semibold text-yellow-900 mb-1.5 text-sm">Pontos de Atenção</div>
                            {goal.warnings.map((warning, index) => (
                                <div key={index} className="flex items-start gap-1.5 text-sm text-yellow-900 mb-1">
                                    <span>•</span>
                                    <span>{warning.message}</span>
                                </div>
                            ))}
                        </AlertDescription>
                    </Alert>
                )}

                {/* Ações */}
                <div className="flex gap-2 pt-3 border-t border-[#a9b388]/30">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onPause}
                        className="flex-1 text-xs h-9"
                    >
                        <Pause className="w-3.5 h-3.5 mr-1.5" />
                        Pausar
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onCancel}
                        className="flex-1 text-xs h-9 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                        <X className="w-3.5 h-3.5 mr-1.5" />
                        Cancelar
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
export const GoalHistoryItem = ({ goal }) => {
    const GoalIcon = getGoalTypeIcon(goal.goal_type);
    const statusConfig = {
        completed: {
            label: 'Concluída',
            badgeColor: 'bg-[#a9b388] text-white',
            borderColor: 'border-[#a9b388]/40',
            bgColor: 'bg-[#a9b388]/5',
            icon: CheckCircle2
        },
        cancelled: {
            label: 'Cancelada',
            badgeColor: 'bg-red-100 text-red-800',
            borderColor: 'border-red-200',
            bgColor: 'bg-red-50/30',
            icon: X
        },
        paused: {
            label: 'Pausada',
            badgeColor: 'bg-yellow-100 text-yellow-800',
            borderColor: 'border-yellow-200',
            bgColor: 'bg-yellow-50/30',
            icon: Pause
        }
    };
    const config = statusConfig[goal.status] || statusConfig.completed;
    const StatusIcon = config.icon;

    return (
        <div className={cn(
            "flex items-center gap-3 p-3 rounded-lg border hover:border-[#5f6f52]/50 transition-colors",
            config.bgColor,
            config.borderColor
        )}>
            <div className="w-9 h-9 rounded bg-[#fefae0] flex items-center justify-center flex-shrink-0 border border-[#a9b388]/30">
                <GoalIcon className="w-4 h-4 text-[#5f6f52]" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-sm text-foreground truncate">{goal.title}</h4>
                    <Badge className={cn("text-xs border-0", config.badgeColor)}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {config.label}
                    </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <Scale className="w-3 h-3" />
                        {goal.initial_weight}kg → {goal.target_weight}kg
                    </span>
                    <span>•</span>
                    <span>{goal.progress_percentage?.toFixed(1) || 0}%</span>
                    {goal.completion_date && (
                        <>
                            <span>•</span>
                            <span>{new Date(goal.completion_date).toLocaleDateString('pt-BR')}</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
export const getGoalTypeIcon = (type) => {
    const icons = {
        weight_loss: TrendingDown,
        weight_gain: TrendingUp,
        weight_maintenance: Scale,
        body_composition: Activity,
        custom: Target
    };
    return icons[type] || Target;
};