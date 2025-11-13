import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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

const PatientHubPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('feed');

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

    // Handlers para ações do perfil
    const handleEditProfile = () => {
        // TODO: Implementar edição de perfil (Fase 2)
        console.log('Editar perfil do paciente:', patientId);
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

    // Estado de carregamento
    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-background-page">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-muted-foreground">Carregando dados do paciente...</p>
                </div>
            </div>
        );
    }

    // Estado de erro
    if (error || !patientData) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background-page p-4">
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
        <div className="min-h-screen bg-background-page">
            {/* Header Sticky */}
            <header className="bg-card/80 backdrop-blur-md border-b border-border p-4 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link to="/nutritionist/patients">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="font-semibold text-foreground text-lg">
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
            <main className="max-w-7xl mx-auto w-full p-4 md:p-8 space-y-8">
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
                        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-5 gap-2 h-auto p-1 bg-muted/50">
                            <TabsTrigger value="feed" className="flex items-center gap-2 data-[state=active]:bg-background">
                                <Activity className="h-4 w-4" />
                                <span className="hidden sm:inline">Feed</span>
                            </TabsTrigger>
                            <TabsTrigger value="clinical" className="flex items-center gap-2 data-[state=active]:bg-background">
                                <Stethoscope className="h-4 w-4" />
                                <span className="hidden sm:inline">Clínico</span>
                            </TabsTrigger>
                            <TabsTrigger value="body" className="flex items-center gap-2 data-[state=active]:bg-background">
                                <User className="h-4 w-4" />
                                <span className="hidden sm:inline">Corporal</span>
                            </TabsTrigger>
                            <TabsTrigger value="nutrition" className="flex items-center gap-2 data-[state=active]:bg-background">
                                <Utensils className="h-4 w-4" />
                                <span className="hidden sm:inline">Nutrição</span>
                            </TabsTrigger>
                            <TabsTrigger value="adherence" className="flex items-center gap-2 data-[state=active]:bg-background">
                                <Heart className="h-4 w-4" />
                                <span className="hidden sm:inline">Adesão</span>
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