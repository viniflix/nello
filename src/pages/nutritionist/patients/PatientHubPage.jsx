import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    Activity, AlertCircle, ArrowLeft, Check, ClipboardCheck, Copy,
    Hash, Heart, Link as LinkIcon, RefreshCw, Ruler, Stethoscope, Utensils,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SimpleListSkeleton } from '@/components/ui/custom-skeletons';
import { useAuth } from '@/contexts/AuthContext';
import { usePatientHub } from '@/hooks/usePatientHub';
import { useOnlinePresence } from '@/hooks/useOnlinePresence';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { isUuid } from '@/lib/utils/patientRoutes';
import PatientProfileSummary from '@/components/patient-hub/PatientProfileSummary';
import PatientEditProfileModal from '@/components/patient-hub/PatientEditProfileModal';
import DuplicatePatientModal from '@/components/nutritionist/DuplicatePatientModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

const TabContentOverview = lazy(() => import('@/components/patient-hub/tabs/TabContentOverview'));
const TabContentFeed = lazy(() => import('@/components/patient-hub/tabs/TabContentFeed'));
const TabContentClinical = lazy(() => import('@/components/patient-hub/tabs/TabContentClinical'));
const TabContentBody = lazy(() => import('@/components/patient-hub/tabs/TabContentBody'));
const TabContentNutrition = lazy(() => import('@/components/patient-hub/tabs/TabContentNutrition'));
const TabContentAdherence = lazy(() => import('@/components/patient-hub/tabs/TabContentAdherence'));
const TabContentCheckins = lazy(() => import('@/components/patient-hub/tabs/TabContentCheckins'));

const tabs = [
    { id: 'overview', label: 'Visão geral', icon: Activity },
    { id: 'clinical', label: 'Clínico', icon: Stethoscope },
    { id: 'body', label: 'Corpo', icon: Ruler },
    { id: 'nutrition', label: 'Nutrição', icon: Utensils },
    { id: 'adherence', label: 'Adesão', icon: Heart },
    { id: 'checkins', label: 'Check-ins', icon: ClipboardCheck },
];

const validTabs = new Set(tabs.map(({ id }) => id));
const normalizeTab = (value) => value === 'feed' ? 'overview' : validTabs.has(value) ? value : 'overview';

function HubSkeleton() {
    return (
        <div className="min-h-screen bg-[#ecebe8]">
            <main className="mx-auto w-full max-w-[1440px] space-y-4 px-3 py-4 sm:px-6 lg:px-8">
                <div className="flex justify-between"><Skeleton className="h-9 w-24" /><Skeleton className="h-9 w-36" /></div>
                <Card className="border-[#d8d5d0] bg-white shadow-card"><CardContent className="p-4 sm:p-5"><div className="flex gap-4"><Skeleton className="h-24 w-24 rounded-2xl" /><div className="flex-1 space-y-3"><Skeleton className="h-7 w-52" /><Skeleton className="h-4 w-72 max-w-full" /><Skeleton className="h-8 w-48" /></div></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-16 rounded-xl" />)}</div></CardContent></Card>
                <Skeleton className="h-16 w-full rounded-xl" />
                <SimpleListSkeleton count={4} />
            </main>
        </div>
    );
}

function PatientInvite({ patientData, nutritionistName }) {
    const [expanded, setExpanded] = useState(false);
    const [copyState, setCopyState] = useState('idle');
    const { toast } = useToast();
    if (!patientData?.patient_invite_code) return null;

    const invitationUrl = `${window.location.origin}/convite?token=${patientData.patient_invite_code}`;
    const copy = async (type) => {
        const value = type === 'link'
            ? `Olá, aqui é ${nutritionistName || 'seu nutricionista'}! Seu acompanhamento no Nello está pronto. Acesse e crie sua senha: ${invitationUrl}`
            : patientData.patient_invite_code;
        try {
            await navigator.clipboard.writeText(value);
            setCopyState(type);
            window.setTimeout(() => setCopyState('idle'), 2000);
        } catch {
            toast({ title: 'Não foi possível copiar', description: 'Selecione o link ou código exibido e copie manualmente.', variant: 'destructive' });
        }
    };

    return (
        <section className="rounded-xl border border-sky-200 bg-sky-50/80 shadow-[0_8px_24px_-22px_rgba(3,105,161,0.55)]">
            <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5">
                <span className="flex min-w-0 items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0 text-sky-600" /><span className="min-w-0"><span className="block text-xs font-semibold text-sky-900">Acesso do paciente pendente</span><span className="block truncate text-xs text-sky-700/80">Compartilhe o convite para ativar o acesso ao acompanhamento.</span></span></span>
                <Badge variant="outline" className="shrink-0 border-sky-200 bg-white text-sky-700">{expanded ? 'Ocultar' : 'Convidar'}</Badge>
            </button>
            <AnimatePresence>
                {expanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="grid gap-3 border-t border-sky-200 px-4 py-4 sm:grid-cols-2 sm:px-5">
                            <div className="rounded-lg border border-sky-200 bg-white p-3">
                                <p className="flex items-center gap-2 text-xs font-semibold text-sky-900"><LinkIcon className="h-4 w-4" /> Link de acesso</p>
                                <p className="mt-1 break-all text-[11px] leading-4 text-sky-700">{invitationUrl}</p>
                                <Button size="sm" onClick={() => copy('link')} className="mt-3 w-full bg-sky-600 text-white hover:bg-sky-700">{copyState === 'link' ? <><Check className="mr-2 h-4 w-4" />Copiado</> : <><Copy className="mr-2 h-4 w-4" />Copiar mensagem</>}</Button>
                            </div>
                            <div className="rounded-lg border border-sky-200 bg-white p-3">
                                <p className="flex items-center gap-2 text-xs font-semibold text-sky-900"><Hash className="h-4 w-4" /> Código do convite</p>
                                <p className="mt-2 font-mono text-base font-bold tracking-widest text-sky-700">{patientData.patient_invite_code}</p>
                                <Button size="sm" variant="outline" onClick={() => copy('code')} className="mt-3 w-full border-sky-200 text-sky-700">{copyState === 'code' ? <><Check className="mr-2 h-4 w-4" />Copiado</> : <><Copy className="mr-2 h-4 w-4" />Copiar código</>}</Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}

export default function PatientHubPage() {
    const { patientId: resolvedId, loading: resolveLoading, error: resolveError, paramValue } = useResolvedPatientId();
    const patientId = resolvedId;
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState(() => normalizeTab(searchParams.get('tab')));
    const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
    const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const { isUserOnline } = useOnlinePresence();

    const {
        loading: hubLoading, error: hubError, patientData, latestMetrics, modulesStatus,
        activities, activitiesLoading, viewedEpisodeId, writableEpisodeId,
        profileRequirements, legalGuardians, operationalContext, adherence, insights,
        refresh, loadActivities,
    } = usePatientHub(patientId);

    const loading = resolveLoading || (patientId ? hubLoading : false);
    const error = resolveError || hubError;

    useEffect(() => {
        setActiveTab(normalizeTab(searchParams.get('tab')));
    }, [searchParams]);

    useEffect(() => {
        if (!patientData?.slug || !paramValue || !isUuid(paramValue)) return;
        const base = `/nutritionist/patients/${patientData.slug}/hub`;
        const tab = normalizeTab(searchParams.get('tab'));
        navigate(`${base}${tab === 'overview' ? '' : `?tab=${tab}`}`, { replace: true });
    }, [patientData?.slug, paramValue, navigate, searchParams]);

    const changeTab = (tab) => {
        const normalized = normalizeTab(tab);
        setActiveTab(normalized);
        const next = new URLSearchParams(searchParams);
        if (normalized === 'overview') next.delete('tab');
        else next.set('tab', normalized);
        setSearchParams(next, { replace: true });
        window.scrollTo({ top: 0, behavior: 'auto' });
    };

    const openMealPlan = () => navigate(`/nutritionist/patients/${patientData?.slug || patientId}/meal-plan?quick=1`);
    const openSchedule = () => navigate(`/nutritionist/agenda?action=new&patientId=${patientId}`);
    const handleAction = (action = {}) => {
        if (action.type === 'edit-profile') setIsEditProfileModalOpen(true);
        else if (action.type === 'meal-plan') openMealPlan();
        else if (action.type === 'schedule') openSchedule();
        else if (action.type === 'refresh') refresh();
        else if (action.type === 'tab') changeTab(action.tab);
        else if (action.type === 'feed') setIsHistoryOpen(true);
    };

    if (loading) return <HubSkeleton />;

    const notFound = (!resolveLoading && !patientId && paramValue) || (patientId && !hubLoading && !patientData);
    if (error || notFound) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[#ecebe8] p-4">
                <Alert variant="destructive" className="mb-6 max-w-md"><AlertCircle className="h-4 w-4" /><AlertDescription>{error?.message || 'Paciente não encontrado ou você não tem permissão para visualizá-lo.'}</AlertDescription></Alert>
                <Button asChild variant="outline"><Link to="/nutritionist/patients"><ArrowLeft className="mr-2 h-4 w-4" />Voltar aos pacientes</Link></Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen overflow-x-hidden bg-[#ecebe8] pb-8 text-slate-900">
            <main className="mx-auto w-full max-w-[1440px] px-3 py-4 sm:px-6 lg:px-8">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2 text-slate-500"><Link to="/nutritionist/patients"><ArrowLeft className="h-4 w-4" />Pacientes</Link></Button>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setIsDuplicateModalOpen(true)} className="gap-1.5 text-xs text-slate-500 hover:bg-white hover:text-slate-800"><Copy className="h-3.5 w-3.5" />Duplicar paciente</Button>
                        <Button variant="ghost" size="icon" onClick={refresh} aria-label="Atualizar dados" title="Atualizar dados" className="h-8 w-8 text-slate-500 hover:bg-white"><RefreshCw className="h-3.5 w-3.5" /></Button>
                    </div>
                </div>

                <div className="space-y-4">
                    <PatientInvite patientData={patientData} nutritionistName={user?.profile?.name} />
                    <PatientProfileSummary
                        patientData={patientData}
                        latestMetrics={latestMetrics}
                        operationalContext={operationalContext}
                        isOnline={isUserOnline(patientId)}
                        onEditProfile={() => setIsEditProfileModalOpen(true)}
                        onOpenChat={() => navigate(`/nutritionist/chat/${patientId}`)}
                        onScheduleAppointment={openSchedule}
                        onOpenMealPlan={openMealPlan}
                        profileRequirements={profileRequirements}
                    />
                </div>

                <nav aria-label="Áreas do prontuário" className="sticky top-0 z-20 my-4 rounded-xl border border-[#d8d5d0] bg-white p-1.5 shadow-card">
                    <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
                        {tabs.map(({ id, label, icon: Icon }) => (
                            <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined} onClick={() => changeTab(id)} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[11px] font-semibold transition-colors sm:flex-row sm:gap-2 sm:px-2 sm:text-sm ${activeTab === id ? 'bg-[#5f6f52] text-white' : 'text-slate-500 hover:bg-[#eef2eb] hover:text-[#526047]'}`}>
                                <Icon className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span>
                            </button>
                        ))}
                    </div>
                </nav>

                <div className="patient-hub-tab min-w-0">
                <Suspense fallback={<div className="rounded-xl border border-[#d8d5d0] bg-white p-4 shadow-card"><SimpleListSkeleton count={4} /></div>}>
                    {activeTab === 'overview' && <TabContentOverview operationalContext={operationalContext} adherence={adherence} insights={insights} activities={activities} loading={activitiesLoading} onAction={handleAction} />}
                    {activeTab === 'clinical' && <TabContentClinical patientId={patientId} patientData={patientData} modulesStatus={modulesStatus} viewedEpisodeId={viewedEpisodeId} writableEpisodeId={writableEpisodeId} currentUserId={user?.id} canCosign={user?.profile?.user_type === 'nutritionist'} />}
                    {activeTab === 'body' && <TabContentBody patientId={patientId} patientData={patientData} modulesStatus={modulesStatus} latestMetrics={latestMetrics} />}
                    {activeTab === 'nutrition' && <TabContentNutrition patientId={patientId} patientData={patientData} modulesStatus={modulesStatus} operationalContext={operationalContext} onRefresh={refresh} onOpenChat={() => navigate(`/nutritionist/chat/${patientId}?draft=meal-plan`)} />}
                    {activeTab === 'adherence' && <TabContentAdherence patientId={patientId} patientData={patientData} modulesStatus={modulesStatus} />}
                    {activeTab === 'checkins' && <TabContentCheckins patientId={patientId} />}
                </Suspense>
                </div>
            </main>

            <PatientEditProfileModal isOpen={isEditProfileModalOpen} onClose={() => setIsEditProfileModalOpen(false)} patientData={patientData} viewedEpisodeId={viewedEpisodeId} writableEpisodeId={writableEpisodeId} profileRequirements={profileRequirements} legalGuardians={legalGuardians} onSaveSuccess={refresh} />
            <DuplicatePatientModal isOpen={isDuplicateModalOpen} onClose={() => setIsDuplicateModalOpen(false)} patient={patientData} />
            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
                    <DialogHeader><DialogTitle>Histórico do paciente</DialogTitle><DialogDescription>Atividades, envios e registros do diário alimentar.</DialogDescription></DialogHeader>
                    {isHistoryOpen && <Suspense fallback={<SimpleListSkeleton count={4} />}><TabContentFeed patientId={patientId} patientSlugOrId={patientData?.slug} activities={activities} loading={activitiesLoading} onLoadMore={loadActivities} /></Suspense>}
                </DialogContent>
            </Dialog>
        </div>
    );
}
