import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, TrendingDown, TrendingUp, Scale, Trophy, ArrowRight, Calendar, Flame, Award, Star, MessageSquare, Send, ExternalLink, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getActiveGoal, getDaysRemaining, getProgressStatus } from '@/lib/supabase/goals-queries';
import { patientRoute } from '@/lib/utils/patientRoutes';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
    getMessageTemplates,
    dispatchMessageTemplate,
    previewTemplate,
    TEMPLATE_CONTEXTS
} from '@/lib/supabase/message-templates-queries';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ICON_MAP = {
    trophy: Trophy,
    award: Award,
    target: Target,
    flame: Flame,
    star: Star,
    trending_up: TrendingUp,
};

const TabContentAdherence = ({ patientId, patientData, modulesStatus = {} }) => {
    const patient = patientData || { id: patientId };
    const navigate = useNavigate();
    const { user } = useAuth();
    const { toast } = useToast();
    const [activeGoal, setActiveGoal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [achievements, setAchievements] = useState([]);
    const [achievementsLoading, setAchievementsLoading] = useState(true);

    // Comunicação contextual (mensagens por template)
    const [templates, setTemplates] = useState([]);
    const [templatesLoading, setTemplatesLoading] = useState(true);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [dispatching, setDispatching] = useState(false);
    const [previewData, setPreviewData] = useState(null);

    useEffect(() => {
        loadActiveGoal();
    }, [patientId]);

    useEffect(() => {
        const fetchTemplates = async () => {
            if (!user?.id) return;
            setTemplatesLoading(true);
            try {
                const { data } = await getMessageTemplates({
                    nutritionistId: user.id,
                    isActive: true,
                    limit: 50
                });
                setTemplates(data || []);
            } finally {
                setTemplatesLoading(false);
            }
        };
        fetchTemplates();
    }, [user?.id]);

    useEffect(() => {
        const fetchAchievements = async () => {
            if (!patientId) {
                setAchievementsLoading(false);
                return;
            }
            setAchievementsLoading(true);
            const { data, error } = await supabase
                .from('user_achievements')
                .select('achieved_at, achievements(name, description, icon_name)')
                .eq('user_id', patientId)
                .order('achieved_at', { ascending: false })
                .limit(5);
            if (!error) {
                setAchievements(data || []);
            } else {
                setAchievements([]);
            }
            setAchievementsLoading(false);
        };
        fetchAchievements();
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

    const handleTemplateSelect = (id) => {
        setSelectedTemplateId(id);
        const tpl = templates.find(t => String(t.id) === id);
        if (tpl) {
            setPreviewData(previewTemplate({
                titleTemplate: tpl.title_template || '',
                bodyTemplate: tpl.body_template
            }));
        } else {
            setPreviewData(null);
        }
    };

    const handleDispatchMessage = async () => {
        if (!selectedTemplateId || !patientId || !user?.id) return;
        setDispatching(true);
        try {
            const { data, error } = await dispatchMessageTemplate({
                templateId: Number(selectedTemplateId),
                patientId,
                triggerEvent: 'manual_adherence_tab'
            });
            if (error) throw error;
            if (data?.ok === false) throw new Error(data.reason || 'Erro ao enviar');

            toast({ title: 'Mensagem enviada!', description: 'O paciente receberá a mensagem no app.', variant: 'default' });
            setSelectedTemplateId('');
            setPreviewData(null);
        } catch (err) {
            toast({
                title: 'Erro ao enviar mensagem',
                description: err?.message || 'Tente novamente. Se o problema continuar, verifique se os modelos de mensagem estão configurados.',
                variant: 'destructive'
            });
        } finally {
            setDispatching(false);
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
                    onClick={() => navigate(patientRoute(patient, 'goals'))}
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
                onClick={() => navigate(patientRoute(patient, 'goals'))}
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
                            onClick={() => navigate(patientRoute(patient, 'goals'))}
                        >
                            Abrir <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    const AchievementsCard = () => {
        const getIcon = (iconName) => ICON_MAP[iconName] || Award;

        if (achievementsLoading) {
            return (
                <Card className="border-dashed border-2 border-amber-300/50 bg-muted/20 h-full">
                    <CardContent className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">Carregando conquistas...</p>
                    </CardContent>
                </Card>
            );
        }

        // Estado vazio: mesmo padrão do card de Metas (opaco, borda pontilhada, centralizado, CTA)
        if (achievements.length === 0) {
            return (
                <Card
                    className="border-dashed border-2 border-amber-300/70 bg-amber-50/30 hover:shadow-md transition-all cursor-pointer h-full"
                    onClick={() => navigate(patientRoute(patient, 'achievements'))}
                >
                    <CardContent className="py-8 text-center">
                        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
                            <Trophy className="w-6 h-6 text-amber-600" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground mb-2">
                            Conquistas
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                            O paciente ainda não desbloqueou conquistas. Elas são concedidas ao registrar refeições e atingir metas.
                        </p>
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-amber-700">
                            <Trophy className="w-4 h-4" />
                            Ver conquistas
                            <ArrowRight className="w-3 h-3" />
                        </span>
                    </CardContent>
                </Card>
            );
        }

        // Estado preenchido: borda lateral, título no topo, 3 últimas conquistas lado a lado (título + data)
        const latestThree = achievements.slice(0, 3);

        return (
            <Card
                className="border-l-4 border-l-amber-500 hover:shadow-xl transition-all cursor-pointer h-full bg-gradient-to-br from-amber-50/30 to-amber-50/10"
                onClick={() => navigate(patientRoute(patient, 'achievements'))}
            >
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-amber-600" />
                            <CardTitle className="text-base">Conquistas</CardTitle>
                        </div>
                        <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
                            {achievements.length} desbloqueada{achievements.length !== 1 ? 's' : ''}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        {latestThree.map((ua, idx) => {
                            const ach = ua.achievements;
                            const Icon = getIcon(ach?.icon_name);
                            return (
                                <div
                                    key={idx}
                                    className="flex flex-col items-center justify-center p-2 rounded-lg bg-amber-50/70 border border-amber-200/80 text-center min-h-[72px]"
                                >
                                    <div className="p-1.5 bg-amber-500 rounded-full flex-shrink-0 mb-1">
                                        <Icon className="w-3.5 h-3.5 text-white" />
                                    </div>
                                    <p className="text-xs font-medium text-foreground truncate w-full" title={ach?.name || 'Conquista'}>
                                        {ach?.name || 'Conquista'}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {ua.achieved_at ? format(new Date(ua.achieved_at), 'dd/MM/yy', { locale: ptBR }) : '—'}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full gap-2 text-amber-700 hover:bg-amber-100"
                        onClick={(e) => { e.stopPropagation(); navigate(patientRoute(patient, 'achievements')); }}
                    >
                        Ver todas as conquistas
                        <ArrowRight className="w-3 h-3" />
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

            {/* Enviar mensagem ao paciente (templates) */}
            <Card className="border-l-4 border-l-[#5f6f52]">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-[#5f6f52]" />
                                Enviar mensagem ao paciente
                            </CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                Use modelos prontos para lembrete, parabéns por meta, pós-consulta e mais. Ideal para manter o paciente engajado.
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 gap-1 text-xs text-[#5f6f52] hover:bg-[#5f6f52]/10"
                            onClick={() => navigate('/nutritionist/message-templates')}
                        >
                            <ExternalLink className="w-3 h-3" />
                            Criar/editar modelos
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {templatesLoading ? (
                        <p className="text-sm text-muted-foreground py-2">Carregando modelos...</p>
                    ) : templates.length === 0 ? (
                        <div className="text-center py-4 rounded-lg border border-dashed bg-muted/20">
                            <p className="text-sm text-muted-foreground mb-2">
                                Você ainda não criou nenhum modelo de mensagem.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate('/nutritionist/message-templates')}
                                className="gap-1"
                            >
                                <MessageSquare className="w-4 h-4" />
                                Criar meu primeiro modelo
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Escolha o modelo</label>
                                <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione qual mensagem enviar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TEMPLATE_CONTEXTS.map(ctx => {
                                            const group = templates.filter(t => t.context === ctx.value);
                                            if (group.length === 0) return null;
                                            return (
                                                <React.Fragment key={ctx.value}>
                                                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                        {ctx.label}
                                                    </div>
                                                    {group.map(tpl => (
                                                        <SelectItem key={tpl.id} value={String(tpl.id)}>
                                                            {tpl.name}
                                                        </SelectItem>
                                                    ))}
                                                </React.Fragment>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>

                            {previewData && (
                                <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">
                                        Pré-visualização (na mensagem real, o nome do paciente e a data serão preenchidos automaticamente)
                                    </p>
                                    {previewData.title && (
                                        <p className="text-sm font-semibold">{previewData.title}</p>
                                    )}
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                                        {previewData.body}
                                    </p>
                                </div>
                            )}

                            <Button
                                className="w-full gap-2 bg-[#5f6f52] hover:bg-[#4a5a3e]"
                                disabled={!selectedTemplateId || dispatching}
                                onClick={handleDispatchMessage}
                            >
                                {dispatching ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                                Enviar mensagem ao paciente
                            </Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default TabContentAdherence;
