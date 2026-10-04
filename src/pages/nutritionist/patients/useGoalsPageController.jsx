import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { Target, TrendingDown, TrendingUp, Scale, Activity } from 'lucide-react';












import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/infrastructure/supabase/client';
import { createGoal, getPatientGoals, getActiveGoal, updateGoalProgress, completeGoal, cancelGoal, pauseGoal, calculateGoalViability, calculateMinimumDeadline, calculateIdealDeadline } from '@/lib/supabase/goals-queries';
import { logClinicalImpact } from '@/lib/supabase/clinical-impact-queries';

import { toPortugueseError } from '@/lib/utils/errorMessages';
import { formatDateToIsoDate, getTodayIsoDate } from '@/lib/utils/date';
import { failurePresentation } from '@/lib/utils/failure';
import { captureOperationalError } from '@/infrastructure/observability/telemetry';


export function useGoalsPageController() {

    const { patientId, paramValue } = useResolvedPatientId();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
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
        start_date: getTodayIsoDate(),
        target_date: ''
    });
    const [viabilityPreview, setViabilityPreview] = useState(null);
    const [loadingViability, setLoadingViability] = useState(false);
    const [deadlineRecommendation, setDeadlineRecommendation] = useState(null);
    const [showImpactConfirm, setShowImpactConfirm] = useState(false);

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
        if (!patientId) {
            setLoading(false);
            return;
        }
        loadData();
    }, [patientId]);

    const loadData = async () => {
        if (!patientId) return;
        setLoading(true);
        setLoadError(null);
        try {
            // Buscar nome do paciente
            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('name')
                .eq('id', patientId)
                .single();
            if (profileError) throw profileError;

            if (profile) {
                setPatientName(profile.name);
            }

            // Buscar meta ativa
            const { data: active, error: activeError } = await getActiveGoal(patientId);
            if (activeError) throw activeError;
            setActiveGoal(active);

            // Buscar metas anteriores
            const { data: past, error: pastError } = await getPatientGoals(patientId, {
                status: ['completed', 'cancelled', 'paused']
            });
            if (pastError) throw pastError;
            setPastGoals(past || []);

            // Se não tem meta ativa, abrir formulário e puxar peso
            if (!active) {
                // Puxar peso mais recente do paciente (tabela correta: growth_records)
                const { data: latestRecord, error: recordError } = await supabase
                    .from('growth_records')
                    .select('weight')
                    .eq('patient_id', patientId)
                    .order('record_date', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (recordError) throw recordError;

                if (latestRecord && latestRecord.weight) {
                    setFormData(prev => ({
                        ...prev,
                        initial_weight: latestRecord.weight.toString()
                    }));
                }

                setShowForm(true);
            }
        } catch (error) {
            setShowForm(false);
            setLoadError({...failurePresentation(error),correlationId:captureOperationalError(error,{operation:'load_goals',module:'goals',source:'query'})});
        } finally {
            setLoading(false);
        }
    };

    // Calcular viabilidade em tempo real
    useEffect(() => {
        let cancelled=false;
        setViabilityPreview(null);
        setLoadingViability(false);
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
                if(!cancelled)setViabilityPreview(viability);
            } catch (error) {
                logDiagnostic('error', 'pages/nutritionist/patients/GoalsPage.jsx:183', 'Erro ao calcular viabilidade:', error);
            } finally {
                if(!cancelled)setLoadingViability(false);
            }
        };

        // Debounce: esperar 500ms após última alteração
        const timeoutId = setTimeout(calculateViability, 500);
        return () => {cancelled=true;clearTimeout(timeoutId);};
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
                    minDate: formatDateToIsoDate(minDate),
                    idealDate: formatDateToIsoDate(idealDate),
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

    const handleCreateGoal = () => {
        if (!nutritionistId) {
            toast({ title: 'Erro', description: 'Usuário não autenticado.', variant: 'destructive' });
            return;
        }
        if (!formData.title || !formData.initial_weight || !formData.target_weight || !formData.target_date) {
            toast({ title: 'Campos obrigatórios', description: 'Preencha todos os campos obrigatórios.', variant: 'destructive' });
            return;
        }
        if (!viabilityPreview) return;
        setShowImpactConfirm(true);
    };

    const handleConfirmCreateWithImpact = async () => {
        if (!nutritionistId) return;

        setSubmitting(true);
        try {
            const goalPayload = {
                ...formData,
                initial_weight: parseFloat(formData.initial_weight),
                target_weight: parseFloat(formData.target_weight)
            };

            await logClinicalImpact({
                nutritionistId,
                patientId,
                module: 'goals',
                scenario: formData.goal_type === 'weight_loss' ? 'weight_loss' : formData.goal_type === 'weight_gain' ? 'weight_gain' : 'maintenance',
                initialValue: { initial_weight: goalPayload.initial_weight, target_weight: goalPayload.target_weight, start_date: goalPayload.start_date, target_date: goalPayload.target_date },
                simulatedValue: { required_daily_deficit: viabilityPreview?.required_daily_deficit, daily_calorie_goal: viabilityPreview?.daily_calorie_goal, viability_score: viabilityPreview?.viability_score },
                impactNotes: viabilityPreview?.viability_notes?.slice(0, 500) || null,
                confidenceLow: viabilityPreview?.viability_score ? Math.max(1, viabilityPreview.viability_score - 1) : null,
                confidenceHigh: viabilityPreview?.viability_score ? Math.min(5, viabilityPreview.viability_score + 1) : null,
                wasApplied: true
            });

            const { data, error } = await createGoal(goalPayload, patientId, nutritionistId);
            if (error) throw error;

            toast({ title: 'Meta criada!', description: 'Meta criada com sucesso.', variant: 'success' });
            setShowImpactConfirm(false);
            setShowForm(false);
            setFormData({ goal_type: 'weight_loss', title: '', description: '', initial_weight: '', target_weight: '', start_date: getTodayIsoDate(), target_date: '' });
            setViabilityPreview(null);
            await loadData();
        } catch (error) {
            logDiagnostic('error', 'pages/nutritionist/patients/GoalsPage.jsx:299', 'Erro ao criar meta:', error);
            toast({ title: 'Erro', description: toPortugueseError(error, 'Não foi possível criar a meta.'), variant: 'destructive' });
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
            logDiagnostic('error', 'pages/nutritionist/patients/GoalsPage.jsx:325', 'Erro ao atualizar progresso:', error);
            toast({
                title: 'Erro',
                description: toPortugueseError(error, 'Não foi possível atualizar o progresso.'),
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
            logDiagnostic('error', 'pages/nutritionist/patients/GoalsPage.jsx:353', 'Erro ao completar meta:', error);
            toast({
                title: 'Erro',
                description: toPortugueseError(error, 'Não foi possível completar a meta.'),
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
            logDiagnostic('error', 'pages/nutritionist/patients/GoalsPage.jsx:377', 'Erro ao pausar meta:', error);
            toast({
                title: 'Erro',
                description: toPortugueseError(error, 'Não foi possível pausar a meta.'),
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
            logDiagnostic('error', 'pages/nutritionist/patients/GoalsPage.jsx:402', 'Erro ao cancelar meta:', error);
            toast({
                title: 'Erro',
                description: toPortugueseError(error, 'Não foi possível cancelar a meta.'),
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

    
return {loading,loadError,loadData,navigate,patientId,paramValue,patientName,activeGoal,showForm,setShowForm,formData,handleInputChange,deadlineRecommendation,loadingViability,viabilityPreview,getViabilityColor,getViabilityLabel,handleCreateGoal,submitting,showImpactConfirm,setShowImpactConfirm,handleConfirmCreateWithImpact,setShowProgressModal,handleCompleteGoal,handlePauseGoal,setShowCancelDialog,pastGoals,showProgressModal,newWeight,setNewWeight,handleUpdateProgress,showCancelDialog,handleCancelGoal};
}
