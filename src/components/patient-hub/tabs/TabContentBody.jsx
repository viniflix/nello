import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Camera, TrendingDown, TrendingUp, Calendar, ArrowRight, Ruler } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * TabContentBody - Dashboard de Avaliação Corporal
 * Estilo: Prontuário moderno com métricas em destaque
 */
const TabContentBody = ({ patientId, modulesStatus = {}, latestMetrics = {} }) => {
    const navigate = useNavigate();

    // Dados reais do paciente
    const anthropometryData = {
        hasData: modulesStatus.anthropometry === 'completed' || !!latestMetrics?.weight,
        currentWeight: latestMetrics?.weight,
        previousWeight: latestMetrics?.previous_weight || null,
        height: latestMetrics?.height,
        bmi: null, // Será calculado
        lastUpdate: latestMetrics?.updated_at || latestMetrics?.created_at
    };

    // Calcular IMC se houver altura e peso
    if (anthropometryData.height && anthropometryData.currentWeight) {
        const heightInMeters = anthropometryData.height / 100;
        anthropometryData.bmi = (anthropometryData.currentWeight / (heightInMeters ** 2)).toFixed(1);
    }

    // Calcular variação de peso (apenas se houver peso anterior real)
    const weightDiff = anthropometryData.previousWeight
        ? anthropometryData.currentWeight - anthropometryData.previousWeight
        : 0;
    const weightDiffAbs = Math.abs(weightDiff).toFixed(1);

    // Função para classificar IMC por gravidade
    const getIMCClassification = (bmi) => {
        const bmiValue = parseFloat(bmi);
        if (bmiValue < 16) {
            return {
                label: 'Magreza Grave',
                color: 'bg-red-700/10 text-red-800 border-red-700',
                severity: 'critical'
            };
        } else if (bmiValue >= 16 && bmiValue < 17) {
            return {
                label: 'Magreza Moderada',
                color: 'bg-orange-600/10 text-orange-800 border-orange-600',
                severity: 'high'
            };
        } else if (bmiValue >= 17 && bmiValue < 18.5) {
            return {
                label: 'Magreza Leve',
                color: 'bg-yellow-500/10 text-yellow-800 border-yellow-500',
                severity: 'moderate'
            };
        } else if (bmiValue >= 18.5 && bmiValue < 25) {
            return {
                label: 'Peso Normal',
                color: 'bg-[#5f6f52]/10 text-[#5f6f52] border-[#5f6f52]',
                severity: 'normal'
            };
        } else if (bmiValue >= 25 && bmiValue < 30) {
            return {
                label: 'Sobrepeso',
                color: 'bg-yellow-500/10 text-yellow-800 border-yellow-500',
                severity: 'moderate'
            };
        } else if (bmiValue >= 30 && bmiValue < 35) {
            return {
                label: 'Obesidade Grau I',
                color: 'bg-orange-600/10 text-orange-800 border-orange-600',
                severity: 'high'
            };
        } else if (bmiValue >= 35 && bmiValue < 40) {
            return {
                label: 'Obesidade Grau II',
                color: 'bg-red-600/10 text-red-800 border-red-600',
                severity: 'critical'
            };
        } else {
            return {
                label: 'Obesidade Grau III',
                color: 'bg-red-700/10 text-red-900 border-red-700',
                severity: 'critical'
            };
        }
    };

    // ============================================================
    // CARD 1: PESO (Principal - Grande Destaque)
    // ============================================================
    const WeightCard = () => {
        if (!anthropometryData.hasData) {
            // Estado Vazio
            return (
                <Card className="border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30 hover:shadow-lg transition-all">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-16 h-16 rounded-full bg-[#fefae0] flex items-center justify-center mb-4">
                            <BarChart3 className="w-8 h-8 text-[#5f6f52]" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                            Nenhuma Avaliação Registrada
                        </h3>
                        <p className="text-sm text-muted-foreground mb-6 max-w-md">
                            Registre peso, altura e medidas para acompanhar a evolução do paciente
                        </p>
                        <Button
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/anthropometry`)}
                            className="gap-2"
                        >
                            <BarChart3 className="w-4 h-4" />
                            Registrar Avaliação
                        </Button>
                    </CardContent>
                </Card>
            );
        }

        // Estado Preenchido
        return (
            <Card className="border-l-4 border-l-[#5f6f52] hover:shadow-xl transition-all bg-gradient-to-br from-[#fefae0]/20 to-[#fefae0]/30">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-[#5f6f52]" />
                            <CardTitle className="text-base">Avaliação Antropométrica</CardTitle>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/anthropometry`)}
                            className="gap-1"
                        >
                            Ver Completo
                            <ArrowRight className="w-3 h-3" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent>
                    {/* Grid de Métricas */}
                    <div className="grid grid-cols-3 gap-4">
                        {/* PESO - Destaque Principal */}
                        <div className="col-span-2">
                            <Card className="bg-gradient-to-br from-[#5f6f52] to-[#a9b388] text-white border-0">
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="text-sm font-medium opacity-90">Peso Atual</div>
                                        {weightDiff !== 0 && (
                                            <div className="flex items-center gap-1 bg-[#fefae0]/20 px-2 py-1 rounded">
                                                {weightDiff < 0 ? (
                                                    <TrendingDown className="w-4 h-4 text-green-300" />
                                                ) : (
                                                    <TrendingUp className="w-4 h-4 text-red-300" />
                                                )}
                                                <span className="text-xs font-semibold">
                                                    {weightDiff < 0 ? '-' : '+'}{weightDiffAbs} kg
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Peso em Grande Destaque */}
                                    <div className="text-6xl font-bold mb-1">
                                        {anthropometryData.currentWeight.toFixed(1)}
                                        <span className="text-2xl ml-2 opacity-80">kg</span>
                                    </div>

                                    {anthropometryData.previousWeight && (
                                        <div className="text-sm opacity-80">
                                            Anterior: {anthropometryData.previousWeight.toFixed(1)} kg
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* IMC e Altura */}
                        <div className="space-y-4">
                            {/* IMC */}
                            {anthropometryData.bmi && (() => {
                                const bmiClass = getIMCClassification(anthropometryData.bmi);
                                return (
                                    <Card className="bg-[#fefae0]/50 border-[#a9b388]">
                                        <CardContent className="p-4 text-center">
                                            <div className="text-xs text-muted-foreground mb-1">IMC</div>
                                            <div className="text-3xl font-bold text-foreground mb-1">
                                                {anthropometryData.bmi}
                                            </div>
                                            <Badge variant="outline" className={cn("text-xs font-medium", bmiClass.color)}>
                                                {bmiClass.label}
                                            </Badge>
                                        </CardContent>
                                    </Card>
                                );
                            })()}

                            {/* Altura */}
                            {anthropometryData.height && (
                                <Card className="bg-[#f9ebc7]/50 border-[#a9b388]">
                                    <CardContent className="p-4 text-center">
                                        <Ruler className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                                        <div className="text-2xl font-bold text-foreground">
                                            {anthropometryData.height}
                                        </div>
                                        <div className="text-xs text-muted-foreground">cm</div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>

                    {/* Info Adicional */}
                    {anthropometryData.lastUpdate && (
                        <div className="text-xs text-muted-foreground pt-4 mt-4 border-t">
                            <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Última avaliação: {new Date(anthropometryData.lastUpdate).toLocaleDateString('pt-BR')}
                            </span>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    // ============================================================
    // CARD 2: FOTOS DE PROGRESSO
    // ============================================================
    const PhotosCard = () => {
        // TODO: Implementar query real para buscar fotos do paciente
        const hasPhotos = false;

        return (
            <Card className="hover:shadow-md transition-all">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Camera className="w-5 h-5 text-[#b99470]" />
                            <CardTitle className="text-base">Fotos de Progresso</CardTitle>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/photos`)}
                            className="h-auto p-1"
                        >
                            <ArrowRight className="w-4 h-4" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="text-center py-6">
                        <div className="w-12 h-12 rounded-full bg-[#fefae0] flex items-center justify-center mx-auto mb-3">
                            <Camera className="w-6 h-6 text-[#b99470]" />
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            Nenhuma foto registrada
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/photos`)}
                            className="gap-2"
                        >
                            <Camera className="w-3 h-3" />
                            Adicionar Fotos
                        </Button>
                    </div>
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
                <h3 className="text-xl font-bold text-foreground mb-1">Avaliação Corporal</h3>
                <p className="text-sm text-muted-foreground">
                    Medidas antropométricas e registro visual do progresso
                </p>
            </div>

            {/* Grid de Cards */}
            <div className="space-y-4">
                {/* Card de Peso - Full Width */}
                <WeightCard />

                {/* Card de Fotos - Full Width */}
                <PhotosCard />
            </div>
        </div>
    );
};

export default TabContentBody;
