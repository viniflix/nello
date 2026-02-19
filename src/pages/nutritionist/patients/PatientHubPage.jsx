import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw, AlertCircle, Activity, Stethoscope, User, Utensils, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePatientHub } from '@/hooks/usePatientHub';
import PatientProfileSummary from '@/components/patient-hub/PatientProfileSummary';
import PatientJourneyWidget from '@/components/patient-hub/PatientJourneyWidget';
import TabContentFeed from '@/components/patient-hub/tabs/TabContentFeed';
import TabContentClinical from '@/components/patient-hub/tabs/TabContentClinical';
import TabContentBody from '@/components/patient-hub/tabs/TabContentBody';
import TabContentNutrition from '@/components/patient-hub/tabs/TabContentNutrition';
import TabContentAdherence from '@/components/patient-hub/tabs/TabContentAdherence';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const PatientHubPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(() => {
        // Ler tab dos query params (quando volta de um módulo)
        const tabFromUrl = searchParams.get('tab');
        if (tabFromUrl) {
            return tabFromUrl;
        }
        // Sempre iniciar no feed se não vier de um módulo
        return 'feed';
    });

    // Hook customizado que gerencia todos os dados do hub
    const {
        loading,
        error,
        patientData,
        latestMetrics,
        modulesStatus,
        activities,
        activitiesLoading,
        refresh,
        loadActivities
    } = usePatientHub(patientId);

    const handleEditProfile = () => {
        // TODO: Implementar edição de perfil (Fase 2)
    };

    const handleOpenChat = () => {
        navigate(`/chat/nutritionist/${patientId}`);
    };

    const handleScheduleAppointment = () => {
        // TODO: Implementar agendamento (Fase 2)
        navigate('/nutritionist/agenda');
    };

    const handleLoadMoreActivities = () => {
        loadActivities(activities.length + 20);
    };

    // Limpar query param da URL após ler
    useEffect(() => {
        if (searchParams.get('tab')) {
            searchParams.delete('tab');
            setSearchParams(searchParams, { replace: true });
        }
    }, [searchParams, setSearchParams]);

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

    // Estado de erro
    if (error || !patientData) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background p-4">
                <Alert variant="destructive" className="max-w-md mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        {error?.message || 'Paciente não encontrado ou você não tem permissão para visualizá-lo.'}
                    </AlertDescription>
                </Alert>
                <Button asChild variant="outline">
                    <Link to="/nutritionist/patients">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Voltar para Pacientes
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
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="w-5 h-5" />
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
                {/* BLOCO 1 - Perfil do Paciente */}
                <section>
                    <PatientProfileSummary
                        patientData={patientData}
                        latestMetrics={latestMetrics}
                        onEditProfile={handleEditProfile}
                        onOpenChat={handleOpenChat}
                        onScheduleAppointment={handleScheduleAppointment}
                    />
                </section>

                {/* BLOCO 2 - Jornada Clínica (Guia Discreto) */}
                <section>
                    <PatientJourneyWidget
                        patientId={patientId}
                        modulesStatus={modulesStatus}
                        latestMetrics={latestMetrics}
                    />
                </section>

                {/* BLOCO 3 - Tabs de Navegação */}
                <section>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-5 gap-1 h-auto p-1 bg-muted/30 rounded-lg">
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
                                <span className="text-xs font-medium">Corporal</span>
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
                        </TabsList>

                        <div className="mt-6">
                            <TabsContent value="feed" className="m-0">
                                <TabContentFeed
                                    patientId={patientId}
                                    activities={activities}
                                    loading={activitiesLoading}
                                    onLoadMore={handleLoadMoreActivities}
                                />
                            </TabsContent>

                            <TabsContent value="clinical" className="m-0">
                                <TabContentClinical
                                    patientId={patientId}
                                    modulesStatus={modulesStatus}
                                />
                            </TabsContent>

                            <TabsContent value="body" className="m-0">
                                <TabContentBody
                                    patientId={patientId}
                                    modulesStatus={modulesStatus}
                                    latestMetrics={latestMetrics}
                                />
                            </TabsContent>

                            <TabsContent value="nutrition" className="m-0">
                                <TabContentNutrition
                                    patientId={patientId}
                                    modulesStatus={modulesStatus}
                                />
                            </TabsContent>

                            <TabsContent value="adherence" className="m-0">
                                <TabContentAdherence
                                    patientId={patientId}
                                    modulesStatus={modulesStatus}
                                />
                            </TabsContent>
                        </div>
                    </Tabs>
                </section>
            </main>
        </div>
    );
};

export default PatientHubPage;