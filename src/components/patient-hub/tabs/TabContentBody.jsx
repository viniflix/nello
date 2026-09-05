import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HubMetric, HubPanel } from '@/components/patient-hub/HubPanel';
import { patientRoute } from '@/lib/utils/patientRoutes';
import { getProgressPhotosSummary, getWeightClosestToDate } from '@/lib/supabase/progress-photos-queries';

const formatDate = value => value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleDateString('pt-BR')
    : 'Data não informada';

const bmiLabel = value => {
    if (value == null) return 'Sem classificação';
    if (value < 18.5) return 'Baixo peso';
    if (value < 25) return 'Peso adequado';
    if (value < 30) return 'Sobrepeso';
    if (value < 35) return 'Obesidade grau I';
    if (value < 40) return 'Obesidade grau II';
    return 'Obesidade grau III';
};

export default function TabContentBody({ patientId, patientData, modulesStatus = {}, latestMetrics = {} }) {
    const navigate = useNavigate();
    const patient = patientData || { id: patientId };
    const [photos, setPhotos] = useState({ first: null, last: null, all: [] });
    const [photoWeights, setPhotoWeights] = useState({ first: null, last: null });
    const [photosLoading, setPhotosLoading] = useState(true);
    const [photosError, setPhotosError] = useState(false);

    const body = useMemo(() => {
        const weight = Number(latestMetrics?.weight);
        const previousWeight = Number(latestMetrics?.previous_weight);
        const height = Number(latestMetrics?.height);
        const validWeight = Number.isFinite(weight) && weight > 0 ? weight : null;
        const validPrevious = Number.isFinite(previousWeight) && previousWeight > 0 ? previousWeight : null;
        const validHeight = Number.isFinite(height) && height > 0 ? height : null;
        const bmi = validWeight && validHeight ? validWeight / ((validHeight / 100) ** 2) : null;
        return {
            weight: validWeight,
            previousWeight: validPrevious,
            height: validHeight,
            bmi,
            hasData: modulesStatus.anthropometry === 'completed' || validWeight != null,
            updatedAt: latestMetrics?.updated_at || latestMetrics?.created_at
        };
    }, [latestMetrics, modulesStatus.anthropometry]);

    const loadPhotos = async () => {
        if (!patientId) {
            setPhotosLoading(false);
            return;
        }
        setPhotosLoading(true);
        setPhotosError(false);
        try {
            const summary = await getProgressPhotosSummary({ patientId });
            const next = summary || { first: null, last: null, all: [] };
            setPhotos(next);
            const [firstResult, lastResult] = await Promise.all([
                next.first ? getWeightClosestToDate({ patientId, date: next.first.photo_date }) : Promise.resolve({ data: null }),
                next.last ? getWeightClosestToDate({ patientId, date: next.last.photo_date }) : Promise.resolve({ data: null })
            ]);
            setPhotoWeights({ first: firstResult?.data || null, last: lastResult?.data || null });
        } catch {
            setPhotosError(true);
            setPhotos({ first: null, last: null, all: [] });
            setPhotoWeights({ first: null, last: null });
        } finally {
            setPhotosLoading(false);
        }
    };

    useEffect(() => {
        void loadPhotos();
        // A carga é reiniciada somente ao trocar de paciente.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patientId]);

    const weightChange = body.weight != null && body.previousWeight != null ? body.weight - body.previousWeight : null;
    const photoWeightChange = photoWeights.first?.weight != null && photoWeights.last?.weight != null
        ? Number(photoWeights.last.weight) - Number(photoWeights.first.weight)
        : null;

    return <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
            <HubPanel
                title="Composição corporal"
                description={body.updatedAt ? `Última avaliação em ${formatDate(body.updatedAt)}` : 'Peso, altura e indicadores antropométricos'}
                action={<Button size="sm" onClick={() => navigate(patientRoute(patient, 'anthropometry'))}>{body.hasData ? 'Abrir avaliação' : 'Registrar avaliação'}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>}
            >
                {body.hasData ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <HubMetric label="Peso atual" value={body.weight == null ? '—' : `${body.weight.toFixed(1)} kg`} detail={weightChange == null ? 'Sem comparação anterior' : `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg no período`} />
                    <HubMetric label="IMC" value={body.bmi == null ? '—' : body.bmi.toFixed(1)} detail={bmiLabel(body.bmi)} />
                    <HubMetric label="Altura" value={body.height == null ? '—' : `${body.height.toFixed(0)} cm`} detail="Medida registrada" />
                    <HubMetric label="Peso anterior" value={body.previousWeight == null ? '—' : `${body.previousWeight.toFixed(1)} kg`} detail="Referência da comparação" />
                </div> : <div className="space-y-3">
                    <p className="text-sm leading-relaxed text-muted-foreground">Nenhuma avaliação corporal foi registrada para este paciente.</p>
                    <Button size="sm" variant="outline" onClick={() => navigate(patientRoute(patient, 'anthropometry'))}><Ruler className="mr-1.5 h-4 w-4" />Registrar medidas</Button>
                </div>}
            </HubPanel>
        </div>

        <div className="min-w-0 lg:col-span-2">
            <HubPanel
                title="Fotos de progresso"
                description={photos.all.length ? `${photos.all.length} registro${photos.all.length === 1 ? '' : 's'} no histórico` : 'Comparação visual da evolução'}
                action={<Button size="sm" variant="outline" onClick={() => navigate(patientRoute(patient, 'photos'))}>{photos.all.length ? 'Ver histórico' : 'Adicionar foto'}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>}
            >
                {photosLoading ? <div role="status" aria-label="Carregando fotos" className="grid grid-cols-2 gap-2"><Skeleton className="aspect-[4/3] rounded-lg" /><Skeleton className="aspect-[4/3] rounded-lg" /></div>
                    : photosError ? <div className="space-y-3"><p className="text-sm text-slate-600">Não foi possível carregar as fotos.</p><Button size="sm" variant="outline" onClick={() => void loadPhotos()}>Recarregar</Button></div>
                        : photos.all.length === 0 ? <p className="text-sm leading-relaxed text-muted-foreground">Ainda não há fotos de progresso registradas.</p>
                            : <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    {[['Antes', photos.first], ['Mais recente', photos.last]].map(([label, photo]) => <figure key={label} className="min-w-0 overflow-hidden rounded-lg border border-[#d8d5d0] bg-[#efeeec] shadow-inner">
                                        <img src={photo?.photo_url} alt={`Foto de progresso: ${label}`} className="aspect-[4/3] w-full object-cover" />
                                        <figcaption className="px-2 py-2"><p className="text-xs font-semibold text-slate-700">{label}</p><p className="mt-0.5 text-[11px] text-slate-500">{formatDate(photo?.photo_date)}</p></figcaption>
                                    </figure>)}
                                </div>
                                {photoWeightChange != null && <p className="text-xs leading-relaxed text-slate-500">Variação de peso entre as fotos: <span className="font-semibold text-slate-700">{photoWeightChange > 0 ? '+' : ''}{photoWeightChange.toFixed(1)} kg</span></p>}
                            </div>}
            </HubPanel>
        </div>
    </div>;
}
