import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Droplet, Activity, CheckCircle2, AlertCircle, Calendar, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getLatestAnamnesis } from '@/lib/supabase/anamnesis-queries';

/**
 * TabContentClinical - Dashboard de Dados Clínicos
 * Estilo: Prontuário moderno com status visual claro
 */
const TabContentClinical = ({ patientId, modulesStatus = {} }) => {
    const navigate = useNavigate();
    const [latestAnamnesis, setLatestAnamnesis] = useState(null);
    const [anamnesisLoading, setAnamnesisLoading] = useState(true);

    // Buscar última anamnese do paciente
    useEffect(() => {
        const fetchLatestAnamnesis = async () => {
            if (!patientId) return;

            setAnamnesisLoading(true);
            try {
                const { data } = await getLatestAnamnesis(patientId);
                setLatestAnamnesis(data);
            } catch (error) {
                console.error('Erro ao buscar anamnese:', error);
            } finally {
                setAnamnesisLoading(false);
            }
        };

        fetchLatestAnamnesis();
    }, [patientId]);

    // ============================================================
    // MOCK DATA - Substituir por dados reais quando integrado
    // ============================================================
    const mockClinicalData = {
        labs: {
            completed: modulesStatus.lab_results === 'completed',
            lastUpdate: '2024-12-20',
            recentTests: [
                { name: 'Glicemia', value: '95 mg/dL', status: 'normal' },
                { name: 'Colesterol Total', value: '185 mg/dL', status: 'normal' },
                { name: 'Vitamina D', value: '22 ng/mL', status: 'low' }
            ]
        }
    };

    // ============================================================
    // CARD 1: ANAMNESE
    // ============================================================
    const AnamnesisCard = () => {
        const hasAnamnesis = !anamnesisLoading && latestAnamnesis;

        if (anamnesisLoading) {
            // Loading state
            return (
                <Card className="border-l-4 border-l-[#a9b388]">
                    <CardContent className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">Carregando anamnese...</p>
                    </CardContent>
                </Card>
            );
        }

        if (!hasAnamnesis) {
            // Estado Pendente
            return (
                <Card className="border-l-4 border-l-[#c4661f] bg-[#fefae0]/30 hover:shadow-md transition-all">
                    <CardContent className="py-8">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-[#fefae0] flex items-center justify-center flex-shrink-0">
                                <AlertCircle className="w-6 h-6 text-[#c4661f]" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <h3 className="text-lg font-semibold text-foreground">Anamnese</h3>
                                    <Badge className="bg-[#fefae0] text-[#c4661f] border-[#c4661f]">
                                        Pendente
                                    </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Histórico clínico ainda não registrado. Complete a anamnese para identificar
                                    alergias, condições de saúde e medicações em uso.
                                </p>
                                <Button
                                    onClick={() => navigate(`/nutritionist/patients/${patientId}/anamnesis`)}
                                    className="gap-2"
                                >
                                    <FileText className="w-4 h-4" />
                                    Iniciar Anamnese
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            );
        }

        // Estado Completo - Com dados reais
        const statusConfig = {
            draft: { label: 'Rascunho', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
            completed: { label: 'Completa', color: 'bg-[#a9b388]/20 text-[#5f6f52] border-[#5f6f52]' }
        };
        const config = statusConfig[latestAnamnesis.status] || statusConfig.draft;

        return (
            <Card className="border-l-4 border-l-[#5f6f52] hover:shadow-xl transition-all">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-[#5f6f52]" />
                            <CardTitle className="text-lg">Anamnese</CardTitle>
                            <Badge variant="outline" className={config.color}>
                                {config.label}
                            </Badge>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/anamnesis`)}
                            className="gap-1"
                        >
                            Ver Histórico
                            <ArrowRight className="w-3 h-3" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent>
                    {/* Informações sobre o documento usado */}
                    <div className="bg-[#fefae0] border border-[#a9b388] rounded-lg p-3 mb-3">
                        <div className="text-xs font-semibold text-[#5f6f52] mb-1 uppercase tracking-wide">
                            📋 Documento
                        </div>
                        <p className="text-sm text-foreground">
                            {latestAnamnesis.template?.title || 'Anamnese Nutricional'}
                        </p>
                    </div>

                    {/* Data de Atualização */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 mt-3 border-t">
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Registrada em: {new Date(latestAnamnesis.date).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric'
                            })}
                        </span>
                        <Button
                            variant="link"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/anamnesis`)}
                            className="h-auto p-0 text-xs"
                        >
                            Ver completo →
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    // ============================================================
    // CARD 2: EXAMES LABORATORIAIS
    // ============================================================
    const LabsCard = () => {
        const isComplete = mockClinicalData.labs.completed;

        if (!isComplete) {
            // Estado Vazio
            return (
                <Card className="border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30 hover:shadow-md transition-all">
                    <CardContent className="py-8 text-center">
                        <div className="w-12 h-12 rounded-full bg-[#fefae0] flex items-center justify-center mx-auto mb-3">
                            <Droplet className="w-6 h-6 text-[#b99470]" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground mb-2">
                            Exames Laboratoriais
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                            Nenhum exame registrado. Adicione resultados de análises clínicas
                            para um acompanhamento mais completo.
                        </p>
                        <Button
                            variant="outline"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/lab-results`)}
                            className="gap-2"
                        >
                            <Droplet className="w-4 h-4" />
                            Adicionar Exames
                        </Button>
                    </CardContent>
                </Card>
            );
        }

        // Estado Preenchido
        return (
            <Card className="border-l-4 border-l-[#b99470] hover:shadow-xl transition-all">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                            <Droplet className="w-5 h-5 text-[#b99470]" />
                            <CardTitle className="text-base">Exames Laboratoriais</CardTitle>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/lab-results`)}
                            className="gap-1"
                        >
                            Ver Todos
                            <ArrowRight className="w-3 h-3" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent>
                    {/* Últimos Exames */}
                    <div className="space-y-2 mb-3">
                        {mockClinicalData.labs.recentTests.map((test, idx) => (
                            <div
                                key={idx}
                                className={cn(
                                    "flex items-center justify-between p-3 rounded-lg border",
                                    test.status === 'normal' ? "bg-[#a9b388]/10 border-[#a9b388]" :
                                    test.status === 'low' ? "bg-[#fefae0] border-[#b99470]" :
                                    "bg-red-50 border-red-200"
                                )}
                            >
                                <div>
                                    <div className="text-sm font-medium text-foreground">{test.name}</div>
                                    <div className="text-xs text-muted-foreground">{test.value}</div>
                                </div>
                                <Badge variant="outline" className={cn(
                                    "text-xs",
                                    test.status === 'normal' ? "bg-[#5f6f52]/10 text-[#5f6f52] border-[#5f6f52]" :
                                    test.status === 'low' ? "bg-[#b99470]/10 text-[#b99470] border-[#b99470]" :
                                    "bg-red-100 text-red-800 border-red-300"
                                )}>
                                    {test.status === 'normal' ? 'Normal' :
                                     test.status === 'low' ? 'Baixo' : 'Alto'}
                                </Badge>
                            </div>
                        ))}
                    </div>

                    {/* Data de Atualização */}
                    <div className="text-xs text-muted-foreground pt-3 border-t flex items-center justify-between">
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Últimos exames: {new Date(mockClinicalData.labs.lastUpdate).toLocaleDateString('pt-BR')}
                        </span>
                        <Button
                            variant="link"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/lab-results`)}
                            className="h-auto p-0 text-xs"
                        >
                            Adicionar novos →
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    // ============================================================
    // CARD 3: RASTREAMENTO METABÓLICO (Placeholder)
    // ============================================================
    const MetabolicCard = () => {
        return (
            <Card className="border-dashed border-2 hover:shadow-md transition-all opacity-60">
                <CardContent className="py-8 text-center">
                    <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <h3 className="text-sm font-semibold text-foreground mb-1">
                        Rastreamento Metabólico
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Em desenvolvimento
                    </p>
                </CardContent>
            </Card>
        );
    };

    // ============================================================
    // RENDER PRINCIPAL
    // ============================================================
    return (
        <div className="space-y-6">
            {/* Header da Seção */}
            <div>
                <h3 className="text-xl font-bold text-foreground mb-1">Dados Clínicos</h3>
                <p className="text-sm text-muted-foreground">
                    Histórico de saúde, exames e rastreamentos metabólicos
                </p>
            </div>

            {/* Grid de Cards */}
            <div className="space-y-4">
                {/* Anamnese - Full Width */}
                <AnamnesisCard />

                {/* Grid 2 Colunas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <LabsCard />
                    <MetabolicCard />
                </div>
            </div>
        </div>
    );
};

export default TabContentClinical;
