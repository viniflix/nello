import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Plus, Camera, Ruler, Droplet, Scale } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
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
  const [newGlycemia, setNewGlycemia] = useState('');
  const [recordDate, setRecordDate] = useState(format(new Date(), 'yyyy-MM-dd'));

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

    // 3. Glicemia - tabela não existe ainda
    setGlycemiaData([]);

    // 4. Fotos de progresso - tabela não existe ainda
    setPhotosData([]);

    // 5. Medidas (usando growth_records para IMC, etc)
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
      record_date: recordDate,
      glycemia_value: parseFloat(newGlycemia)
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
        description: 'Registro de glicemia adicionado com sucesso!'
      });
      setDialogOpen(false);
      setNewGlycemia('');
      setRecordDate(format(new Date(), 'yyyy-MM-dd'));
      loadProgressData();
    }
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
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="peso" className="text-xs">
              <Scale className="w-4 h-4 mr-1" />
              Peso
            </TabsTrigger>
            <TabsTrigger value="glicemia" className="text-xs">
              <Droplet className="w-4 h-4 mr-1" />
              Glicemia
            </TabsTrigger>
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
                <WeightChart data={weightData} goalWeight={goalWeight} />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Evolução de Peso</CardTitle>
                    <CardDescription>Nenhum registro encontrado</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12">
                      <Scale className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Adicione seu primeiro registro de peso usando o botão abaixo
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          </TabsContent>

          {/* Aba: Glicemia */}
          <TabsContent value="glicemia" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Evolução da Glicemia</CardTitle>
                  <CardDescription>
                    Acompanhamento da glicemia ao longo do tempo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {glycemiaChartData.length > 0 ? (
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
                  ) : (
                    <div className="text-center py-12">
                      <Droplet className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Nenhum registro de glicemia encontrado
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* Aba: Medidas */}
          <TabsContent value="medidas" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Medidas Corporais</CardTitle>
                  <CardDescription>Histórico de medidas</CardDescription>
                </CardHeader>
                <CardContent>
                  {measurementsData.length > 0 ? (
                    <div className="space-y-3">
                      {measurementsData.slice(0, 5).map((record, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center p-3 bg-muted/50 rounded-lg"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {format(new Date(record.record_date), 'dd/MM/yyyy')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Peso: {record.weight} kg
                              {record.height && ` | Altura: ${record.height} cm`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Ruler className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Nenhuma medida registrada
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
              <Card>
                <CardHeader>
                  <CardTitle>Fotos de Progresso</CardTitle>
                  <CardDescription>Registros visuais da evolução</CardDescription>
                </CardHeader>
                <CardContent>
                  {photosData.length > 0 ? (
                    <div className="grid grid-cols-2 gap-4">
                      {photosData.map((photo, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square rounded-lg overflow-hidden bg-muted"
                        >
                          <img
                            src={photo.photo_url}
                            alt={`Progresso ${format(
                              new Date(photo.photo_date),
                              'dd/MM/yyyy'
                            )}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2">
                            <p className="text-xs text-white font-medium">
                              {format(new Date(photo.photo_date), 'dd/MM/yyyy')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Camera className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Nenhuma foto de progresso
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>

      {/* FAB - Floating Action Button */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button
            size="lg"
            className="fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg z-40 bg-primary hover:bg-primary/90 text-white"
          >
            <Plus className="h-6 w-6 text-white" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Progresso</DialogTitle>
            <DialogDescription>
              {activeTab === 'peso' && 'Adicione um novo registro de peso'}
              {activeTab === 'glicemia' && 'Adicione um novo registro de glicemia'}
            </DialogDescription>
          </DialogHeader>

          {activeTab === 'peso' && (
            <form onSubmit={handleAddWeightRecord} className="space-y-4">
              <div>
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
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

          {activeTab === 'glicemia' && (
            <form onSubmit={handleAddGlycemiaRecord} className="space-y-4">
              <div>
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
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
        </DialogContent>
      </Dialog>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      )}
    </div>
  );
}
