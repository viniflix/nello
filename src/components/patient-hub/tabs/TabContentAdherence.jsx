import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ExternalLink, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { HubMetric, HubPanel } from '@/components/patient-hub/HubPanel';
import { getActiveGoal, getDaysRemaining, getProgressStatus } from '@/lib/supabase/goals-queries';
import { patientRoute } from '@/lib/utils/patientRoutes';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { dispatchMessageTemplate, getMessageTemplates, previewTemplate, TEMPLATE_CONTEXTS } from '@/lib/supabase/message-templates-queries';

const formatDate = value => value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleDateString('pt-BR')
    : 'Data não informada';

export default function TabContentAdherence({ patientId, patientData }) {
    const patient = patientData || { id: patientId };
    const navigate = useNavigate();
    const { user } = useAuth();
    const { toast } = useToast();
    const [goal, setGoal] = useState(null);
    const [goalState, setGoalState] = useState('loading');
    const [achievements, setAchievements] = useState([]);
    const [achievementsState, setAchievementsState] = useState('loading');
    const [templates, setTemplates] = useState([]);
    const [templatesState, setTemplatesState] = useState('loading');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [preview, setPreview] = useState(null);
    const [dispatching, setDispatching] = useState(false);

    const loadGoal = useCallback(async () => {
        if (!patientId) {
            setGoal(null);
            setGoalState('ready');
            return;
        }
        setGoalState('loading');
        try {
            const { data, error } = await getActiveGoal(patientId);
            if (error) throw error;
            setGoal(data || null);
            setGoalState('ready');
        } catch {
            setGoal(null);
            setGoalState('error');
        }
    }, [patientId]);

    const loadAchievements = useCallback(async () => {
        if (!patientId) {
            setAchievements([]);
            setAchievementsState('ready');
            return;
        }
        setAchievementsState('loading');
        const { data, error } = await supabase
            .from('user_achievements')
            .select('achieved_at, achievements(name, description, icon_name)')
            .eq('user_id', patientId)
            .order('achieved_at', { ascending: false })
            .limit(5);
        setAchievements(error ? [] : (data || []));
        setAchievementsState(error ? 'error' : 'ready');
    }, [patientId]);

    const loadTemplates = useCallback(async () => {
        if (!user?.id) {
            setTemplates([]);
            setTemplatesState('ready');
            return;
        }
        setTemplatesState('loading');
        const { data, error } = await getMessageTemplates({ nutritionistId: user.id, isActive: true, limit: 50 });
        setTemplates(error ? [] : (data || []));
        setTemplatesState(error ? 'error' : 'ready');
    }, [user?.id]);

    useEffect(() => { void loadGoal(); }, [loadGoal]);
    useEffect(() => { void loadAchievements(); }, [loadAchievements]);
    useEffect(() => { void loadTemplates(); }, [loadTemplates]);

    const selectTemplate = id => {
        setSelectedTemplateId(id);
        const template = templates.find(item => String(item.id) === id);
        setPreview(template ? previewTemplate({ titleTemplate: template.title_template || '', bodyTemplate: template.body_template }) : null);
    };

    const sendMessage = async () => {
        if (!selectedTemplateId || !patientId || !user?.id) return;
        setDispatching(true);
        try {
            const { data, error } = await dispatchMessageTemplate({
                templateId: Number(selectedTemplateId),
                patientId,
                triggerEvent: 'manual_adherence_tab'
            });
            if (error || data?.ok === false) throw error || new Error(data?.reason || 'Não foi possível enviar a mensagem.');
            setSelectedTemplateId('');
            setPreview(null);
            toast({ title: 'Mensagem enviada', description: 'O paciente receberá a mensagem no aplicativo.' });
        } catch (error) {
            toast({ title: 'Erro ao enviar mensagem', description: error?.message || 'Tente novamente.', variant: 'destructive' });
        } finally {
            setDispatching(false);
        }
    };

    const progress = Math.max(0, Math.min(100, Number(goal?.progress_percentage) || 0));
    const daysRemaining = goal ? getDaysRemaining(goal.target_date) : null;
    const progressStatus = goal ? getProgressStatus(goal) : null;
    const weightRemaining = goal?.current_weight != null && goal?.target_weight != null
        ? Math.abs(Number(goal.current_weight) - Number(goal.target_weight))
        : null;

    return <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <HubPanel
            title="Meta ativa"
            description="Objetivo e progresso registrados para o paciente"
            action={<Button size="sm" onClick={() => navigate(patientRoute(patient, 'goals'))}>{goal ? 'Abrir meta' : 'Criar meta'}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>}
        >
            {goalState === 'loading' ? <div role="status" aria-label="Carregando meta" className="space-y-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-2 w-full" /><div className="grid grid-cols-2 gap-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div></div>
                : goalState === 'error' ? <div className="space-y-3"><p className="text-sm text-slate-600">Não foi possível carregar a meta.</p><Button size="sm" variant="outline" onClick={() => void loadGoal()}>Recarregar</Button></div>
                    : !goal ? <p className="text-sm leading-relaxed text-muted-foreground">Nenhuma meta ativa foi definida.</p>
                        : <div className="space-y-4">
                            <div><p className="text-[13px] font-semibold text-slate-900">{goal.title || 'Meta nutricional'}</p><div className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>Progresso</span><span className="font-semibold text-slate-700">{Math.round(progress)}%</span></div><Progress value={progress} className="mt-1.5 h-1.5" /></div>
                            <div className="grid grid-cols-2 gap-2">
                                <HubMetric label="Peso atual" value={goal.current_weight == null ? '—' : `${Number(goal.current_weight).toFixed(1)} kg`} detail={progressStatus?.label || 'Sem classificação'} />
                                <HubMetric label="Meta" value={goal.target_weight == null ? '—' : `${Number(goal.target_weight).toFixed(1)} kg`} detail={weightRemaining == null ? 'Sem distância calculada' : `Faltam ${weightRemaining.toFixed(1)} kg`} />
                            </div>
                            <div className="grid gap-1 text-xs leading-relaxed text-slate-500 sm:grid-cols-2"><p>Prazo: <span className="font-medium text-slate-700">{daysRemaining == null ? 'Não informado' : daysRemaining > 0 ? `${daysRemaining} dias` : 'Prazo expirado'}</span></p><p>Início: <span className="font-medium text-slate-700">{formatDate(goal.start_date)}</span></p>{goal.daily_calorie_goal != null && <p>Meta diária: <span className="font-medium text-slate-700">{Math.round(goal.daily_calorie_goal)} kcal</span></p>}</div>
                        </div>}
        </HubPanel>

        <HubPanel
            title="Conquistas"
            description="Marcos obtidos a partir dos registros e metas"
            action={<Button size="sm" variant="outline" onClick={() => navigate(patientRoute(patient, 'achievements'))}>Ver histórico<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>}
        >
            {achievementsState === 'loading' ? <div role="status" aria-label="Carregando conquistas" className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
                : achievementsState === 'error' ? <div className="space-y-3"><p className="text-sm text-slate-600">Não foi possível carregar as conquistas.</p><Button size="sm" variant="outline" onClick={() => void loadAchievements()}>Recarregar</Button></div>
                    : achievements.length === 0 ? <p className="text-sm leading-relaxed text-muted-foreground">O paciente ainda não desbloqueou conquistas.</p>
                        : <ul className="divide-y divide-slate-100">{achievements.slice(0, 3).map((item, index) => <li key={`${item.achieved_at}-${index}`} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="break-words text-[13px] font-semibold text-slate-900">{item.achievements?.name || 'Conquista'}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{item.achievements?.description || 'Marco de acompanhamento alcançado.'}</p></div><span className="shrink-0 text-[11px] text-slate-500">{formatDate(item.achieved_at)}</span></li>)}</ul>}
        </HubPanel>

        <div className="min-w-0 lg:col-span-2">
            <HubPanel
                title="Mensagem ao paciente"
                description="Use um modelo de mensagem ativo"
                action={<Button size="sm" variant="ghost" onClick={() => navigate('/nutritionist/message-templates')}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Gerenciar modelos</Button>}
            >
                {templatesState === 'loading' ? <div role="status" aria-label="Carregando modelos" className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-9 w-40" /></div>
                    : templatesState === 'error' ? <div className="space-y-3"><p className="text-sm text-slate-600">Não foi possível carregar os modelos.</p><Button size="sm" variant="outline" onClick={() => void loadTemplates()}>Recarregar</Button></div>
                        : templates.length === 0 ? <div className="space-y-3"><p className="text-sm leading-relaxed text-muted-foreground">Nenhum modelo de mensagem está ativo.</p><Button size="sm" variant="outline" onClick={() => navigate('/nutritionist/message-templates')}>Criar modelo</Button></div>
                            : <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                                <div className="min-w-0 space-y-2"><label className="text-[13px] font-semibold text-slate-700">Modelo</label><Select name="adherence-template" value={selectedTemplateId} onValueChange={selectTemplate}><SelectTrigger><SelectValue placeholder="Selecione uma mensagem" /></SelectTrigger><SelectContent>{TEMPLATE_CONTEXTS.map(context => {
                                    const group = templates.filter(template => template.context === context.value);
                                    if (!group.length) return null;
                                    return <React.Fragment key={context.value}><div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{context.label}</div>{group.map(template => <SelectItem key={template.id} value={String(template.id)}>{template.name}</SelectItem>)}</React.Fragment>;
                                })}</SelectContent></Select>{preview && <div className="rounded-lg border border-[#d8d5d0] bg-[#efeeec] p-3 shadow-inner"><p className="text-xs font-semibold text-slate-700">{preview.title || 'Pré-visualização'}</p><p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-500">{preview.body}</p></div>}</div>
                                <Button disabled={!selectedTemplateId || dispatching} onClick={() => void sendMessage()}><Send className="mr-1.5 h-4 w-4" />{dispatching ? 'Enviando…' : 'Enviar mensagem'}</Button>
                            </div>}
            </HubPanel>
        </div>
    </div>;
}
