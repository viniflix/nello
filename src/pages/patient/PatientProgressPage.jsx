import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, ChevronRight, FileText, Plus, Ruler, Droplet, Scale, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { deleteProgressPhoto } from '@/lib/supabase/progress-photos-queries';
import { logActivityEvent } from '@/lib/supabase/patient-queries';
import { useToast } from '@/hooks/use-toast';
import PatientCheckinHistoryWidget from '@/components/patient/PatientCheckinHistoryWidget';
import WeightChart from '@/components/anthropometry/WeightChart';
import { getPatientRecordFoundation } from '@/features/clinical-records/api/record-foundation-queries';
import {
  buildProgressTimeline,
  getCurrentSharedClinicalRecords,
  hasMeasurementData,
  sortNewestFirst,
} from '@/features/patient-progress/model/progressTimeline';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif'
};

const formatCivilDate = (value, pattern = 'dd/MM/yyyy') => {
  if (!value) return 'Data não informada';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISO(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : format(date, pattern);
};

export const formatWeightTooltip = (value) => [
  `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`,
  'Peso',
];

const CLINICAL_TYPE_LABELS = {
  clinical_evolution: 'Evolução clínica',
  follow_up: 'Acompanhamento clínico',
  initial_assessment: 'Avaliação inicial',
  discharge_summary: 'Resumo de alta',
};

/**
 * PatientProgressPage - Aba 3: Progresso
 *
 * Funcionalidades:
 * - Tabs para navegar entre Peso, Glicemia, Medidas, Fotos
 * - Gráficos de evolução (reutiliza WeightChart)
 * - FAB para registro rápido
 * - Dialog para adicionar novos registros
 */
export default function PatientProgressPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const isDiabetic = true; // Glicemia disponível para todos — nutri decide se ativa
  const [activeTab, setActiveTab] = useState('peso');
  const [activeDetail, setActiveDetail] = useState(null);
  const [weightData, setWeightData] = useState([]);
  const [glycemiaData, setGlycemiaData] = useState([]);
  const [measurementsData, setMeasurementsData] = useState([]);
  const [photosData, setPhotosData] = useState([]);
  const [clinicalRecords, setClinicalRecords] = useState([]);
  const [clinicalLoadError, setClinicalLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [goalWeight, setGoalWeight] = useState(null);

  // Form state para novo registro
  const [newWeight, setNewWeight] = useState('');
  const [newHeight, setNewHeight] = useState('');
  const [newHeadCircumference, setNewHeadCircumference] = useState('');
  const [newGlycemia, setNewGlycemia] = useState('');
  const [recordDate, setRecordDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [photoNotes, setPhotoNotes] = useState('');
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [deletePhotoTarget, setDeletePhotoTarget] = useState(null);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const loadRequestRef = useRef(0);
  const currentUserIdRef = useRef(userId);
  currentUserIdRef.current = userId;

  const loadProgressData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const requestId = ++loadRequestRef.current;
    const requestedUserId = userId;
    setLoading(true);
    setLoadError(false);
    setClinicalLoadError(false);
    try {
      const [weightResult, glycemiaResult, photoResult, foundationResult] = await Promise.all([
        supabase.from('growth_records').select('*').eq('patient_id', requestedUserId).order('record_date', { ascending: true }),
        supabase.from('glycemia_records').select('*').eq('patient_id', requestedUserId).order('date', { ascending: true }),
        supabase.from('progress_photos').select('*').eq('patient_id', requestedUserId).order('photo_date', { ascending: false }).limit(50),
        getPatientRecordFoundation(requestedUserId),
      ]);

      if (requestId !== loadRequestRef.current || requestedUserId !== currentUserIdRef.current) return;

      const requiredError = weightResult.error || glycemiaResult.error || photoResult.error;
      if (requiredError) throw requiredError;
      const weightRecords = weightResult.data || [];
      const glycemiaRecords = glycemiaResult.data || [];
      const photoRecords = photoResult.data || [];

      setWeightData(weightRecords);
      setGlycemiaData(glycemiaRecords || []);
      setPhotosData(photoRecords);
      setMeasurementsData(weightRecords.filter(hasMeasurementData));
      setClinicalRecords(foundationResult.error ? [] : getCurrentSharedClinicalRecords(foundationResult.data?.records));
      setClinicalLoadError(Boolean(foundationResult.error));
      setGoalWeight(null);
    } catch (error) {
      if (requestId !== loadRequestRef.current || requestedUserId !== currentUserIdRef.current) return;
      console.error('[PatientProgress][load]', error);
      setWeightData([]);
      setGlycemiaData([]);
      setPhotosData([]);
      setMeasurementsData([]);
      setClinicalRecords([]);
      setClinicalLoadError(false);
      setLoadError(true);
    } finally {
      if (requestId === loadRequestRef.current && requestedUserId === currentUserIdRef.current) {
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    loadProgressData();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [loadProgressData]);

  const handleAddWeightRecord = async (e) => {
    e.preventDefault();

    if (!newWeight || !recordDate) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos.',
        variant: 'destructive'
      });
      return;
    }

    const { error } = await supabase.from('growth_records').insert({
      patient_id: user.id,
      record_date: recordDate,
      weight: parseFloat(newWeight)
    });

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar o registro.',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Sucesso',
        description: 'Registro de peso adicionado com sucesso!'
      });
      setDialogOpen(false);
      setNewWeight('');
      setRecordDate(format(new Date(), 'yyyy-MM-dd'));
      loadProgressData();
    }
  };

  const handleAddMeasurementRecord = async (e) => {
    e.preventDefault();

    if (!newHeight || !recordDate) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios.',
        variant: 'destructive'
      });
      return;
    }

    const { error } = await supabase.from('growth_records').insert({
      patient_id: user.id,
      record_date: recordDate,
      height: parseFloat(newHeight),
      head_circumference: newHeadCircumference ? parseFloat(newHeadCircumference) : null
    });

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar o registro.',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Sucesso',
        description: 'Registro de medidas adicionado com sucesso!'
      });
      setDialogOpen(false);
      setNewHeight('');
      setNewHeadCircumference('');
      setRecordDate(format(new Date(), 'yyyy-MM-dd'));
      loadProgressData();
    }
  };

  const [newGlycemiaCondition, setNewGlycemiaCondition] = useState('fasting');

  const handleAddGlycemiaRecord = async (e) => {
    e.preventDefault();

    if (!newGlycemia || !recordDate) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos.',
        variant: 'destructive'
      });
      return;
    }

    const { error } = await supabase.from('glycemia_records').insert({
      patient_id: user.id,
      date: new Date(recordDate + 'T12:00:00').toISOString(),
      value: parseFloat(newGlycemia),
      condition: newGlycemiaCondition
    });

    if (error) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível adicionar o registro.',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Sucesso',
        description: 'Registro de glicemia adicionado com sucesso!'
      });
      setDialogOpen(false);
      setNewGlycemia('');
      setNewGlycemiaCondition('fasting');
      setRecordDate(format(new Date(), 'yyyy-MM-dd'));
      loadProgressData();
    }
  };

  const handleAddPhotoRecord = async (file, notes = '') => {
    if (!file || !recordDate) {
      toast({
        title: 'Erro',
        description: 'Selecione uma foto e uma data.',
        variant: 'destructive'
      });
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const typeOk = !file.type || allowedTypes.includes(file.type) || file.type.startsWith('image/');
    const extOk = allowedExtensions.includes(ext) || !ext;
    if (!typeOk || !extOk) {
      toast({ title: 'Erro', description: 'Use JPEG, PNG, WebP ou HEIC.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'A imagem deve ter no máximo 5MB.', variant: 'destructive' });
      return;
    }

    const safeExt = allowedExtensions.includes(ext) ? ext : (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/heic' ? 'heic' : file.type === 'image/heif' ? 'heif' : 'jpg');

    try {
      const path = `${user.id}/progress_photos/${crypto.randomUUID()}.${safeExt}`;
      const { error: uploadError } = await supabase.storage
        .from('patient-photos')
        .upload(path, file, {
          upsert: false,
          contentType: MIME_BY_EXT[safeExt] || file.type || 'application/octet-stream'
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('patient-photos')
        .getPublicUrl(path);

      const { data: inserted, error: dbError } = await supabase
        .from('progress_photos')
        .insert({
          patient_id: user.id,
          photo_url: publicUrl,
          photo_date: recordDate,
          uploaded_by: user.id,
          notes: notes?.trim() || null
        })
        .select('id')
        .single();

      if (dbError) throw dbError;

      await logActivityEvent({
        eventName: 'progress_photo.added',
        sourceModule: 'progress_photos',
        patientId: user.id,
        nutritionistId: null,
        payload: { photo_id: inserted?.id, photo_date: recordDate, uploaded_by: user.id }
      });

      toast({
        title: 'Sucesso',
        description: 'Foto de progresso adicionada com sucesso!'
      });
      setDialogOpen(false);
      setRecordDate(format(new Date(), 'yyyy-MM-dd'));
      setPhotoNotes('');
      setSelectedPhotoFile(null);
      loadProgressData();
    } catch (error) {
      console.error('[PatientProgress][upload] erro detalhado:', error);
      toast({
        title: 'Erro',
        description: error?.message || error?.error_description || error?.details || error?.hint || 'Não foi possível adicionar a foto.',
        variant: 'destructive'
      });
    }
  };

  const handleDeletePhoto = async () => {
    if (!deletePhotoTarget?.id) return;
    const photoId = deletePhotoTarget.id;
    const { error } = await deleteProgressPhoto({ photoId });
    if (error) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
      return;
    }
    await logActivityEvent({
      eventName: 'progress_photo.deleted',
      sourceModule: 'progress_photos',
      patientId: user.id,
      nutritionistId: null,
      payload: { photo_id: photoId }
    });
    toast({ title: 'Foto removida' });
    setDeletePhotoTarget(null);
    loadProgressData();
  };

  // Preparar dados de glicemia para gráfico (colunas reais: date, value, condition)
  const weightOnlyData = useMemo(() => weightData.filter((record) => record?.weight != null), [weightData]);
  const sortedWeightData = useMemo(() => sortNewestFirst(weightOnlyData, 'record_date'), [weightOnlyData]);
  const sortedGlycemiaData = useMemo(() => sortNewestFirst(glycemiaData, 'date'), [glycemiaData]);
  const sortedMeasurementsData = useMemo(() => sortNewestFirst(measurementsData, 'record_date'), [measurementsData]);
  const timeline = useMemo(() => buildProgressTimeline({
    weightRecords: weightData,
    glycemiaRecords: glycemiaData,
    photos: photosData,
    clinicalRecords,
  }), [weightData, glycemiaData, photosData, clinicalRecords]);
  const weightChartData = useMemo(() => weightOnlyData.map((record) => ({
    ...record,
    record_date: /^\d{4}-\d{2}-\d{2}$/.test(record.record_date || '') ? parseISO(record.record_date) : record.record_date,
  })), [weightOnlyData]);

  const glycemiaChartData = glycemiaData.map((record) => ({
    date: record.date ? format(new Date(record.date), 'dd/MM/yy') : '?',
    value: parseFloat(record.value || 0)
  }));

  const openDetail = (detail) => {
    setActiveTab(detail);
    setActiveDetail(detail);
  };

  const indicatorCards = [
    { id: 'peso', label: 'PESO', icon: Scale, value: sortedWeightData[0]?.weight != null ? `${Number(sortedWeightData[0].weight).toFixed(1)} kg` : 'Sem registros' },
    { id: 'glicemia', label: 'GLICEMIA', icon: Droplet, value: sortedGlycemiaData[0]?.value != null ? `${Number(sortedGlycemiaData[0].value).toFixed(0)} mg/dL` : 'Sem registros' },
    { id: 'medidas', label: 'MEDIDAS', icon: Ruler, value: sortedMeasurementsData[0]?.height != null ? `${Number(sortedMeasurementsData[0].height).toFixed(1)} cm` : 'Sem registros' },
    { id: 'fotos', label: 'FOTOS', icon: Camera, value: photosData.length ? `${photosData.length} ${photosData.length === 1 ? 'foto' : 'fotos'}` : 'Sem registros' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background [&_h1]:uppercase [&_h2]:uppercase [&_h3]:uppercase [&_h4]:uppercase">
      <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-8">
        <header className="mb-6">
          {activeDetail && (
            <Button type="button" variant="ghost" className="mb-3 -ml-3" onClick={() => setActiveDetail(null)}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> VOLTAR AO RESUMO
            </Button>
          )}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">MEU PROGRESSO</h1>
              <p className="text-muted-foreground mt-1">Acompanhe sua evolução em um só lugar</p>
            </div>
            {activeDetail && (
              <Button type="button" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                {activeTab === 'peso' && 'REGISTRAR PESO'}
                {activeTab === 'glicemia' && 'REGISTRAR GLICEMIA'}
                {activeTab === 'medidas' && 'REGISTRAR MEDIDAS'}
                {activeTab === 'fotos' && 'ADICIONAR FOTO'}
              </Button>
            )}
          </div>
        </header>

        {!loading && loadError && (
          <Card className="mb-6 border-destructive/30">
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-semibold text-foreground">NÃO FOI POSSÍVEL CARREGAR SEU PROGRESSO</p>
              <p className="text-sm text-muted-foreground">Tente novamente. Nenhum dado foi alterado.</p>
              <Button variant="outline" onClick={loadProgressData}>TENTAR NOVAMENTE</Button>
            </CardContent>
          </Card>
        )}

        {!activeDetail && !loadError && (
          <div className="space-y-6">
            <Card className="overflow-hidden border-primary/20 shadow-sm">
              <CardContent className="grid gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,0.8fr)_minmax(240px,1.2fr)] md:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">PESO ATUAL</p>
                  <p className="mt-2 text-4xl font-bold text-foreground">
                    {sortedWeightData[0]?.weight != null ? `${Number(sortedWeightData[0].weight).toFixed(1)} kg` : '—'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {sortedWeightData[0] ? `Atualizado em ${formatCivilDate(sortedWeightData[0].record_date)}` : 'Adicione seu primeiro registro para começar.'}
                  </p>
                  <Button type="button" variant="outline" className="mt-4" onClick={() => openDetail('peso')} aria-label="Ver evolução completa do peso">
                    VER EVOLUÇÃO <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <div
                  className="rounded-xl border border-primary/10 bg-primary/5 p-3"
                  role="img"
                  aria-label="Gráfico de evolução do peso com pontos por registro"
                >
                  {weightOnlyData.length > 0 ? (
                    <div className="h-32 sm:h-36">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={weightOnlyData} margin={{ top: 10, right: 10, bottom: 4, left: 10 }}>
                            <CartesianGrid vertical={false} strokeDasharray="4 4" className="stroke-border/70" />
                            <XAxis dataKey="record_date" hide />
                            <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                            <Tooltip
                              formatter={formatWeightTooltip}
                              labelFormatter={(label) => `Registro de ${formatCivilDate(label)}`}
                              separator=": "
                              cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '4 4' }}
                              contentStyle={{
                                background: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '0.75rem',
                                color: 'hsl(var(--card-foreground))',
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="weight"
                              name="Peso"
                              stroke="hsl(var(--primary))"
                              strokeWidth={3}
                              dot={{ r: 4, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                              activeDot={{ r: 6, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 3 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                    </div>
                  ) : <div className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">O GRÁFICO APARECERÁ APÓS O PRIMEIRO REGISTRO DE PESO</div>}
                </div>
              </CardContent>
            </Card>

            <section aria-labelledby="indicators-title">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="indicators-title" className="text-lg font-bold text-foreground">SEUS INDICADORES</h2>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">DETALHES SOB DEMANDA</span>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {indicatorCards.map(({ id, label, icon: Icon, value }) => (
                  <button key={id} type="button" onClick={() => openDetail(id)} aria-label={`Ver detalhes de ${label.toLowerCase()}`} className="rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <Card className="h-full transition-colors hover:border-primary/40 hover:bg-primary/[0.02]">
                      <CardContent className="p-4">
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></div>
                        <p className="text-xs font-semibold tracking-wide text-muted-foreground">{label}</p>
                        <p className="mt-1 font-bold text-foreground">{value}</p>
                      </CardContent>
                    </Card>
                  </button>
                ))}
              </div>
            </section>

            <section aria-labelledby="timeline-title">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="timeline-title" className="text-lg font-bold text-foreground">LINHA DO TEMPO</h2>
                  <p className="text-sm text-muted-foreground">Sua evolução e os conteúdos clínicos compartilhados.</p>
                </div>
                <Link to="/patient/registros-clinicos" className="inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  VER REGISTROS CLÍNICOS <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              {clinicalLoadError && (
                <Card className="mb-3 border-amber-300 bg-amber-50/70">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">REGISTROS CLÍNICOS TEMPORARIAMENTE INDISPONÍVEIS</p>
                      <p className="text-xs text-muted-foreground">Suas medições continuam disponíveis. Tente carregar novamente.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={loadProgressData}>TENTAR NOVAMENTE</Button>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="p-4 sm:p-6">
                  {timeline.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="font-semibold text-foreground">SUA LINHA DO TEMPO COMEÇA AQUI</p>
                      <p className="mt-1 text-sm text-muted-foreground">Abra um indicador para adicionar o primeiro registro.</p>
                    </div>
                  ) : (
                    <ol className="space-y-1">
                      {timeline.slice(0, 12).map((event) => {
                        const config = {
                          weight: { icon: Scale, title: 'PESO REGISTRADO', text: `${Number(event.weight).toFixed(1)} kg` },
                          measurement: { icon: Ruler, title: 'MEDIDAS CORPORAIS ATUALIZADAS', text: event.height != null ? `Altura: ${Number(event.height).toFixed(1)} cm` : 'Novas medidas registradas' },
                          anthropometry: { icon: Ruler, title: 'AVALIAÇÃO ANTROPOMÉTRICA ATUALIZADA', text: `${Number(event.weight).toFixed(1)} kg${event.height != null ? ` · ${Number(event.height).toFixed(1)} cm` : ''}` },
                          glycemia: { icon: Droplet, title: 'GLICEMIA REGISTRADA', text: `${Number(event.value).toFixed(0)} mg/dL` },
                          photo: { icon: Camera, title: 'FOTO DE PROGRESSO', text: event.notes || 'Registro visual adicionado' },
                          clinical: {
                            icon: FileText,
                            title: event.status === 'invalidated' ? 'REGISTRO CLÍNICO INVALIDADO' : 'ACOMPANHAMENTO CLÍNICO',
                            text: CLINICAL_TYPE_LABELS[event.record_type] || 'Registro clínico',
                          },
                        }[event.kind];
                        const EventIcon = config.icon;
                        return (
                          <li key={`${event.kind}-${event.id}`} className="relative flex gap-4 border-l border-border pb-5 pl-6 last:border-transparent last:pb-0">
                            <span className="absolute -left-4 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-primary"><EventIcon className="h-4 w-4" aria-hidden="true" /></span>
                            <div className="min-w-0 flex-1 rounded-xl bg-muted/40 p-3">
                              <div className="flex flex-wrap justify-between gap-2">
                                <p className="text-sm font-bold text-foreground">{config.title}</p>
                                <time className="text-xs text-muted-foreground">{formatCivilDate(event.date)}</time>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">{config.text}</p>
                              {event.kind === 'clinical' && (
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                  <p className={`text-xs font-semibold uppercase tracking-wide ${event.status === 'invalidated' ? 'text-destructive' : 'text-primary'}`}>
                                    {event.status === 'invalidated' ? 'NÃO REPRESENTA UMA ORIENTAÇÃO VIGENTE' : 'COMPARTILHADO PELO SEU NUTRICIONISTA'}
                                  </p>
                                  <Link to={`/patient/registros-clinicos?record=${encodeURIComponent(event.id)}`} className="text-xs font-semibold text-primary underline-offset-4 hover:underline">
                                    VER DETALHES
                                  </Link>
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </section>

            <PatientCheckinHistoryWidget patientId={user?.id} />
          </div>
        )}

        {activeDetail && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full [&_h2]:uppercase [&_h3]:uppercase">
          <TabsList className={`grid w-full ${isDiabetic ? 'grid-cols-4' : 'grid-cols-3'} mb-4`}>
            <TabsTrigger value="peso" className="px-1 text-[11px] uppercase sm:px-3 sm:text-xs">
              <Scale className="mr-1 hidden h-4 w-4 sm:block" />
              Peso
            </TabsTrigger>
            {isDiabetic && (
              <TabsTrigger value="glicemia" className="px-1 text-[11px] uppercase sm:px-3 sm:text-xs">
                <Droplet className="mr-1 hidden h-4 w-4 sm:block" />
                Glicemia
              </TabsTrigger>
            )}
            <TabsTrigger value="medidas" className="px-1 text-[11px] uppercase sm:px-3 sm:text-xs">
              <Ruler className="mr-1 hidden h-4 w-4 sm:block" />
              Medidas
            </TabsTrigger>
            <TabsTrigger value="fotos" className="px-1 text-[11px] uppercase sm:px-3 sm:text-xs">
              <Camera className="mr-1 hidden h-4 w-4 sm:block" />
              Fotos
            </TabsTrigger>
          </TabsList>

          {/* Aba: Peso */}
          <TabsContent value="peso" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {weightOnlyData.length > 0 ? (
                <div className="space-y-4">
                  <WeightChart data={weightChartData} goalWeight={goalWeight} />

                  {/* Recent Records List */}
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-lg">Registros Recentes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {sortedWeightData
                          .slice(0, 10)
                          .map((record) => (
                            <div
                              key={record.id || `${record.record_date}-${record.weight}`}
                              className="flex justify-between items-center p-3 bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors"
                            >
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {formatCivilDate(record.record_date)}
                                </p>
                                {record.notes && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {record.notes}
                                  </p>
                                )}
                              </div>
                              <p className="text-lg font-bold text-primary">
                                {parseFloat(record.weight).toFixed(1)} kg
                              </p>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Evolução de Peso</CardTitle>
                    <CardDescription>Nenhum registro encontrado</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12">
                      <Scale className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Use a ação REGISTRAR PESO acima para adicionar seu primeiro registro
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          </TabsContent>

          {/* Aba: Glicemia */}
          {isDiabetic && (
            <TabsContent value="glicemia" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Evolução da Glicemia</CardTitle>
                  <CardDescription>
                    Acompanhamento da glicemia ao longo do tempo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {glycemiaChartData.length > 0 ? (
                    <div className="space-y-4">
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={glycemiaChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="value"
                            name="Glicemia (mg/dL)"
                            stroke="#ef4444"
                            strokeWidth={2}
                            dot={{ fill: '#ef4444', r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>

                      {/* Recent Records List */}
                      <div className="mt-6">
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                          Registros Recentes
                        </h3>
                        <div className="space-y-2">
                          {sortedGlycemiaData
                            .slice(0, 10)
                            .map((record) => {
                              const conditionLabels = {
                                fasting: 'Jejum',
                                pre_prandial: 'Pré-refeição',
                                post_prandial: 'Pós-refeição',
                                random: 'Aleatório'
                              };
                              const glycVal = parseFloat(record.value || 0);
                              const isAlert = glycVal > 180 || glycVal < 70;
                              return (
                              <div
                                key={record.id || `${record.date}-${record.value}`}
                                className="flex justify-between items-center p-3 bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors"
                              >
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {record.date ? format(new Date(record.date), 'dd/MM/yyyy HH:mm') : '—'}
                                  </p>
                                  {record.condition && (
                                    <p className="text-xs text-muted-foreground">{conditionLabels[record.condition] || record.condition}</p>
                                  )}
                                </div>
                                <p className={`text-lg font-bold ${isAlert ? 'text-red-600' : 'text-foreground'}`}>
                                  {glycVal.toFixed(0)} mg/dL
                                  {isAlert && ' ⚠️'}
                                </p>
                              </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Droplet className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Nenhum registro de glicemia encontrado
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Use a ação REGISTRAR GLICEMIA acima para adicionar seu primeiro registro
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
          )}

          {/* Aba: Medidas */}
          <TabsContent value="medidas" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Medidas Corporais</CardTitle>
                  <CardDescription>Histórico de medidas antropométricas</CardDescription>
                </CardHeader>
                <CardContent>
                  {measurementsData.length > 0 ? (
                    <div className="space-y-4">
                      {/* Chart for Height evolution */}
                      {measurementsData.filter(r => r.height).length > 0 && (
                        <div className="mb-6">
                          <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                            Evolução da Altura
                          </h3>
                          <ResponsiveContainer width="100%" height={250}>
                            <LineChart
                              data={measurementsData
                                .filter(r => r.height)
                                .map((record) => ({
                                  date: formatCivilDate(record.record_date, 'dd/MM/yy'),
                                  height: parseFloat(record.height)
                                }))}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                              <YAxis tick={{ fontSize: 12 }} />
                              <Tooltip />
                              <Line
                                type="monotone"
                                dataKey="height"
                                name="Altura (cm)"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                dot={{ fill: '#3b82f6', r: 4 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {/* History List */}
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                          Histórico Completo
                        </h3>
                        {sortedMeasurementsData
                          .map((record) => (
                            <div
                              key={record.id || `${record.record_date}-${record.height}`}
                              className="flex justify-between items-center p-4 bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors"
                            >
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-foreground">
                                  {formatCivilDate(record.record_date)}
                                </p>
                                <div className="flex flex-wrap gap-3 mt-1">
                                  {record.weight && (
                                    <p className="text-xs text-muted-foreground">
                                      <span className="font-medium">Peso:</span> {parseFloat(record.weight).toFixed(1)} kg
                                    </p>
                                  )}
                                  {record.height && (
                                    <p className="text-xs text-muted-foreground">
                                      <span className="font-medium">Altura:</span> {parseFloat(record.height).toFixed(1)} cm
                                    </p>
                                  )}
                                  {record.head_circumference && (
                                    <p className="text-xs text-muted-foreground">
                                      <span className="font-medium">PC:</span> {parseFloat(record.head_circumference).toFixed(1)} cm
                                    </p>
                                  )}
                                  {record.weight && record.height && (
                                    <p className="text-xs text-muted-foreground">
                                      <span className="font-medium">IMC:</span>{' '}
                                      {(parseFloat(record.weight) / Math.pow(parseFloat(record.height) / 100, 2)).toFixed(1)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Ruler className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Nenhuma medida registrada
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Use a ação REGISTRAR MEDIDAS acima para adicionar seu primeiro registro
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* Aba: Fotos */}
          <TabsContent value="fotos" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {photosData.length >= 2 && (
                <Card className="shadow-sm mb-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Antes e Depois</CardTitle>
                    <CardDescription>Sua primeira e última foto do período</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        className="overflow-hidden rounded-lg border border-border text-left transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setLightboxPhoto(photosData[photosData.length - 1])}
                        aria-label={`Ampliar foto inicial de ${formatCivilDate(photosData[photosData.length - 1].photo_date)}`}
                      >
                        <img
                          src={photosData[photosData.length - 1].photo_url}
                          alt="Antes"
                          className="aspect-[3/4] w-full object-cover"
                        />
                        <div className="bg-muted px-2 py-1.5 text-center">
                          <span className="text-xs font-semibold">Antes</span>
                          <p className="text-[10px] text-muted-foreground">
                            {formatCivilDate(photosData[photosData.length - 1].photo_date)}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="overflow-hidden rounded-lg border border-border text-left transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setLightboxPhoto(photosData[0])}
                        aria-label={`Ampliar foto mais recente de ${formatCivilDate(photosData[0].photo_date)}`}
                      >
                        <img
                          src={photosData[0].photo_url}
                          alt="Depois"
                          className="aspect-[3/4] w-full object-cover"
                        />
                        <div className="bg-muted px-2 py-1.5 text-center">
                          <span className="text-xs font-semibold">Depois</span>
                          <p className="text-[10px] text-muted-foreground">
                            {formatCivilDate(photosData[0].photo_date)}
                          </p>
                        </div>
                      </button>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Fotos de Progresso</CardTitle>
                  <CardDescription>Registros visuais da evolução. Clique para ampliar.</CardDescription>
                </CardHeader>
                <CardContent>
                  {photosData.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {photosData.map((photo) => (
                        <div
                          key={photo.id}
                          className="relative aspect-square rounded-lg overflow-hidden bg-muted border border-border hover:shadow-md transition-shadow group"
                        >
                          <button
                            type="button"
                            className="absolute inset-0 w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            onClick={() => setLightboxPhoto(photo)}
                            aria-label={`Ampliar foto de ${formatCivilDate(photo.photo_date)}`}
                          >
                            <img src={photo.photo_url} alt="" className="h-full w-full object-cover" />
                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                              <span className="block text-xs font-medium text-white">{formatCivilDate(photo.photo_date)}</span>
                              {photo.notes && <span className="mt-0.5 block truncate text-[10px] text-white/90">{photo.notes}</span>}
                            </span>
                          </button>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute right-2 top-2 z-10 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                            onClick={(e) => { e.stopPropagation(); setDeletePhotoTarget(photo); }}
                            aria-label={`Remover foto de ${formatCivilDate(photo.photo_date)}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Camera className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Nenhuma foto de progresso
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Use a ação ADICIONAR FOTO acima para incluir sua primeira imagem
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="uppercase">
              {activeTab === 'peso' && 'Registrar Peso'}
              {activeTab === 'glicemia' && 'Registrar Glicemia'}
              {activeTab === 'medidas' && 'Registrar Medidas'}
              {activeTab === 'fotos' && 'Adicionar Foto de Progresso'}
            </DialogTitle>
            <DialogDescription>
              {activeTab === 'peso' && 'Adicione um novo registro de peso'}
              {activeTab === 'glicemia' && 'Adicione um novo registro de glicemia'}
              {activeTab === 'medidas' && 'Adicione um novo registro de medidas corporais'}
              {activeTab === 'fotos' && 'Adicione uma nova foto de progresso'}
            </DialogDescription>
          </DialogHeader>

          {/* Form: Weight */}
          {activeTab === 'peso' && (
            <form onSubmit={handleAddWeightRecord} className="space-y-4">
              <div>
                <Label htmlFor="date">Data</Label>
                <DateInputWithCalendar
                  id="date"
                  value={recordDate}
                  onChange={(value) => setRecordDate(value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="weight">Peso (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.1"
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                  placeholder="Ex: 75.5"
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit">Adicionar</Button>
              </DialogFooter>
            </form>
          )}

          {/* Form: Glycemia */}
          {activeTab === 'glicemia' && (
            <form onSubmit={handleAddGlycemiaRecord} className="space-y-4">
              <div>
                <Label htmlFor="date">Data</Label>
                <DateInputWithCalendar
                  id="date"
                  value={recordDate}
                  onChange={(value) => setRecordDate(value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="glycemia-condition">Momento da medição</Label>
                <select
                  id="glycemia-condition"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={newGlycemiaCondition}
                  onChange={(e) => setNewGlycemiaCondition(e.target.value)}
                >
                  <option value="fasting">Em jejum</option>
                  <option value="pre_prandial">Antes da refeição</option>
                  <option value="post_prandial">Após a refeição</option>
                  <option value="random">Aleatório</option>
                </select>
              </div>
              <div>
                <Label htmlFor="glycemia">Glicemia (mg/dL)</Label>
                <Input
                  id="glycemia"
                  type="number"
                  step="1"
                  value={newGlycemia}
                  onChange={(e) => setNewGlycemia(e.target.value)}
                  placeholder="Ex: 95"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">⚠️ Valores fora de 70–180 mg/dL serão marcados como alerta</p>
              <DialogFooter>
                <Button type="submit">Adicionar</Button>
              </DialogFooter>
            </form>
          )}

          {/* Form: Measurements */}
          {activeTab === 'medidas' && (
            <form onSubmit={handleAddMeasurementRecord} className="space-y-4">
              <div>
                <Label htmlFor="date">Data</Label>
                <DateInputWithCalendar
                  id="date"
                  value={recordDate}
                  onChange={(value) => setRecordDate(value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="height">Altura (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  step="0.1"
                  value={newHeight}
                  onChange={(e) => setNewHeight(e.target.value)}
                  placeholder="Ex: 170"
                  required
                />
              </div>
              <div>
                <Label htmlFor="headCircumference">Perímetro Cefálico (cm) - Opcional</Label>
                <Input
                  id="headCircumference"
                  type="number"
                  step="0.1"
                  value={newHeadCircumference}
                  onChange={(e) => setNewHeadCircumference(e.target.value)}
                  placeholder="Ex: 55"
                />
              </div>
              <DialogFooter>
                <Button type="submit">Adicionar</Button>
              </DialogFooter>
            </form>
          )}

          {/* Form: Photos */}
          {activeTab === 'fotos' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (selectedPhotoFile) {
                  handleAddPhotoRecord(selectedPhotoFile, photoNotes);
                }
              }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="date">Data</Label>
                <DateInputWithCalendar
                  id="date"
                  value={recordDate}
                  onChange={(value) => setRecordDate(value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="photoFile">Foto</Label>
                <Input
                  id="photoFile"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/webp"
                  className="hidden"
                  onChange={(e) => setSelectedPhotoFile(e.target.files?.[0] || null)}
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => document.getElementById('photoFile')?.click()}>
                    Escolher arquivo
                  </Button>
                  <span className="text-sm text-muted-foreground truncate">
                    {selectedPhotoFile?.name || 'Nenhum arquivo selecionado'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, WebP, HEIC/HEIF (iOS/Android)</p>
              </div>
              <div>
                <Label htmlFor="photoNotes">Legenda (opcional)</Label>
                <Textarea
                  id="photoNotes"
                  placeholder="Ex: Peso 78 kg, início da dieta"
                  value={photoNotes}
                  onChange={(e) => setPhotoNotes(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={!selectedPhotoFile}>Adicionar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox foto */}
      <Dialog open={!!lightboxPhoto} onOpenChange={(open) => !open && setLightboxPhoto(null)}>
        <DialogContent className="max-w-4xl w-[95vw] p-2">
          {lightboxPhoto && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 z-10 bg-background/80"
                onClick={() => setLightboxPhoto(null)}
                aria-label="Fechar foto ampliada"
              >
                <X className="w-5 h-5" />
              </Button>
              <img
                src={lightboxPhoto.photo_url}
                alt={`Foto de progresso de ${formatCivilDate(lightboxPhoto.photo_date)}`}
                className="w-full max-h-[85vh] object-contain rounded-lg"
              />
              <div className="text-center py-2">
                <p className="font-medium">{formatCivilDate(lightboxPhoto.photo_date)}</p>
                {lightboxPhoto.notes && (
                  <p className="text-sm text-muted-foreground mt-1">{lightboxPhoto.notes}</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar remoção de foto */}
      <AlertDialog open={!!deletePhotoTarget} onOpenChange={(open) => !open && setDeletePhotoTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta foto?</AlertDialogTitle>
            <AlertDialogDescription>
              A foto será removida do seu progresso. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePhoto} className="bg-destructive text-destructive-foreground">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      )}
    </div>
  );
}
