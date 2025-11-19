import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Camera, TrendingDown, TrendingUp, Calendar, ArrowRight, Ruler } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TabContentBody = ({ patientId, modulesStatus = {}, latestMetrics = {} }) => {
    const navigate = useNavigate();

    const anthropometryData = {
        hasData: modulesStatus.anthropometry === 'completed' || !!latestMetrics?.weight,
        currentWeight: latestMetrics?.weight,
        previousWeight: latestMetrics?.previous_weight || null,
        height: latestMetrics?.height,
        bmi: null,
        lastUpdate: latestMetrics?.updated_at || latestMetrics?.created_at
    };

    if (anthropometryData.height && anthropometryData.currentWeight) {
        const heightInMeters = anthropometryData.height / 100;
        anthropometryData.bmi = (anthropometryData.currentWeight / (heightInMeters ** 2)).toFixed(1);
    }

    const weightDiff = anthropometryData.previousWeight
        ? anthropometryData.currentWeight - anthropometryData.previousWeight
        : 0;
    const weightDiffAbs = Math.abs(weightDiff).toFixed(1);

    const getIMCClassification = (bmi) => {
        const bmiValue = parseFloat(bmi);
        if (bmiValue < 16) {
            return { label: 'Magreza Grave', color: 'bg-red-700/10 text-red-800 border-red-700', severity: 'critical' };
        } else if (bmiValue >= 16 && bmiValue < 17) {
            return { label: 'Magreza Moderada', color: 'bg-orange-600/10 text-orange-800 border-orange-600', severity: 'high' };
        } else if (bmiValue >= 17 && bmiValue < 18.5) {
            return { label: 'Magreza Leve', color: 'bg-yellow-500/10 text-yellow-800 border-yellow-500', severity: 'moderate' };
        } else if (bmiValue >= 18.5 && bmiValue < 25) {
            return { label: 'Peso Normal', color: 'bg-[#5f6f52]/10 text-[#5f6f52] border-[#5f6f52]', severity: 'normal' };
        } else if (bmiValue >= 25 && bmiValue < 30) {
            return { label: 'Sobrepeso', color: 'bg-yellow-500/10 text-yellow-800 border-yellow-500', severity: 'moderate' };
        } else if (bmiValue >= 30 && bmiValue < 35) {
            return { label: 'Obesidade Grau I', color: 'bg-orange-600/10 text-orange-800 border-orange-600', severity: 'high' };
        } else if (bmiValue >= 35 && bmiValue < 40) {
            return { label: 'Obesidade Grau II', color: 'bg-red-600/10 text-red-800 border-red-600', severity: 'critical' };
        } else {
            return { label: 'Obesidade Grau III', color: 'bg-red-700/10 text-red-900 border-red-700', severity: 'critical' };
        }
    };

    const WeightCard = () => {
        if (!anthropometryData.hasData) {
            return (
                <Card
                    className="border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30 hover:shadow-lg transition-all cursor-pointer h-full"
                    onClick={() => navigate(`/nutritionist/patients/${patientId}/anthropometry`)}
                >
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
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-[#5f6f52]">
                            <BarChart3 className="w-4 h-4" />
                            Registrar Avaliação
                            <ArrowRight className="w-4 h-4" />
                        </span>
                    </CardContent>
                </Card>
            );
        }

        return (
            <Card
                className="border-l-4 border-l-[#5f6f52] hover:shadow-xl transition-all bg-gradient-to-br from-[#fefae0]/20 to-[#fefae0]/30 cursor-pointer h-full"
                onClick={() => navigate(`/nutritionist/patients/${patientId}/anthropometry`)}
            >
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-[#5f6f52]" />
                        <CardTitle className="text-base">Avaliação Antropométrica</CardTitle>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                        {/* Peso Atual */}
                        <div className="bg-gradient-to-br from-[#5f6f52] to-[#a9b388] text-white rounded-lg p-4">
                            <div className="flex items-start justify-between mb-2">
                                <div className="text-xs font-medium opacity-90">Peso Atual</div>
                                {weightDiff !== 0 && (
                                    <div className="flex items-center gap-1 bg-[#fefae0]/20 px-1.5 py-0.5 rounded text-xs">
                                        {weightDiff < 0 ? (
                                            <TrendingDown className="w-3 h-3 text-green-300" />
                                        ) : (
                                            <TrendingUp className="w-3 h-3 text-red-300" />
                                        )}
                                        <span className="font-semibold">
                                            {weightDiff < 0 ? '-' : '+'}{weightDiffAbs} kg
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="text-4xl font-bold mb-1">
                                {anthropometryData.currentWeight.toFixed(1)}
                                <span className="text-lg ml-1 opacity-80">kg</span>
                            </div>
                            {anthropometryData.previousWeight && (
                                <div className="text-xs opacity-80">
                                    Anterior: {anthropometryData.previousWeight.toFixed(1)} kg
                                </div>
                            )}
                        </div>

                        {/* IMC */}
                        {anthropometryData.bmi && (() => {
                            const bmiClass = getIMCClassification(anthropometryData.bmi);
                            return (
                                <div className="bg-[#fefae0] border border-[#a9b388] rounded-lg p-4 text-center flex flex-col justify-center">
                                    <div className="text-xs text-muted-foreground mb-1">IMC</div>
                                    <div className="text-3xl font-bold text-foreground mb-2">
                                        {anthropometryData.bmi}
                                    </div>
                                    <Badge variant="outline" className={cn("text-xs font-medium mx-auto", bmiClass.color)}>
                                        {bmiClass.label}
                                    </Badge>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Altura */}
                    {anthropometryData.height && (
                        <div className="bg-[#f9ebc7] border border-[#a9b388] rounded-lg p-3 text-center mb-3">
                            <div className="flex items-center justify-center gap-2">
                                <Ruler className="w-4 h-4 text-muted-foreground" />
                                <div className="text-xl font-bold text-foreground">
                                    {anthropometryData.height} cm
                                </div>
                            </div>
                        </div>
                    )}

                    {anthropometryData.lastUpdate && (
                        <div className="text-xs pt-3 mt-3 border-t flex items-center justify-between">
                            <span className="flex items-center gap-1 text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                {new Date(anthropometryData.lastUpdate).toLocaleDateString('pt-BR')}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-[#5f6f52] hover:bg-[#5f6f52]/10"
                                onClick={() => navigate(`/nutritionist/patients/${patientId}/anthropometry`)}
                            >
                                Abrir <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    const PhotosCard = () => {
        const hasPhotos = false;

        return (
            <Card
                className="border-dashed border-2 border-[#b99470] bg-[#fefae0]/30 hover:shadow-md transition-all cursor-pointer h-full"
                onClick={() => navigate(`/nutritionist/patients/${patientId}/photos`)}
            >
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Camera className="w-5 h-5 text-[#b99470]" />
                        <CardTitle className="text-base">Fotos de Progresso</CardTitle>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="text-center py-6">
                        <div className="w-12 h-12 rounded-full bg-[#fefae0] flex items-center justify-center mx-auto mb-3">
                            <Camera className="w-6 h-6 text-[#b99470]" />
                        </div>
                        <p className="text-sm font-medium text-foreground mb-2">
                            Nenhuma foto registrada
                        </p>
                        <p className="text-xs text-muted-foreground mb-4">
                            Adicione fotos para acompanhar o progresso visual
                        </p>
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-[#b99470]">
                            <Camera className="w-3 h-3" />
                            Adicionar Fotos
                            <ArrowRight className="w-3 h-3" />
                        </span>
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-foreground mb-1">Avaliação Corporal</h3>
                <p className="text-sm text-muted-foreground">
                    Medidas antropométricas e registro visual do progresso
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
                <div className="lg:col-span-7">
                    <WeightCard />
                </div>
                <div className="lg:col-span-3">
                    <PhotosCard />
                </div>
            </div>
        </div>
    );
};

export default TabContentBody;
