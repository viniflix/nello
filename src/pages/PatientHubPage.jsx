import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePatientHub } from '@/hooks/usePatientHub';
import PatientProfileSummary from '@/components/patient-hub/PatientProfileSummary';
import PatientModulesGrid from '@/components/patient-hub/PatientModulesGrid';
import PatientActivityFeed from '@/components/patient-hub/PatientActivityFeed';
import { Alert, AlertDescription } from '@/components/ui/alert';

const PatientHubPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();

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

                {/* BLOCO 2 - Grid de Módulos */}
                <section>
                    <PatientModulesGrid
                        patientId={patientId}
                        modulesStatus={modulesStatus}
                    />
                </section>

                {/* BLOCO 3 - Feed de Atividades */}
                <section>
                    <PatientActivityFeed
                        patientId={patientId}
                        activities={activities}
                        loading={activitiesLoading}
                        onLoadMore={handleLoadMoreActivities}
                    />
                </section>
            </main>
        </div>
    );
};

export default PatientHubPage;