import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { ArrowLeft, User, Loader2, FileText, BarChart3, Utensils, Droplet, HeartPulse, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { format, differenceInYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Componente do Módulo
const ModuleCard = ({ title, description, icon: Icon, to }) => {
    const navigate = useNavigate();
    return (
        <Card 
            className="bg-background-page hover:shadow-lg hover:border-primary transition-all cursor-pointer"
            onClick={() => navigate(to)}
        >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-primary">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <p className="text-xs text-muted-foreground">{description}</p>
            </CardContent>
        </Card>
    );
};


const PatientHubPage = () => {
    const { patientId } = useParams();
    const { user } = useAuth();
    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchPatientProfile = useCallback(async () => {
        if (!patientId || !user?.id) return;
        setLoading(true);

        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', patientId)
            .eq('nutritionist_id', user.id) // Garante que o nutri só veja o paciente dele
            .single();
        
        if (error || !data) {
            console.error("Erro ao buscar paciente ou paciente não encontrado:", error);
            setPatient(null);
        } else {
            setPatient(data);
        }
        setLoading(false);
    }, [patientId, user?.id]);

    useEffect(() => {
        fetchPatientProfile();
    }, [fetchPatientProfile]);

    const getPatientAge = (birthDate) => {
        if (!birthDate) return '';
        try {
            // Adiciona 4 horas para corrigir o fuso horário (problema comum de 'new Date()')
            const date = new Date(birthDate);
            date.setHours(date.getHours() + 4); 
            return differenceInYears(new Date(), date) + ' anos';
        } catch {
            return '';
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
    }

    if (!patient) {
        return (
            <div className="flex flex-col items-center justify-center h-screen">
                <p className="text-lg text-destructive mb-4">Paciente não encontrado.</p>
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
            {/* Header do Paciente */}
            <header className="bg-card/80 backdrop-blur-md border-b border-border p-4 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link to="/nutritionist/patients">
                            <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
                        </Link>
                        <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center font-bold text-primary overflow-hidden">
                            {patient.avatar_url ? (
                                <img src={patient.avatar_url} alt={patient.name} className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-6 h-6 text-primary/70" />
                            )}
                        </div>
                        <div>
                            <h2 className="font-semibold text-foreground">{patient.name}</h2>
                            <p className="text-xs text-muted-foreground">
                                {patient.email} {getPatientAge(patient.birth_date) && `• ${getPatientAge(patient.birth_date)}`}
                            </p>
                        </div>
                    </div>
                    {/* (Espaço para botões de ação futuros, ex: "Agendar") */}
                </div>
            </header>

            {/* Grid de Módulos */}
            <main className="max-w-4xl mx-auto w-full p-4 md:p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <ModuleCard 
                        title="Anamnese"
                        description="Histórico clínico e hábitos de vida."
                        icon={FileText}
                        to={`/nutritionist/patients/${patientId}/anamnese`} // (Link para o Dia 5)
                    />
                    <ModuleCard 
                        title="Avaliação Antropométrica"
                        description="Medidas de peso, altura e dobras."
                        icon={BarChart3}
                        to="#" // (Link futuro)
                    />
                    <ModuleCard 
                        title="Plano Alimentar"
                        description="Prescrição da dieta e refeições."
                        icon={Utensils}
                        to="#" // (Link futuro)
                    />
                    <ModuleCard 
                        title="Exames Laboratoriais"
                        description="Resultados de exames de sangue."
                        icon={Droplet}
                        to="#" // (Link futuro)
                    />
                    <ModuleCard 
                        title="Metas e Prescrições"
                        description="Calorias, macros e orientações."
                        icon={HeartPulse}
                        to="#" // (Link futuro)
                    />
                    <ModuleCard 
                        title="Conquistas"
                        description="Gerenciar conquistas do paciente."
                        icon={Sparkles}
                        to="#" // (Link futuro)
                    />
                </div>
            </main>
        </div>
    );
};

export default PatientHubPage;