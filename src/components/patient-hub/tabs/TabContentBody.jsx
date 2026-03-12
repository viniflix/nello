import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Camera, TrendingDown, TrendingUp, Calendar, ArrowRight, Ruler, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { patientRoute } from '@/lib/utils/patientRoutes';
import { getProgressPhotosSummary, getWeightClosestToDate } from '@/lib/supabase/progress-photos-queries';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TabContentBody = ({ patientId, patientData, modulesStatus = {}, latestMetrics = {} }) => {
    const navigate = useNavigate();
    const patient = patientData || { id: patientId };
    const [photosSummary, setPhotosSummary] = useState({ first: null, last: null, all: [] });
    const [weightBefore, setWeightBefore] = useState(null);
    const [weightAfter, setWeightAfter] = useState(null);
    const [photosLoading, setPhotosLoading] = useState(true);

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
            return { label: 'Magreza Grave', color: 'bg-red-700/10 text-red-800 border-red-700 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30', severity: 'critical' };
        } else if (bmiValue >= 16 && bmiValue < 17) {
            return { label: 'Magreza Moderada', color: 'bg-orange-600/10 text-orange-800 border-orange-600 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30', severity: 'high' };
        } else if (bmiValue >= 17 && bmiValue < 18.5) {
            return { label: 'Magreza Leve', color: 'bg-yellow-500/10 text-yellow-800 border-yellow-500 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30', severity: 'moderate' };
        } else if (bmiValue >= 18.5 && bmiValue < 25) {
            return { label: 'Peso Normal', color: 'bg-[#5f6f52]/10 text-[#5f6f52] border-[#5f6f52] dark:text-[#a9b388]', severity: 'normal' };
        } else if (bmiValue >= 25 && bmiValue < 30) {
            return { label: 'Sobrepeso', color: 'bg-yellow-500/10 text-yellow-800 border-yellow-500 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30', severity: 'moderate' };
        } else if (bmiValue >= 30 && bmiValue < 35) {
            return { label: 'Obesidade Grau I', color: 'bg-orange-600/10 text-orange-800 border-orange-600 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30', severity: 'high' };
        } else if (bmiValue >= 35 && bmiValue < 40) {
            return { label: 'Obesidade Grau II', color: 'bg-red-600/10 text-red-800 border-red-600 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30', severity: 'critical' };
        } else {
            return { label: 'Obesidade Grau III', color: 'bg-red-700/10 text-red-900 border-red-700 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30', severity: 'critical' };
        }
    };

    const WeightCard = () => {
        if (!anthropometryData.hasData) {
            return (
                <Card
                    className="border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30 hover:shadow-lg transition-all cursor-pointer h-full"
                    onClick={() => navigate(patientRoute(patient, 'anthropometry'))}
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
                className="border-l-4 border-l-[#5f6f52] dark:border-l-[#a9b388] hover:shadow-xl transition-all bg-gradient-to-br from-[#fefae0]/20 to-[#fefae0]/30 dark:from-muted/20 dark:to-muted/30 cursor-pointer h-full"
                onClick={() => navigate(patientRoute(patient, 'anthropometry'))}
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
                                <div className="bg-[#fefae0] dark:bg-muted/30 border border-[#a9b388] dark:border-[#a9b388]/50 rounded-lg p-4 text-center flex flex-col justify-center">
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
                        <div className="bg-[#f9ebc7] dark:bg-muted/30 border border-[#a9b388] dark:border-[#a9b388]/50 rounded-lg p-3 text-center mb-3">
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
                                className="h-7 text-[#5f6f52] dark:text-[#a9b388] hover:bg-[#5f6f52]/10 dark:hover:bg-[#a9b388]/10"
                                onClick={() => navigate(patientRoute(patient, 'anthropometry'))}
                            >
                                Abrir <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    useEffect(() => {
        if (!patientId) {
            setPhotosLoading(false);
            return;
        }
        let cancelled = false;
        setPhotosLoading(true);
        (async () => {
            const full = await getProgressPhotosSummary({ patientId });
            if (cancelled) return;
            setPhotosSummary({ first: full.first, last: full.last, all: full.all });
            if (full.first) {
                const { data: wBefore } = await getWeightClosestToDate({ patientId, date: full.first.photo_date });
                if (!cancelled && wBefore) setWeightBefore(wBefore);
            } else setWeightBefore(null);
            if (full.last) {
                const { data: wAfter } = await getWeightClosestToDate({ patientId, date: full.last.photo_date });
                if (!cancelled && wAfter) setWeightAfter(wAfter);
            } else setWeightAfter(null);
            setPhotosLoading(false);
        })();
        return () => { cancelled = true; };
    }, [patientId]);

    const PhotosCard = () => {
        const { first, last, all } = photosSummary;
        const hasPhotos = all.length > 0;
        const weightDiff =
            weightBefore?.weight != null && weightAfter?.weight != null
                ? weightAfter.weight - weightBefore.weight
                : null;

        if (photosLoading) {
            return (
                <Card className="border-dashed border-2 border-[#b99470] bg-[#fefae0]/20 h-full">
                    <CardContent className="py-8 flex items-center justify-center">
                        <div className="animate-pulse text-muted-foreground text-sm">Carregando fotos...</div>
                    </CardContent>
                </Card>
            );
        }

        if (!hasPhotos) {
            return (
                <Card
                    className="border-dashed border-2 border-[#b99470] bg-[#fefae0]/30 hover:shadow-md transition-all cursor-pointer h-full"
                    onClick={() => navigate(patientRoute(patient, 'photos'))}
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
        }

        return (
            <Card
                className="border-l-4 border-l-[#b99470] dark:border-l-[#d5b08c] hover:shadow-xl transition-all bg-gradient-to-br from-[#fefae0]/20 to-[#fefae0]/10 dark:from-muted/20 dark:to-muted/10 cursor-pointer h-full"
                onClick={() => navigate(patientRoute(patient, 'photos'))}
            >
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <Camera className="w-5 h-5 text-[#b99470] shrink-0" />
                        <div className="min-w-0">
                            <CardTitle className="text-base">Fotos de Progresso</CardTitle>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {all.length} foto{all.length !== 1 ? 's' : ''}
                                {first && last && first.photo_date !== last.photo_date && (
                                    <span className="ml-1"> · {format(new Date(first.photo_date), 'dd/MM/yy', { locale: ptBR })} a {format(new Date(last.photo_date), 'dd/MM/yy', { locale: ptBR })}</span>
                                )}
                            </p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg overflow-hidden border border-[#b99470]/40 bg-muted/30 aspect-[3/4] min-h-0">
                            <img
                                src={first.photo_url}
                                alt="Antes"
                                className="w-full h-full object-cover"
                            />
                            <div className="bg-[#b99470]/90 text-white text-center py-1 px-2">
                                <span className="font-semibold text-xs">Antes</span>
                                <p className="text-[10px] opacity-90">
                                    {format(new Date(first.photo_date), 'dd/MM/yyyy', { locale: ptBR })}
                                </p>
                            </div>
                        </div>
                        <div className="rounded-lg overflow-hidden border border-[#b99470]/40 bg-muted/30 aspect-[3/4] min-h-0">
                            <img
                                src={last.photo_url}
                                alt="Depois"
                                className="w-full h-full object-cover"
                            />
                            <div className="bg-[#b99470]/90 text-white text-center py-1 px-2">
                                <span className="font-semibold text-xs">Depois</span>
                                <p className="text-[10px] opacity-90">
                                    {format(new Date(last.photo_date), 'dd/MM/yyyy', { locale: ptBR })}
                                </p>
                            </div>
                        </div>
                    </div>
                    {weightDiff != null && (
                        <div className="flex items-center justify-center gap-2 text-xs rounded-lg bg-muted/50 p-2 border border-border">
                            <Scale className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Peso (período):</span>
                            <span className="font-semibold">
                                {weightBefore?.weight?.toFixed(1)} kg → {weightAfter?.weight?.toFixed(1)} kg
                                {weightDiff !== 0 && (
                                    <span className={cn('ml-1', weightDiff < 0 ? 'text-green-600' : 'text-amber-600')}>
                                        ({weightDiff > 0 ? '+' : ''}{weightDiff.toFixed(1)} kg)
                                    </span>
                                )}
                            </span>
                        </div>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full gap-1 text-[#b99470] dark:text-[#d5b08c] hover:bg-[#b99470]/10 dark:hover:bg-[#d5b08c]/10"
                        onClick={(e) => { e.stopPropagation(); navigate(patientRoute(patient, 'photos')); }}
                    >
                        Ver timeline
                        <ArrowRight className="w-3 h-3" />
                    </Button>
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
