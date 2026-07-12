import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertCircle, Activity, Stethoscope, User, Utensils, Heart, CheckSquare, Copy, ChevronDown, ChevronUp, Check, Link as LinkIcon, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { usePatientHub } from '@/hooks/usePatientHub';
import { useAuth } from '@/contexts/AuthContext';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import PatientProfileSummary from '@/components/patient-hub/PatientProfileSummary';
import PatientJourneyWidget from '@/components/patient-hub/PatientJourneyWidget';
import TabContentFeed from '@/components/patient-hub/tabs/TabContentFeed';
import TabContentClinical from '@/components/patient-hub/tabs/TabContentClinical';
import TabContentBody from '@/components/patient-hub/tabs/TabContentBody';
import TabContentNutrition from '@/components/patient-hub/tabs/TabContentNutrition';
import TabContentAdherence from '@/components/patient-hub/tabs/TabContentAdherence';
import TabContentCheckins from '@/components/patient-hub/tabs/TabContentCheckins';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { isUuid } from '@/lib/utils/patientRoutes';
import PatientEditProfileModal from '@/components/patient-hub/PatientEditProfileModal';

const PatientHubPage = () => {
    const { patientId: resolvedId, loading: resolveLoading, error: resolveError, paramValue } = useResolvedPatientId();
    const patientId = resolvedId;
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState(() => {
        // Ler tab dos query params (quando volta de um módulo)
        const tabFromUrl = searchParams.get('tab');
        if (tabFromUrl) {
            return tabFromUrl;
        }
        // Sempre iniciar no feed se não vier de um módulo
        return 'feed';
    });
    const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
    const [isInviteExpanded, setIsInviteExpanded] = useState(false);
    const [copyState, setCopyState] = useState('idle'); // idle | copied

    // Sincronizar tab quando URL mudar (ex: navegação programática com ?tab=)
    useEffect(() => {
        const tabFromUrl = searchParams.get('tab');
        if (tabFromUrl && ['feed', 'clinical', 'body', 'nutrition', 'adherence', 'checkins'].includes(tabFromUrl)) {
            setActiveTab(tabFromUrl);
        }
    }, [searchParams]);

    // Hook customizado que gerencia todos os dados do hub (só quando patientId resolvido)
    const {
        loading: hubLoading,
        error: hubError,
        patientData,
        latestMetrics,
        modulesStatus,
        activities,
        activitiesLoading,
        writableEpisodeId,
        profileRequirements,
        legalGuardians,
        refresh,
        loadActivities
    } = usePatientHub(patientId);

    const loading = resolveLoading || (patientId ? hubLoading : false);
    const error = resolveError || hubError;

    // Substituir URL por slug quando carregado com UUID (para URLs legíveis)
    useEffect(() => {
        if (!patientData?.slug || !paramValue || !isUuid(paramValue)) return;
        const base = `/nutritionist/patients/${patientData.slug}/hub`;
        const tabParam = searchParams.get('tab');
        const targetPath = tabParam ? `${base}?tab=${tabParam}` : base;
        if (window.location.pathname !== base || (tabParam && window.location.search !== `?tab=${tabParam}`)) {
            navigate(targetPath, { replace: true });
        }
    }, [patientData?.slug, paramValue, navigate, searchParams]);

    const handleEditProfile = () => {
        setIsEditProfileModalOpen(true);
    };

    const handleOpenChat = () => {
        navigate(`/nutritionist/chat/${patientId}`);
    };

    const handleScheduleAppointment = () => {
        // TODO: Implementar agendamento (Fase 2)
        navigate('/nutritionist/agenda');
    };

    const handleLoadMoreActivities = () => {
        loadActivities(activities.length + 20);
    };

    // Manter ?tab= na URL para shareability e back/forward - não limpar

    // OTIMIZADO: Skeleton loader ao invés de spinner
    if (loading) {
        return (
            <div className="min-h-screen bg-background">
                {/* Header Skeleton */}
                <header className="bg-card/80 backdrop-blur-md border-b border-border p-4">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Skeleton className="w-10 h-10 rounded-md" />
                            <div>
                                <Skeleton className="h-5 w-32 mb-2" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        </div>
                        <Skeleton className="w-24 h-9" />
                    </div>
                </header>

                {/* Content Skeleton */}
                <main className="max-w-7xl mx-auto w-full p-4 md:p-8 space-y-8">
                    {/* Profile Summary Skeleton */}
                    <Card>
                        <CardHeader className="flex flex-row items-start justify-between space-y-0">
                            <div className="flex items-center gap-4">
                                <Skeleton className="h-20 w-20 rounded-full" />
                                <div className="space-y-2">
                                    <Skeleton className="h-6 w-48" />
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-4 w-40" />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Skeleton className="h-10 w-24" />
                                <Skeleton className="h-10 w-24" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="space-y-2">
                                        <Skeleton className="h-4 w-16" />
                                        <Skeleton className="h-6 w-20" />
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Journey Widget Skeleton */}
                    <Card>
                        <CardHeader>
                            <Skeleton className="h-5 w-40" />
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[1, 2, 3, 4].map(i => (
                                    <Skeleton key={i} className="h-20 rounded-lg" />
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tabs Skeleton */}
                    <Card>
                        <CardHeader>
                            <Skeleton className="h-10 w-full" />
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {[1, 2, 3].map(i => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </CardContent>
                    </Card>
                </main>
            </div>
        );
    }

    // Estado de erro (inclui slug não encontrado ou paciente sem permissão)
    const slugNotFound = !resolveLoading && !patientId && paramValue;
    const hubNotFound = patientId && !hubLoading && !patientData;
    if (error || slugNotFound || hubNotFound) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background p-4">
                <Alert variant="destructive" className="max-w-md mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        {error?.message || 'Paciente não encontrado ou você não tem permissão para visualizá-lo.'}
                    </AlertDescription>
                </Alert>
                <Button asChild variant="outline" className="gap-2">
                    <Link to="/nutritionist/patients" className="flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4 shrink-0" />
                        Voltar
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background overflow-x-hidden">
            {/* Header Sticky */}
            <header className="bg-card/80 backdrop-blur-md border-b border-border p-3 md:p-4 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto flex items-center justify-between min-w-0 gap-2">
                    <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                        <Link to="/nutritionist/patients" className="shrink-0">
                            <Button variant="ghost" size="sm" className="gap-2">
                                <ArrowLeft className="w-4 h-4 shrink-0" />
                                Voltar
                            </Button>
                        </Link>
                        <div className="min-w-0 overflow-hidden">
                            <h1 className="font-semibold text-foreground text-base md:text-lg truncate">
                                {patientData.name}
                            </h1>
                            <p className="text-xs text-muted-foreground">
                                Hub do Paciente
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={refresh}
                        className="gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        <span className="hidden sm:inline">Atualizar</span>
                    </Button>
                </div>
            </header>

            {/* Conteúdo Principal */}
            <main className="max-w-7xl mx-auto w-full p-4 md:p-8 space-y-8 min-w-0 overflow-x-hidden">
                {/* ALERTA DE PERFIL OFFLINE - Em cima e Minimizável */}
                {patientData.patient_invite_code && (
                    <section className="w-full">
                        <Alert className="bg-gradient-to-r from-sky-50 to-blue-50 border-sky-200 dark:from-sky-900/20 dark:to-blue-900/20 dark:border-sky-800 shadow-sm relative overflow-hidden transition-all duration-300">
                            <div className="absolute right-0 top-0 w-32 h-32 bg-sky-500/10 rounded-full blur-xl -mr-10 -mt-10 pointer-events-none" />
                            
                            {/* Header / Trigger */}
                            <div 
                                className="flex items-center justify-between cursor-pointer select-none relative z-10"
                                onClick={() => setIsInviteExpanded(!isInviteExpanded)}
                            >
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
                                    <h4 className="font-bold text-sky-900 dark:text-sky-300 flex items-center gap-2">
                                        Acesso do Paciente (Convite)
                                        <Badge variant="outline" className="bg-sky-100 text-sky-800 border-sky-300 text-[10px] py-0 hidden sm:inline-flex">AGUARDANDO VÍNCULO</Badge>
                                    </h4>
                                </div>
                                <Button variant="ghost" size="sm" className="h-8 text-sky-700 hover:text-sky-900 hover:bg-sky-200/50 dark:text-sky-400">
                                    {isInviteExpanded ? 'Ocultar' : 'Expandir'}
                                    {isInviteExpanded ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                                </Button>
                            </div>

                            {/* Conteúdo Expandido */}
                            <AnimatePresence>
                                {isInviteExpanded && (
                                    <motion.div 
                                        initial={{ height: 0, opacity: 0, marginTop: 0 }}
                                        animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
                                        exit={{ height: 0, opacity: 0, marginTop: 0 }}
                                        className="relative z-10 overflow-hidden"
                                    >
                                        <div className="text-sky-800/90 dark:text-sky-400/90 text-sm w-full space-y-4">
                                            <p>Este paciente foi cadastrado offline. Para que ele tenha acesso ao Prontuário, Fotos e Check-ins, escolha uma das formas de convite abaixo:</p>
                                            
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                                                {/* Método 1: Link Mágico */}
                                                <div className="bg-white/60 dark:bg-black/20 rounded-md border border-sky-200 dark:border-sky-800/50 p-3 flex flex-col gap-3 min-w-0">
                                                    <div className="flex items-center gap-2 font-semibold text-sky-900 dark:text-sky-300 text-xs sm:text-sm">
                                                        <LinkIcon className="w-4 h-4 shrink-0" />
                                                        <span>1. Link Mágico <span className="text-sky-600 dark:text-sky-400">(Recomendado)</span></span>
                                                    </div>
                                                    <p className="text-xs text-sky-700/80 dark:text-sky-500/80 leading-relaxed flex-1">Copie a mensagem pronta com o link de acesso direto para enviar ao paciente.</p>
                                                    <div className="px-2 py-2 text-[10px] sm:text-xs bg-sky-50 dark:bg-sky-900/40 rounded border border-sky-100 dark:border-sky-800/50 font-mono break-all select-all leading-relaxed">
                                                        {window.location.origin}/convite?token={patientData.patient_invite_code}
                                                    </div>
                                                    <Button 
                                                        size="sm" 
                                                        className={`mt-auto w-full h-9 transition-all text-xs sm:text-sm ${copyState === 'link-copied' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-sky-600 hover:bg-sky-700 text-white'}`}
                                                        onClick={() => {
                                                            const link = `${window.location.origin}/convite?token=${patientData.patient_invite_code}`;
                                                            const msg = `Olá, aqui é ${user?.profile?.name}, seu nutricionista! Seu acompanhamento nutricional detalhado no HipoZero já está pronto! Clique no link, crie sua senha com rapidez e acesse seu plano alimentar: ${link}`;
                                                            navigator.clipboard.writeText(msg);
                                                            setCopyState('link-copied');
                                                            setTimeout(() => setCopyState('idle'), 2000);
                                                        }}
                                                    >
                                                        {copyState === 'link-copied' ? (
                                                            <><Check className="w-4 h-4 mr-1.5" /> Mensagem Copiada!</>
                                                        ) : (
                                                            <><Copy className="w-4 h-4 mr-1.5" /> Copiar Link e Mensagem</>
                                                        )}
                                                    </Button>
                                                </div>

                                                {/* Método 2: Código de Convite */}
                                                <div className="bg-white/60 dark:bg-black/20 rounded-md border border-sky-200 dark:border-sky-800/50 p-3 flex flex-col gap-3 min-w-0">
                                                    <div className="flex items-center gap-2 font-semibold text-sky-900 dark:text-sky-300 text-xs sm:text-sm">
                                                        <Hash className="w-4 h-4 shrink-0" />
                                                        <span>2. Código de Convite</span>
                                                    </div>
                                                    <p className="text-xs text-sky-700/80 dark:text-sky-500/80 leading-relaxed flex-1">Se o paciente já está na plataforma, informe este código para que ele resgate o vínculo manualmente.</p>
                                                    <div className="flex items-center justify-between bg-sky-50 dark:bg-sky-900/40 rounded border border-sky-100 dark:border-sky-800/50 px-3 py-2 gap-2">
                                                        <span className="text-[10px] font-semibold text-sky-900 dark:text-sky-300 uppercase tracking-wide shrink-0">Código:</span>
                                                        <span className="font-mono font-bold tracking-widest text-sky-700 dark:text-sky-400 select-all text-sm truncate">{patientData.patient_invite_code}</span>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className={`mt-auto w-full h-9 transition-all text-xs sm:text-sm border-sky-300 dark:border-sky-700 ${copyState === 'code-copied' ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700' : 'text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30'}`}
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(patientData.patient_invite_code);
                                                            setCopyState('code-copied');
                                                            setTimeout(() => setCopyState('idle'), 2000);
                                                        }}
                                                    >
                                                        {copyState === 'code-copied' ? (
                                                            <><Check className="w-4 h-4 mr-1.5" /> Código Copiado!</>
                                                        ) : (
                                                            <><Copy className="w-4 h-4 mr-1.5" /> Copiar Código</>
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </Alert>
                    </section>
                )}

                {/* BLOCO 1 - Perfil do Paciente */}
                <section>
                    <PatientProfileSummary
                        patientData={patientData}
                        latestMetrics={latestMetrics}
                        onEditProfile={handleEditProfile}
                        onOpenChat={handleOpenChat}
                        onScheduleAppointment={handleScheduleAppointment}
                        profileRequirements={profileRequirements}
                    />
                </section>

                {/* BLOCO 2 - Jornada Clínica (Guia Discreto) */}
                <section>
                    <PatientJourneyWidget
                        patientId={patientId}
                        patientData={patientData}
                        modulesStatus={modulesStatus}
                        latestMetrics={latestMetrics}
                    />
                </section>

                {/* BLOCO 3 - Tabs de Navegação */}
                <section>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 gap-1 h-auto p-1 bg-muted/30 rounded-lg">
                            <TabsTrigger
                                value="feed"
                                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-md transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-[#5f6f52] data-[state=inactive]:text-muted-foreground hover:text-foreground"
                            >
                                <Activity className="h-5 w-5" />
                                <span className="text-xs font-medium">Feed</span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="clinical"
                                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-md transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-[#5f6f52] data-[state=inactive]:text-muted-foreground hover:text-foreground"
                            >
                                <Stethoscope className="h-5 w-5" />
                                <span className="text-xs font-medium">Clínico</span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="body"
                                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-md transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-[#5f6f52] data-[state=inactive]:text-muted-foreground hover:text-foreground"
                            >
                                <User className="h-5 w-5" />
                                <span className="text-xs font-medium">Antropometria</span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="nutrition"
                                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-md transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-[#5f6f52] data-[state=inactive]:text-muted-foreground hover:text-foreground"
                            >
                                <Utensils className="h-5 w-5" />
                                <span className="text-xs font-medium">Nutrição</span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="adherence"
                                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-md transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-[#5f6f52] data-[state=inactive]:text-muted-foreground hover:text-foreground"
                            >
                                <Heart className="h-5 w-5" />
                                <span className="text-xs font-medium">Adesão</span>
                            </TabsTrigger>
                            <TabsTrigger
                                value="checkins"
                                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-md transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-[#5f6f52] data-[state=inactive]:text-muted-foreground hover:text-foreground"
                            >
                                <CheckSquare className="h-5 w-5" />
                                <span className="text-xs font-medium">Check-ins</span>
                            </TabsTrigger>
                        </TabsList>

                        <div className="mt-6">
                            <TabsContent value="feed" className="m-0">
                                <TabContentFeed
                                    patientId={patientId}
                                    patientSlugOrId={patientData?.slug}
                                    activities={activities}
                                    loading={activitiesLoading}
                                    onLoadMore={handleLoadMoreActivities}
                                />
                            </TabsContent>

                            <TabsContent value="clinical" className="m-0">
                                <TabContentClinical
                                    patientId={patientId}
                                    patientData={patientData}
                                    modulesStatus={modulesStatus}
                                />
                            </TabsContent>

                            <TabsContent value="body" className="m-0">
                                <TabContentBody
                                    patientId={patientId}
                                    patientData={patientData}
                                    modulesStatus={modulesStatus}
                                    latestMetrics={latestMetrics}
                                />
                            </TabsContent>

                            <TabsContent value="nutrition" className="m-0">
                                <TabContentNutrition
                                    patientId={patientId}
                                    patientData={patientData}
                                    modulesStatus={modulesStatus}
                                />
                            </TabsContent>

                            <TabsContent value="adherence" className="m-0">
                                <TabContentAdherence
                                    patientId={patientId}
                                    patientData={patientData}
                                    modulesStatus={modulesStatus}
                                />
                            </TabsContent>

                            <TabsContent value="checkins" className="m-0">
                                <TabContentCheckins
                                    patientId={patientId}
                                />
                            </TabsContent>
                        </div>
                    </Tabs>
                </section>
            </main>

            {patientData && (
                <PatientEditProfileModal 
                    isOpen={isEditProfileModalOpen} 
                    onClose={() => setIsEditProfileModalOpen(false)} 
                    patientData={patientData}
                    writableEpisodeId={writableEpisodeId}
                    profileRequirements={profileRequirements}
                    legalGuardians={legalGuardians}
                    onSaveSuccess={refresh}
                />
            )}
        </div>
    );
};

export default PatientHubPage;
