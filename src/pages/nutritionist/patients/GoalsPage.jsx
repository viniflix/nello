import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Target, TrendingDown, TrendingUp, Calendar, AlertCircle, CheckCircle2, Pause, Play, X, Flame, Scale, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
    createGoal,
    getPatientGoals,
    getActiveGoal,
    updateGoalProgress,
    completeGoal,
    cancelGoal,
    pauseGoal,
    resumeGoal,
    deleteGoal,
    getDaysRemaining,
    getProgressStatus,
    calculateGoalViability,
    calculateMinimumDeadline,
    calculateIdealDeadline
} from '@/lib/supabase/goals-queries';
import { cn } from '@/lib/utils';
import { toPortugueseError } from '@/lib/utils/errorMessages';

const GoalsPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [patientName, setPatientName] = useState('');
    const [nutritionistId, setNutritionistId] = useState(null);

    // Metas
    const [activeGoal, setActiveGoal] = useState(null);
    const [pastGoals, setPastGoals] = useState([]);

    // Formulário
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        goal_type: 'weight_loss',
        title: '',
        description: '',
        initial_weight: '',
        target_weight: '',
        start_date: new Date().toISOString().split('T')[0],
        target_date: ''
    });
    const [viabilityPreview, setViabilityPreview] = useState(null);
    const [loadingViability, setLoadingViability] = useState(false);
    const [deadlineRecommendation, setDeadlineRecommendation] = useState(null);

    // Modal de atualização de progresso
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [newWeight, setNewWeight] = useState('');

    // Modal de cancelamento
    const [showCancelDialog, setShowCancelDialog] = useState(false);

    // Obter ID do nutricionista
    useEffect(() => {
        const getNutritionistId = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setNutritionistId(user.id);
            }
        };
        getNutritionistId();
    }, []);

    // Carregar dados
    useEffect(() => {
        loadData();
    }, [patientId]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Buscar nome do paciente
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('name')
                .eq('id', patientId)
                .single();

            if (profile) {
                setPatientName(profile.name);
            }

            // Buscar meta ativa
            const { data: active } = await getActiveGoal(patientId);
            setActiveGoal(active);

            // Buscar metas anteriores
            const { data: past } = await getPatientGoals(patientId, {
                status: ['completed', 'cancelled', 'paused']
            });
            setPastGoals(past || []);

            // Se não tem meta ativa, abrir formulário e puxar peso
            if (!active) {
                // Puxar peso mais recente do paciente (tabela correta: growth_records)
                const { data: latestRecord } = await supabase
                    .from('growth_records')
                    .select('weight')
                    .eq('patient_id', patientId)
                    .order('record_date', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (latestRecord && latestRecord.weight) {
                    setFormData(prev => ({
                        ...prev,
                        initial_weight: latestRecord.weight.toString()
                    }));
                }

                setShowForm(true);
            }
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível carregar os dados das metas.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    // Calcular viabilidade em tempo real
    useEffect(() => {
        const calculateViability = async () => {
            // Verificar se todos os campos necessários estão preenchidos
            if (
                !formData.initial_weight ||
                !formData.target_weight ||
                !formData.start_date ||
                !formData.target_date
            ) {
                setViabilityPreview(null);
                return;
            }

            setLoadingViability(true);
            try {
                const viability = await calculateGoalViability(formData, patientId);
                setViabilityPreview(viability);
            } catch (error) {
                console.error('Erro ao calcular viabilidade:', error);
            } finally {
                setLoadingViability(false);
            }
        };

        // Debounce: esperar 500ms após última alteração
        const timeoutId = setTimeout(calculateViability, 500);
        return () => clearTimeout(timeoutId);
    }, [formData, patientId]);

    // Atualizar título automaticamente baseado no tipo
    useEffect(() => {
        if (formData.goal_type && formData.initial_weight && formData.target_weight) {
            const weightChange = Math.abs(parseFloat(formData.target_weight) - parseFloat(formData.initial_weight));
            const type = formData.goal_type;

            let title = '';
            if (type === 'weight_loss') {
                title = `Perder ${weightChange.toFixed(1)}kg`;
            } else if (type === 'weight_gain') {
                title = `Ganhar ${weightChange.toFixed(1)}kg`;
            } else if (type === 'weight_maintenance') {
                title = `Manter ${formData.initial_weight}kg`;
            } else {
                title = 'Meta personalizada';
            }

            setFormData(prev => ({ ...prev, title }));
        }
    }, [formData.goal_type, formData.initial_weight, formData.target_weight]);

    // Calcular recomendação de prazo quando define peso meta
    useEffect(() => {
        if (formData.initial_weight && formData.target_weight) {
            const initial = parseFloat(formData.initial_weight);
            const target = parseFloat(formData.target_weight);
            const weightChange = target - initial;

            if (!isNaN(initial) && !isNaN(target) && weightChange !== 0) {
                const minDays = calculateMinimumDeadline(weightChange);
                const idealDays = calculateIdealDeadline(weightChange);

                // Calcular datas
                const today = new Date(formData.start_date);
                const minDate = new Date(today);
                minDate.setDate(minDate.getDate() + minDays);
                const idealDate = new Date(today);
                idealDate.setDate(idealDate.getDate() + idealDays);

                setDeadlineRecommendation({
                    minDays,
                    idealDays,
                    minDate: minDate.toISOString().split('T')[0],
                    idealDate: idealDate.toISOString().split('T')[0],
                    weightChange: Math.abs(weightChange)
                });
            } else {
                setDeadlineRecommendation(null);
            }
        } else {
            setDeadlineRecommendation(null);
        }
    }, [formData.initial_weight, formData.target_weight, formData.start_date]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleCreateGoal = async () => {
        if (!nutritionistId) {
            toast({
                title: 'Erro',
                description: 'Usuário não autenticado.',
                variant: 'destructive'
            });
            return;
        }

        if (!formData.title || !formData.initial_weight || !formData.target_weight || !formData.target_date) {
            toast({
                title: 'Campos obrigatórios',
                description: 'Preencha todos os campos obrigatórios.',
                variant: 'destructive'
            });
            return;
        }

        setSubmitting(true);
        try {
            const { data, error } = await createGoal(
                {
                    ...formData,
                    initial_weight: parseFloat(formData.initial_weight),
                    target_weight: parseFloat(formData.target_weight)
                },
                patientId,
                nutritionistId
            );

            if (error) throw error;

            toast({
                title: 'Meta criada!',
                description: 'Meta criada com sucesso.',
                variant: 'success'
            });

            setShowForm(false);
            setFormData({
                goal_type: 'weight_loss',
                title: '',
                description: '',
                initial_weight: '',
                target_weight: '',
                start_date: new Date().toISOString().split('T')[0],
                target_date: ''
            });
            setViabilityPreview(null);
            await loadData();
        } catch (error) {
            console.error('Erro ao criar meta:', error);
            toast({
                title: 'Erro',
                description: toPortugueseError(error, 'Não foi possível criar a meta.'),
                variant: 'destructive'
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateProgress = async () => {
        if (!newWeight || !activeGoal) return;

        setSubmitting(true);
        try {
            const { error } = await updateGoalProgress(activeGoal.id, parseFloat(newWeight));

            if (error) throw error;

            toast({
                title: 'Progresso atualizado!',
                description: 'Peso atualizado com sucesso.',
                variant: 'success'
            });

            setShowProgressModal(false);
            setNewWeight('');
            await loadData();
        } catch (error) {
            console.error('Erro ao atualizar progresso:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível atualizar o progresso.',
                variant: 'destructive'
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleCompleteGoal = async () => {
        if (!activeGoal) return;

        if (!window.confirm('Tem certeza que deseja marcar esta meta como concluída?')) return;

        try {
            const { error } = await completeGoal(activeGoal.id);
            if (error) throw error;

            toast({
                title: 'Meta concluída!',
                description: 'Parabéns! Meta foi marcada como concluída.',
                variant: 'success'
            });

            await loadData();
        } catch (error) {
            console.error('Erro ao completar meta:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível completar a meta.',
                variant: 'destructive'
            });
        }
    };

    const handlePauseGoal = async () => {
        if (!activeGoal) return;

        try {
            const { error } = await pauseGoal(activeGoal.id);
            if (error) throw error;

            toast({
                title: 'Meta pausada',
                description: 'Meta foi pausada com sucesso.',
                variant: 'success'
            });

            await loadData();
        } catch (error) {
            console.error('Erro ao pausar meta:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível pausar a meta.',
                variant: 'destructive'
            });
        }
    };

    const handleCancelGoal = async () => {
        if (!activeGoal) return;

        try {
            const { error } = await cancelGoal(activeGoal.id, null);
            if (error) throw error;

            toast({
                title: 'Meta cancelada',
                description: 'Meta foi cancelada com sucesso.',
                variant: 'success'
            });

            setShowCancelDialog(false);
            await loadData();
        } catch (error) {
            console.error('Erro ao cancelar meta:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível cancelar a meta.',
                variant: 'destructive'
            });
        }
    };

    const getGoalTypeLabel = (type) => {
        const types = {
            weight_loss: 'Perda de Peso',
            weight_gain: 'Ganho de Peso',
            weight_maintenance: 'Manutenção de Peso',
            body_composition: 'Composição Corporal',
            custom: 'Personalizada'
        };
        return types[type] || type;
    };

    const getGoalTypeIcon = (type) => {
        const icons = {
            weight_loss: TrendingDown,
            weight_gain: TrendingUp,
            weight_maintenance: Scale,
            body_composition: Activity,
            custom: Target
        };
        return icons[type] || Target;
    };

    const getViabilityColor = (score) => {
        if (score >= 4) return 'text-green-600 bg-green-50 border-green-200';
        if (score >= 3) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
        return 'text-red-600 bg-red-50 border-red-200';
    };

    const getViabilityLabel = (score) => {
        if (score >= 4) return 'Ótima viabilidade';
        if (score >= 3) return 'Viabilidade moderada';
        return 'Baixa viabilidade';
    };

    return loading ? null : (
        <div className="flex flex-col min-h-screen bg-background">
            <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-6 md:py-8">
                {/* Header */}
                <div className="flex flex-col gap-4 mb-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/nutritionist/patients/${patientId}/hub?tab=adherence`)}
                        className="-ml-2 w-fit text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10"
                    >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Voltar
                    </Button>
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
                                <Target className="w-6 h-6 md:w-8 md:h-8 text-[#5f6f52]" />
                                <span className="truncate">Metas Nutricionais</span>
                            </h1>
                            <p className="text-sm text-muted-foreground mt-1 truncate">
                                Paciente: <span className="font-medium text-foreground">{patientName}</span>
                            </p>
                        </div>
                        {!activeGoal && !showForm && (
                            <Button
                                onClick={() => setShowForm(true)}
                                className="gap-2 w-full sm:w-auto"
                            >
                                <Target className="w-4 h-4" />
                                Nova Meta
                            </Button>
                        )}
                    </div>
                </div>

                {/* Formulário de Nova Meta */}
                {showForm && (
                    <Card className="mb-6 shadow-md">
                        <CardHeader className="bg-[#fefae0]/50 border-b">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-[#5f6f52] flex items-center justify-center">
                                            <Target className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">Criar Nova Meta</CardTitle>
                                            <CardDescription className="text-sm">Defina uma meta nutricional realista e sustentável</CardDescription>
                                        </div>
                                    </div>
                                </div>
                                {!activeGoal && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowForm(false)}
                                        className="hover:bg-red-50 hover:text-red-600"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-6 pt-6">
                            {/* SEÇÃO: Informações Básicas */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b border-[#a9b388]/30">
                                    <Target className="w-4 h-4 text-[#5f6f52]" />
                                    <h3 className="font-semibold text-[#5f6f52]">Informações Básicas</h3>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="goal_type" className="text-sm font-medium">Tipo de Meta</Label>
                                    <Select
                                        value={formData.goal_type}
                                        onValueChange={(value) => handleInputChange('goal_type', value)}
                                    >
                                        <SelectTrigger id="goal_type" className="h-10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="weight_loss">Perda de Peso</SelectItem>
                                            <SelectItem value="weight_gain">Ganho de Peso</SelectItem>
                                            <SelectItem value="weight_maintenance">Manutenção de Peso</SelectItem>
                                            <SelectItem value="body_composition">Composição Corporal</SelectItem>
                                            <SelectItem value="custom">Personalizada</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="initial_weight" className="text-sm font-medium flex items-center gap-1.5">
                                            <Scale className="w-3.5 h-3.5 text-[#5f6f52]" />
                                            Peso Inicial (kg)
                                        </Label>
                                        <Input
                                            id="initial_weight"
                                            type="number"
                                            step="0.1"
                                            value={formData.initial_weight}
                                            onChange={(e) => handleInputChange('initial_weight', e.target.value)}
                                            placeholder="70.0"
                                            className="h-11 font-semibold bg-[#fefae0]/20"
                                        />
                                        <p className="text-xs text-muted-foreground">Peso atual do paciente</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="target_weight" className="text-sm font-medium flex items-center gap-1.5">
                                            <Target className="w-3.5 h-3.5 text-[#c4661f]" />
                                            Peso Meta (kg)
                                        </Label>
                                        <Input
                                            id="target_weight"
                                            type="number"
                                            step="0.1"
                                            value={formData.target_weight}
                                            onChange={(e) => handleInputChange('target_weight', e.target.value)}
                                            placeholder="65.0"
                                            className="h-11 font-semibold bg-[#fefae0]/20"
                                        />
                                        <p className="text-xs text-muted-foreground">Peso que deseja atingir</p>
                                    </div>
                                </div>
                            </div>

                            {/* SEÇÃO: Recomendação de Prazo */}
                            {deadlineRecommendation && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 pb-2 border-b border-[#a9b388]/30">
                                        <Calendar className="w-4 h-4 text-[#5f6f52]" />
                                        <h3 className="font-semibold text-[#5f6f52]">Recomendação de Prazo</h3>
                                    </div>

                                    <div className="bg-[#fefae0]/30 border border-[#a9b388]/40 rounded-lg p-4">
                                        <div className="text-sm text-foreground mb-3">
                                            Para {formData.goal_type === 'weight_loss' ? 'perder' : 'ganhar'} <strong>{deadlineRecommendation.weightChange.toFixed(1)}kg</strong> de forma saudável:
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="bg-white p-3 rounded border border-[#c4661f]/30 hover:border-[#c4661f]/60 transition-colors">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Flame className="w-4 h-4 text-[#c4661f]" />
                                                    <div className="text-xs font-semibold text-[#c4661f] uppercase">Prazo Mínimo</div>
                                                </div>
                                                <div className="text-xl font-bold text-foreground mb-1">
                                                    {deadlineRecommendation.minDays} dias
                                                </div>
                                                <div className="text-xs text-muted-foreground mb-2">
                                                    até {new Date(deadlineRecommendation.minDate).toLocaleDateString('pt-BR')}
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full text-xs h-8"
                                                    onClick={() => handleInputChange('target_date', deadlineRecommendation.minDate)}
                                                >
                                                    Usar este prazo
                                                </Button>
                                                <p className="text-xs text-muted-foreground mt-1.5">Agressivo</p>
                                            </div>
                                            <div className="bg-[#5f6f52]/5 p-3 rounded border border-[#5f6f52]/40 hover:border-[#5f6f52] transition-colors">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <CheckCircle2 className="w-4 h-4 text-[#5f6f52]" />
                                                    <div className="text-xs font-semibold text-[#5f6f52] uppercase">Prazo Ideal</div>
                                                </div>
                                                <div className="text-xl font-bold text-foreground mb-1">
                                                    {deadlineRecommendation.idealDays} dias
                                                </div>
                                                <div className="text-xs text-muted-foreground mb-2">
                                                    até {new Date(deadlineRecommendation.idealDate).toLocaleDateString('pt-BR')}
                                                </div>
                                                <Button
                                                    size="sm"
                                                    className="w-full bg-[#5f6f52] hover:bg-[#5f6f52]/90 text-white text-xs h-8"
                                                    onClick={() => handleInputChange('target_date', deadlineRecommendation.idealDate)}
                                                >
                                                    Usar este prazo (Recomendado)
                                                </Button>
                                                <p className="text-xs text-muted-foreground mt-1.5">Sustentável</p>
                                            </div>
                                        </div>
                                        <div className="bg-[#5f6f52]/10 rounded p-2.5 mt-3">
                                            <p className="text-xs text-foreground/80">
                                                <strong>💡 Dica:</strong> O prazo ideal considera um déficit moderado e seguro para resultados sustentáveis.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* SEÇÃO: Cronograma */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b border-[#a9b388]/30">
                                    <Calendar className="w-4 h-4 text-[#5f6f52]" />
                                    <h3 className="font-semibold text-[#5f6f52]">Cronograma</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="start_date" className="text-sm font-medium">Data de Início</Label>
                                        <DateInputWithCalendar
                                            id="start_date"
                                            value={formData.start_date}
                                            onChange={(value) => handleInputChange('start_date', value)}
                                            className="h-10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="target_date" className="text-sm font-medium">Data Meta</Label>
                                        <DateInputWithCalendar
                                            id="target_date"
                                            value={formData.target_date}
                                            onChange={(value) => handleInputChange('target_date', value)}
                                            min={formData.start_date}
                                            className="h-10"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SEÇÃO: Detalhes Adicionais */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b border-[#a9b388]/30">
                                    <Activity className="w-4 h-4 text-[#5f6f52]" />
                                    <h3 className="font-semibold text-[#5f6f52]">Observações</h3>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="description" className="text-sm font-medium">Observações (Opcional)</Label>
                                    <Textarea
                                        id="description"
                                        value={formData.description}
                                        onChange={(e) => handleInputChange('description', e.target.value)}
                                        placeholder="Ex: Restrições alimentares, preferências de exercícios..."
                                        rows={3}
                                        className="resize-none"
                                    />
                                </div>
                            </div>

                            {/* SEÇÃO: Análise de Viabilidade */}
                            {(loadingViability || viabilityPreview) && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 pb-2 border-b border-[#a9b388]/30">
                                        <Activity className="w-4 h-4 text-[#5f6f52]" />
                                        <h3 className="font-semibold text-[#5f6f52]">Análise de Viabilidade</h3>
                                    </div>

                                    {loadingViability && (
                                        <div className="text-center py-6 bg-[#fefae0]/30 rounded-lg border border-[#a9b388]/40">
                                            <Activity className="w-6 h-6 animate-spin text-[#5f6f52] mx-auto mb-2" />
                                            <p className="text-sm text-muted-foreground">Calculando viabilidade da meta...</p>
                                        </div>
                                    )}

                                    {viabilityPreview && !loadingViability && (
                                        <Alert className={cn(
                                            "shadow-sm",
                                            getViabilityColor(viabilityPreview.viability_score)
                                        )}>
                                            <AlertCircle className="h-4 w-4" />
                                            <AlertDescription>
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="font-semibold">
                                                            {getViabilityLabel(viabilityPreview.viability_score)}
                                                        </div>
                                                        <Badge variant="outline" className="text-xs">
                                                            {viabilityPreview.viability_score}/5
                                                        </Badge>
                                                    </div>

                                                    {viabilityPreview.warnings && viabilityPreview.warnings.length > 0 && (
                                                        <div className="space-y-1 mt-2">
                                                            {viabilityPreview.warnings.map((warning, index) => (
                                                                <div key={index} className="flex items-start gap-1.5 text-sm">
                                                                    <span>•</span>
                                                                    <span>{warning.message}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {viabilityPreview.viability_notes && (
                                                        <div className="text-xs whitespace-pre-line mt-2 pt-2 border-t opacity-80">
                                                            {viabilityPreview.viability_notes}
                                                        </div>
                                                    )}
                                                </div>
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                </div>
                            )}

                            {/* Botões de Ação */}
                            <div className="flex gap-2 justify-end pt-4 border-t">
                                {!activeGoal && (
                                    <Button
                                        variant="outline"
                                        onClick={() => setShowForm(false)}
                                    >
                                        Cancelar
                                    </Button>
                                )}
                                <Button
                                    onClick={handleCreateGoal}
                                    disabled={submitting || !viabilityPreview}
                                    className="bg-[#5f6f52] hover:bg-[#5f6f52]/90 text-white"
                                >
                                    {submitting ? (
                                        <>
                                            <Activity className="w-4 h-4 mr-2 animate-spin" />
                                            Criando...
                                        </>
                                    ) : (
                                        <>
                                            <Target className="w-4 h-4 mr-2" />
                                            Criar Meta
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Meta Ativa */}
                {activeGoal && !showForm && (
                    <ActiveGoalCard
                        goal={activeGoal}
                        onUpdateProgress={() => setShowProgressModal(true)}
                        onComplete={handleCompleteGoal}
                        onPause={handlePauseGoal}
                        onCancel={() => setShowCancelDialog(true)}
                    />
                )}

                {/* Histórico de Metas */}
                {pastGoals && pastGoals.length > 0 && (
                    <Card className="mt-6 shadow-md">
                        <CardHeader className="bg-[#fefae0]/30 border-b">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-[#5f6f52]" />
                                <div>
                                    <CardTitle>Histórico de Metas</CardTitle>
                                    <CardDescription className="text-sm">Metas anteriores do paciente</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="space-y-2">
                                {pastGoals.map(goal => (
                                    <GoalHistoryItem key={goal.id} goal={goal} />
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Modal de Atualização de Progresso */}
                <Dialog open={showProgressModal} onOpenChange={setShowProgressModal}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader className="pb-3 border-b">
                            <div className="flex items-center gap-2">
                                <div className="w-9 h-9 rounded-lg bg-[#5f6f52] flex items-center justify-center">
                                    <Scale className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <DialogTitle>Atualizar Progresso</DialogTitle>
                                    <DialogDescription className="text-sm">
                                        Registre o peso atual do paciente
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            {activeGoal && (
                                <div className="bg-[#fefae0]/40 p-3 rounded-lg border border-[#a9b388]/40">
                                    <div className="flex items-center justify-between text-sm mb-1.5">
                                        <span className="text-muted-foreground">Peso anterior:</span>
                                        <span className="font-bold text-[#5f6f52]">{activeGoal.current_weight?.toFixed(1)} kg</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Meta:</span>
                                        <span className="font-semibold text-[#c4661f]">{activeGoal.target_weight?.toFixed(1)} kg</span>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="new_weight" className="text-sm font-medium flex items-center gap-1.5">
                                    <Scale className="w-3.5 h-3.5 text-[#5f6f52]" />
                                    Novo Peso (kg)
                                </Label>
                                <Input
                                    id="new_weight"
                                    type="number"
                                    step="0.1"
                                    value={newWeight}
                                    onChange={(e) => setNewWeight(e.target.value)}
                                    placeholder="Ex: 68.5"
                                    className="h-12 text-lg font-semibold text-center"
                                    autoFocus
                                />
                                <p className="text-xs text-muted-foreground text-center">
                                    Digite o peso medido hoje
                                </p>
                            </div>
                        </div>

                        <DialogFooter className="gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowProgressModal(false);
                                    setNewWeight('');
                                }}
                                disabled={submitting}
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleUpdateProgress}
                                disabled={submitting || !newWeight}
                                className="bg-[#5f6f52] hover:bg-[#5f6f52]/90 text-white"
                            >
                                {submitting ? (
                                    <>
                                        <Activity className="w-4 h-4 mr-2 animate-spin" />
                                        Salvando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        Salvar
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Modal de Cancelamento */}
                <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Cancelar meta?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Tem certeza que deseja cancelar esta meta? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Não, manter meta</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleCancelGoal}
                                className="bg-red-600 hover:bg-red-700"
                            >
                                Sim, cancelar meta
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
};

// =============================================
// COMPONENTE: ActiveGoalCard
// =============================================

const ActiveGoalCard = ({ goal, onUpdateProgress, onComplete, onPause, onCancel }) => {
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

// =============================================
// COMPONENTE: GoalHistoryItem
// =============================================

const GoalHistoryItem = ({ goal }) => {
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

// Funções auxiliares movidas para fora do componente
const getGoalTypeIcon = (type) => {
    const icons = {
        weight_loss: TrendingDown,
        weight_gain: TrendingUp,
        weight_maintenance: Scale,
        body_composition: Activity,
        custom: Target
    };
    return icons[type] || Target;
};

export default GoalsPage;
