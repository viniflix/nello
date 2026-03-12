import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Plus, Camera, Ruler, Droplet, Scale, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
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
import WeightChart from '@/components/anthropometry/WeightChart';
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
  const { toast } = useToast();
  const isDiabetic = user?.profile?.preferences?.is_diabetic === true;
  const [activeTab, setActiveTab] = useState('peso');
  const [weightData, setWeightData] = useState([]);
  const [glycemiaData, setGlycemiaData] = useState([]);
  const [measurementsData, setMeasurementsData] = useState([]);
  const [photosData, setPhotosData] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const loadProgressData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // 1. Buscar registros de peso (growth_records)
    const { data: weightRecords } = await supabase
      .from('growth_records')
      .select('*')
      .eq('patient_id', user.id)
      .order('record_date', { ascending: true });

    setWeightData(weightRecords || []);

    // 2. Meta de peso - por enquanto null (precisa ser adicionada ao growth_records ou meal_plans)
    setGoalWeight(null);

    // 3. Glicemia - tentar buscar apenas se for diabético
    if (user?.profile?.preferences?.is_diabetic) {
      try {
        const { data: glycemiaRecords } = await supabase
          .from('glycemia_records')
          .select('*')
          .eq('patient_id', user.id)
          .order('record_date', { ascending: true });
        setGlycemiaData(glycemiaRecords || []);
      } catch (error) {
        // Tabela não existe ainda
        setGlycemiaData([]);
      }
    } else {
      setGlycemiaData([]);
    }

    // 4. Fotos de progresso (progress_photos)
    try {
      const { data: photoRecords } = await supabase
        .from('progress_photos')
        .select('*')
        .eq('patient_id', user.id)
        .order('photo_date', { ascending: false })
        .limit(50);
      setPhotosData(photoRecords || []);
    } catch (error) {
      setPhotosData([]);
    }

    // 5. Medidas (usando growth_records com height, head_circumference, etc)
    setMeasurementsData(weightRecords || []);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadProgressData();
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

    try {
      const { error } = await supabase.from('glycemia_records').insert({
        patient_id: user.id,
        record_date: recordDate,
        glycemia_value: parseFloat(newGlycemia)
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Sucesso',
        description: 'Registro de glicemia adicionado com sucesso!'
      });
      setDialogOpen(false);
      setNewGlycemia('');
      setRecordDate(format(new Date(), 'yyyy-MM-dd'));
      loadProgressData();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar o registro. A tabela pode não estar disponível ainda.',
        variant: 'destructive'
      });
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

  // Preparar dados de glicemia para gráfico
  const glycemiaChartData = glycemiaData.map((record) => ({
    date: format(new Date(record.record_date), 'dd/MM/yy'),
    value: parseFloat(record.glycemia_value)
  }));

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Meu Progresso</h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe sua evolução
          </p>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`grid w-full ${isDiabetic ? 'grid-cols-4' : 'grid-cols-3'} mb-4`}>
            <TabsTrigger value="peso" className="text-xs">
              <Scale className="w-4 h-4 mr-1" />
              Peso
            </TabsTrigger>
            {isDiabetic && (
              <TabsTrigger value="glicemia" className="text-xs">
                <Droplet className="w-4 h-4 mr-1" />
                Glicemia
              </TabsTrigger>
            )}
            <TabsTrigger value="medidas" className="text-xs">
              <Ruler className="w-4 h-4 mr-1" />
              Medidas
            </TabsTrigger>
            <TabsTrigger value="fotos" className="text-xs">
              <Camera className="w-4 h-4 mr-1" />
              Fotos
            </TabsTrigger>
          </TabsList>

          {/* Aba: Peso */}
          <TabsContent value="peso" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {weightData.length > 0 ? (
                <div className="space-y-4">
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle>Evolução de Peso</CardTitle>
                      <CardDescription>Acompanhe sua evolução ao longo do tempo</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <WeightChart data={weightData} goalWeight={goalWeight} />
                    </CardContent>
                  </Card>

                  {/* Recent Records List */}
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-lg">Registros Recentes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {weightData
                          .sort((a, b) => new Date(b.record_date) - new Date(a.record_date))
                          .slice(0, 10)
                          .map((record, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between items-center p-3 bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors"
                            >
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {format(new Date(record.record_date), 'dd/MM/yyyy')}
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
                        Adicione seu primeiro registro de peso usando o botão +
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
                          {glycemiaData
                            .sort((a, b) => new Date(b.record_date) - new Date(a.record_date))
                            .slice(0, 10)
                            .map((record, idx) => (
                              <div
                                key={idx}
                                className="flex justify-between items-center p-3 bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors"
                              >
                                <p className="text-sm font-semibold text-foreground">
                                  {format(new Date(record.record_date), 'dd/MM/yyyy')}
                                </p>
                                <p className="text-lg font-bold text-red-600">
                                  {parseFloat(record.glycemia_value).toFixed(0)} mg/dL
                                </p>
                              </div>
                            ))}
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
                        Use o botão + para adicionar seu primeiro registro
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
                                  date: format(new Date(record.record_date), 'dd/MM/yy'),
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
                        {measurementsData
                          .sort((a, b) => new Date(b.record_date) - new Date(a.record_date))
                          .map((record, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between items-center p-4 bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors"
                            >
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-foreground">
                                  {format(new Date(record.record_date), 'dd/MM/yyyy')}
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
                        Use o botão + para adicionar seu primeiro registro
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
                      <div
                        className="rounded-lg overflow-hidden border border-border aspect-[3/4] cursor-pointer hover:opacity-95 transition-opacity"
                        onClick={() => setLightboxPhoto(photosData[photosData.length - 1])}
                      >
                        <img
                          src={photosData[photosData.length - 1].photo_url}
                          alt="Antes"
                          className="w-full h-full object-cover"
                        />
                        <div className="bg-muted px-2 py-1.5 text-center">
                          <span className="text-xs font-semibold">Antes</span>
                          <p className="text-[10px] text-muted-foreground">
                            {format(new Date(photosData[photosData.length - 1].photo_date), 'dd/MM/yyyy')}
                          </p>
                        </div>
                      </div>
                      <div
                        className="rounded-lg overflow-hidden border border-border aspect-[3/4] cursor-pointer hover:opacity-95 transition-opacity"
                        onClick={() => setLightboxPhoto(photosData[0])}
                      >
                        <img
                          src={photosData[0].photo_url}
                          alt="Depois"
                          className="w-full h-full object-cover"
                        />
                        <div className="bg-muted px-2 py-1.5 text-center">
                          <span className="text-xs font-semibold">Depois</span>
                          <p className="text-[10px] text-muted-foreground">
                            {format(new Date(photosData[0].photo_date), 'dd/MM/yyyy')}
                          </p>
                        </div>
                      </div>
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
                          <img
                            src={photo.photo_url}
                            alt={format(new Date(photo.photo_date), 'dd/MM/yyyy')}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setLightboxPhoto(photo)}
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                            <p className="text-xs text-white font-medium">
                              {format(new Date(photo.photo_date), 'dd/MM/yyyy')}
                            </p>
                            {photo.notes && (
                              <p className="text-[10px] text-white/90 truncate mt-0.5">{photo.notes}</p>
                            )}
                          </div>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); setDeletePhotoTarget(photo); }}
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
                        Use o botão + para adicionar sua primeira foto
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>

      {/* FAB - Floating Action Button - Dynamic based on activeTab */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button
            size="lg"
            className="fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg z-40 bg-primary hover:bg-primary/90 text-white md:bottom-24"
          >
            <Plus className="h-6 w-6 text-white" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
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
              >
                <X className="w-5 h-5" />
              </Button>
              <img
                src={lightboxPhoto.photo_url}
                alt={format(new Date(lightboxPhoto.photo_date), 'dd/MM/yyyy')}
                className="w-full max-h-[85vh] object-contain rounded-lg"
              />
              <div className="text-center py-2">
                <p className="font-medium">{format(new Date(lightboxPhoto.photo_date), "dd/MM/yyyy")}</p>
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
