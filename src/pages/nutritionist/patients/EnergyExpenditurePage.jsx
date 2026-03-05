import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { ArrowLeft, Calculator, Save, Loader2, Target, TrendingUp, Database, User, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { ProtocolComparisonTable } from '@/components/energy';
import ActivityLevelSelector from '@/components/energy/ActivityLevelSelector';
import WeightProjectionCard from '@/components/energy/WeightProjectionCard';
import MetsActivitiesForm from '@/components/energy/MetsActivitiesForm';
import EnergyExpenditureResultsPanel from '@/components/energy/EnergyExpenditureResultsPanel';
import { Checkbox } from '@/components/ui/checkbox';
import {
  getLatestAnamnesisForEnergy,
  getActiveGoalForEnergy,
  logActivityEvent
} from '@/lib/supabase/patient-queries';
import { getPatientModuleSyncFlags, clearPatientModuleSyncFlags } from '@/lib/supabase/anthropometry-queries';
import {
  getInitialBiometryForEnergy,
  getLatestEnergyCalculation,
  saveEnergyCalculation
} from '@/lib/supabase/energy-queries';
import {
  calculateAllProtocols,
  calculateGET,
  sumMetsActivitiesKcal,
  sumMetsActivitiesAverageDaily,
  calculateVentaAdjustment,
  applyVentaToGet,
  calculateEerIom,
  activityFactorToEerPa,
  calculateETA
} from '@/lib/utils/energy-calculations';

const TMB_PROTOCOLS = [
  { id: 'mifflin', label: 'Mifflin-St Jeor' },
  { id: 'harris', label: 'Harris-Benedict (1984)' },
  { id: 'fao', label: 'FAO/WHO' },
  { id: 'fao_1985', label: 'FAO/OMS 1985' },
  { id: 'fao_2001', label: 'FAO/OMS 2001' },
  { id: 'eer_iom', label: 'EER/IOM (2005)' },
  { id: 'cunningham', label: 'Cunningham (Massa Magra)' },
  { id: 'tinsley', label: 'Tinsley (Atletas)' }
];

export default function EnergyExpenditurePage() {
  const { patientId, loading: resolveLoading, error: resolveError } = useResolvedPatientId();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patientName, setPatientName] = useState('');

  // Biometria (M/F para gender)
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [leanMass, setLeanMass] = useState('');
  const [dataSource, setDataSource] = useState({ weight: null, height: null, leanMass: null });

  const [activityFactor, setActivityFactor] = useState(1.55);
  const [injuryFactor, setInjuryFactor] = useState(1.0);
  const [metsActivities, setMetsActivities] = useState([]);
  const [selectedProtocol, setSelectedProtocol] = useState('mifflin');
  const [ventaTargetWeight, setVentaTargetWeight] = useState('');
  const [ventaTimeframeDays, setVentaTimeframeDays] = useState('');
  const [etaEnabled, setEtaEnabled] = useState(false);

  const [suggestedActivity, setSuggestedActivity] = useState(null);
  const [suggestedGoal, setSuggestedGoal] = useState(null);
  const [goalSuggestionSource, setGoalSuggestionSource] = useState(null);
  const [syncFlags, setSyncFlags] = useState(null);

  const [protocols, setProtocols] = useState([]);
  const [selectedProtocolData, setSelectedProtocolData] = useState(null);

  // Carregar paciente + biometria inicial + último cálculo
  useEffect(() => {
    if (resolveLoading) return;
    if (!patientId) {
      setLoading(false);
      return;
    }
    loadPatientData();
  }, [patientId, resolveLoading]);

  // Recalcular protocolos quando biometria mudar
  useEffect(() => {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    const a = parseInt(age, 10);
    const g = gender;
    const lm = leanMass ? parseFloat(leanMass) : null;
    if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(a) || !g) {
      setProtocols([]);
      setSelectedProtocolData(null);
      return;
    }
    const data = { weight: w, height: h, age: a, gender: g, leanMass: lm };
    const calculated = calculateAllProtocols(data);
    setProtocols(calculated);
    const current = calculated.find((p) => p.id === selectedProtocol);
    if (current) setSelectedProtocolData(current);
    else if (calculated.length) {
      const rec = calculated.find((p) => p.recommended) || calculated[0];
      setSelectedProtocol(rec.id);
      setSelectedProtocolData(rec);
    }
  }, [weight, height, age, gender, leanMass, selectedProtocol]);

  const weightNum = parseFloat(weight) || 0;
  const heightNum = parseFloat(height) || 0;
  const ageNum = parseInt(age, 10) || 0;
  const tmbResult = selectedProtocolData?.bmr ?? null;
  const isEer = selectedProtocolData?.isEer === true;

  const getBase = useMemo(() => {
    if (isEer && selectedProtocolData?.get != null) {
      const pa = activityFactorToEerPa(activityFactor, gender);
      return calculateEerIom(weightNum, heightNum, ageNum, pa, gender);
    }
    const bmr = tmbResult ?? 0;
    return calculateGET(bmr, activityFactor, injuryFactor);
  }, [isEer, selectedProtocolData?.get, tmbResult, weightNum, heightNum, ageNum, activityFactor, injuryFactor, gender]);

  const hasFrequency = metsActivities.some((a) => a.frequency_type != null);
  const { totalAverageDailyKcal: metsAverageDaily } = useMemo(
    () => (hasFrequency ? sumMetsActivitiesAverageDaily(metsActivities, weightNum) : { totalAverageDailyKcal: 0 }),
    [metsActivities, weightNum, hasFrequency]
  );
  const { totalKcal: metsTotalKcalLegacy } = useMemo(
    () => (hasFrequency ? { totalKcal: 0 } : sumMetsActivitiesKcal(metsActivities, weightNum)),
    [metsActivities, weightNum, hasFrequency]
  );
  const metsTotalKcal = hasFrequency ? metsAverageDaily : metsTotalKcalLegacy;

  const etaKcal = useMemo(
    () => (etaEnabled && tmbResult != null && tmbResult > 0 ? calculateETA(tmbResult) : 0),
    [etaEnabled, tmbResult]
  );
  const getResult = getBase + metsTotalKcal + etaKcal;

  const ventaAdjustment = useMemo(() => {
    const tw = parseFloat(ventaTargetWeight);
    const days = parseInt(ventaTimeframeDays, 10);
    if (!Number.isFinite(weightNum) || !Number.isFinite(tw) || !Number.isFinite(days) || days <= 0)
      return null;
    return calculateVentaAdjustment(weightNum, tw, days);
  }, [weightNum, ventaTargetWeight, ventaTimeframeDays]);

  const ventaAdjustmentKcal = ventaAdjustment?.dailyAdjustmentKcal ?? null;
  const finalPlannedKcal = useMemo(() => {
    if (ventaAdjustmentKcal != null) return applyVentaToGet(getResult, ventaAdjustmentKcal);
    return getResult;
  }, [getResult, ventaAdjustmentKcal]);

  async function loadPatientData() {
    if (!patientId) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('id', patientId)
        .single();
      setPatientName(profile?.name || 'Paciente');

      const { data: biometry } = await getInitialBiometryForEnergy(patientId);
      if (biometry) {
        if (biometry.weight != null) setWeight(String(biometry.weight));
        if (biometry.height != null) setHeight(String(biometry.height));
        if (biometry.age != null) setAge(String(biometry.age));
        if (biometry.gender) setGender(biometry.gender);
        if (biometry.body_fat_percentage != null) setBodyFatPct(String(biometry.body_fat_percentage));
        if (biometry.lean_mass_kg != null) setLeanMass(String(biometry.lean_mass_kg));
        setDataSource({
          weight: biometry.weight != null ? 'anthropometry' : null,
          height: biometry.height != null ? 'anthropometry' : null,
          leanMass: biometry.lean_mass_kg != null ? 'anthropometry' : null
        });
      }

      const [anamnesisResult, goalResult] = await Promise.all([
        getLatestAnamnesisForEnergy(patientId),
        getActiveGoalForEnergy(patientId)
      ]);

      if (anamnesisResult?.data?.exerciseFrequency) {
        const freq = String(anamnesisResult.data.exerciseFrequency).toLowerCase();
        if (freq.includes('sedent') || freq.includes('não') || freq.includes('nao') || freq === '0') {
          setActivityFactor(1.2);
          setSuggestedActivity('Sedentário (anamnese)');
        } else if (freq.includes('1-3') || freq.includes('leve')) {
          setActivityFactor(1.375);
          setSuggestedActivity('Levemente Ativo (anamnese)');
        } else if (freq.includes('3-5') || freq.includes('moder')) {
          setActivityFactor(1.55);
          setSuggestedActivity('Moderadamente Ativo (anamnese)');
        } else if (freq.includes('6-7') || freq.includes('muito')) {
          setActivityFactor(1.725);
          setSuggestedActivity('Muito Ativo (anamnese)');
        } else if (freq.includes('2x') || freq.includes('extremo')) {
          setActivityFactor(1.9);
          setSuggestedActivity('Extremamente Ativo (anamnese)');
        }
      }

      if (goalResult?.data) {
        const gt = (goalResult.data.goal_type || goalResult.data.type || '').toLowerCase();
        if (gt.includes('weight_loss') || gt.includes('perda') || gt.includes('emagrecimento')) {
          setSuggestedGoal('Perda de Peso');
          setGoalSuggestionSource('goal');
        } else if (gt.includes('hypertrophy') || gt.includes('ganho')) {
          setSuggestedGoal('Hipertrofia');
          setGoalSuggestionSource('goal');
        } else if (gt.includes('maintenance') || gt.includes('manutencao')) {
          setSuggestedGoal('Manutenção');
          setGoalSuggestionSource('goal');
        }
      }

      const { data: saved } = await getLatestEnergyCalculation(patientId);
      if (saved) {
        if (saved.tmb_protocol) setSelectedProtocol(saved.tmb_protocol);
        if (saved.activity_factor != null) setActivityFactor(Number(saved.activity_factor));
        if (saved.injury_factor != null) setInjuryFactor(Number(saved.injury_factor));
        if (Array.isArray(saved.mets_activities) && saved.mets_activities.length)
          setMetsActivities(saved.mets_activities);
        if (saved.venta_target_weight != null) setVentaTargetWeight(String(saved.venta_target_weight));
        if (saved.venta_timeframe_days != null) setVentaTimeframeDays(String(saved.venta_timeframe_days));
      }

      const { data: flags } = await getPatientModuleSyncFlags(patientId);
      setSyncFlags(flags || null);
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro', description: 'Não foi possível carregar os dados do paciente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async () => {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    const a = parseInt(age, 10);
    if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(a) || !gender) {
      toast({ title: 'Dados incompletos', description: 'Preencha peso, altura, idade e sexo.', variant: 'destructive' });
      return;
    }
    if (!selectedProtocolData) {
      toast({ title: 'Selecione um protocolo TMB', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        patient_id: patientId,
        nutritionist_id: user?.id || null,
        height: h,
        weight: w,
        age: a,
        gender: gender,
        body_fat_percentage: bodyFatPct ? parseFloat(bodyFatPct) : null,
        tmb_protocol: selectedProtocol,
        tmb_result: selectedProtocolData?.bmr ?? null,
        activity_factor: activityFactor,
        injury_factor: injuryFactor,
        mets_activities: metsActivities.map((a) => {
          const hasFreq = a.frequency_type != null;
          const { items: [item] = [] } = hasFreq
            ? sumMetsActivitiesAverageDaily([a], w)
            : sumMetsActivitiesKcal([a], w);
          return {
            id: a.id,
            name: a.name,
            met: Number(a.met),
            duration_min: Number(a.duration_min),
            frequency_value: a.frequency_value != null ? Number(a.frequency_value) : undefined,
            frequency_type: a.frequency_type,
            kcal_per_session: item?.kcal_per_session ?? item?.kcal,
            average_daily_kcal: item?.average_daily_kcal ?? item?.kcal
          };
        }),
        get_result: getResult,
        venta_target_weight: ventaTargetWeight ? parseFloat(ventaTargetWeight) : null,
        venta_timeframe_days: ventaTimeframeDays ? parseInt(ventaTimeframeDays, 10) : null,
        venta_adjustment_kcal: ventaAdjustmentKcal,
        final_planned_kcal: finalPlannedKcal
      };
      const { data, error } = await saveEnergyCalculation(payload);
      if (error) throw error;

      await logActivityEvent({
        eventName: 'energy.calculation.updated',
        sourceModule: 'energy',
        patientId,
        payload: { tmb_protocol: payload.tmb_protocol, final_planned_kcal: payload.final_planned_kcal }
      });
      await clearPatientModuleSyncFlags(patientId, { energy: true });
      setSyncFlags((prev) => (prev ? { ...prev, needs_energy_recalc: false } : null));

      toast({ title: 'Salvo!', description: 'Planejamento energético salvo com sucesso.' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro', description: 'Não foi possível salvar o cálculo.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const formatSyncTime = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'atualizado agora';
    if (diff < 3600000) return `atualizado há ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `atualizado há ${Math.floor(diff / 3600000)}h`;
    return d.toLocaleString('pt-BR');
  };

  const getDataSourceBadge = (field) => {
    const src = dataSource[field];
    if (src === 'anthropometry') return <Badge variant="secondary" className="text-xs ml-2"><Database className="w-3 h-3 mr-1" />Auto</Badge>;
    if (src === 'profile') return <Badge variant="outline" className="text-xs ml-2"><User className="w-3 h-3 mr-1" />Perfil</Badge>;
    return null;
  };

  const patientData = useMemo(
    () => ({
      weight: weightNum,
      height: parseFloat(height) || 0,
      age: parseInt(age, 10) || 0,
      gender: gender || '',
      leanMass: leanMass ? parseFloat(leanMass) : null
    }),
    [weight, height, age, gender, leanMass, weightNum]
  );

  if (resolveLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!patientId || resolveError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{resolveError?.message || 'Paciente não encontrado.'}</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 min-w-0">
        <div className="flex items-center gap-2 md:gap-4 mb-6 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold break-words">Gastos Energéticos</h1>
            <p className="text-muted-foreground text-sm md:text-base truncate">{patientName} — Análise e planejamento</p>
          </div>
        </div>

        {syncFlags?.needs_energy_recalc && (
          <Alert className="mb-6 border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p>Antropometria atualizada. Recomendamos revisar o GET e salvar.</p>
                  {syncFlags?.anthropometry_updated_at && <p className="mt-1 text-xs text-amber-700/90">{formatSyncTime(syncFlags.anthropometry_updated_at)}</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="border-amber-300 bg-white text-amber-800" onClick={loadPatientData}>Atualizar dados</Button>
                  <Button size="sm" variant="ghost" className="text-amber-900" onClick={async () => { await clearPatientModuleSyncFlags(patientId, { energy: true }); setSyncFlags((p) => (p ? { ...p, needs_energy_recalc: false } : null)); }}>Marcar como revisado</Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="biometry" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-2xl">
            <TabsTrigger value="biometry">Biometria e TMB</TabsTrigger>
            <TabsTrigger value="factors">Fatores e Atividades</TabsTrigger>
            <TabsTrigger value="venta">Planejamento (VENTA)</TabsTrigger>
          </TabsList>

          <TabsContent value="biometry" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Calculator className="w-5 h-5" />Dados biológicos</CardTitle>
                <CardDescription>Parâmetros para cálculo da TMB</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weight" className="flex items-center">Peso (kg) * {getDataSourceBadge('weight')}</Label>
                    <Input id="weight" type="number" step="0.1" min={1} value={weight} onChange={(e) => { setWeight(e.target.value); setDataSource((p) => ({ ...p, weight: 'manual' })); }} placeholder="70" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height" className="flex items-center">Altura (cm) * {getDataSourceBadge('height')}</Label>
                    <Input id="height" type="number" step="0.1" min={50} value={height} onChange={(e) => { setHeight(e.target.value); setDataSource((p) => ({ ...p, height: 'manual' })); }} placeholder="175" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="age">Idade (anos) *</Label>
                    <Input id="age" type="number" min={1} max={120} value={age} onChange={(e) => setAge(e.target.value)} placeholder="30" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender">Sexo *</Label>
                    <Select value={gender || ''} onValueChange={setGender}>
                      <SelectTrigger id="gender"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="F">Feminino</SelectItem>
                        <SelectItem value="M">Masculino</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bodyFat" className="flex items-center">% Gordura</Label>
                    <Input id="bodyFat" type="number" step="0.1" min={0} max={100} value={bodyFatPct} onChange={(e) => setBodyFatPct(e.target.value)} placeholder="Opcional" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="leanMass" className="flex items-center">Massa magra (kg) {getDataSourceBadge('leanMass')}</Label>
                    <Input id="leanMass" type="number" step="0.1" min={0} value={leanMass} onChange={(e) => { setLeanMass(e.target.value); setDataSource((p) => ({ ...p, leanMass: 'manual' })); }} placeholder="Desbloqueia Cunningham/Tinsley" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Protocolo TMB</Label>
                  <Select value={selectedProtocol} onValueChange={(v) => setSelectedProtocol(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TMB_PROTOCOLS.filter((p) => protocols.some((r) => r.id === p.id)).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {protocols.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Comparativo de protocolos</CardTitle>
                  <CardDescription>TMB em tempo real por protocolo</CardDescription>
                </CardHeader>
                <CardContent>
                  <ProtocolComparisonTable
                    protocols={protocols}
                    activityFactor={activityFactor}
                    selectedProtocolId={selectedProtocol}
                    onSelect={(protocol) => { setSelectedProtocol(protocol.id); setSelectedProtocolData(protocol); }}
                    patientData={patientData}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="factors" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" />Fator de atividade</CardTitle>
                <CardDescription>Sedentário 1.2 a Muito ativo 1.9</CardDescription>
              </CardHeader>
              <CardContent>
                <ActivityLevelSelector value={activityFactor} onChange={setActivityFactor} />
                {suggestedActivity && <Badge variant="outline" className="mt-2 text-xs">Sugestão: {suggestedActivity}</Badge>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Fator clínico / injúria</CardTitle>
                <CardDescription>Multiplicador 1.0 a 2.0 (opcional)</CardDescription>
              </CardHeader>
              <CardContent>
                <Input type="number" min={1} max={2} step={0.1} value={injuryFactor} onChange={(e) => setInjuryFactor(parseFloat(e.target.value) || 1)} className="max-w-[120px]" />
              </CardContent>
            </Card>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="eta"
                checked={etaEnabled}
                onCheckedChange={(checked) => setEtaEnabled(!!checked)}
              />
              <label htmlFor="eta" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Adicionar ETA (Efeito Térmico dos Alimentos, ~10% da TMB)
              </label>
            </div>

            <MetsActivitiesForm activities={metsActivities} onChange={setMetsActivities} weightKg={weightNum} />

            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{isEer ? 'GET base (EER)' : 'GET base (TMB × FA × Injúria)'}</p>
                    <p className="text-2xl font-bold">{Math.round(getBase)} kcal/dia</p>
                  </div>
                  {metsTotalKcal > 0 && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">+ Atividades (média diária)</p>
                      <p className="text-xl font-semibold text-primary">+{Math.round(metsTotalKcal)} kcal</p>
                    </div>
                  )}
                  {etaKcal > 0 && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">+ ETA</p>
                      <p className="text-xl font-semibold">+{Math.round(etaKcal)} kcal</p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">GET total</p>
                    <p className="text-2xl font-bold text-primary">{Math.round(getResult)} kcal/dia</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="venta" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Target className="w-5 h-5" />Planejamento (VENTA)</CardTitle>
                <CardDescription>Peso desejado e prazo em dias para meta calórica final</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ventaTarget">Peso desejado (kg)</Label>
                    <Input id="ventaTarget" type="number" step="0.1" min={0} value={ventaTargetWeight} onChange={(e) => setVentaTargetWeight(e.target.value)} placeholder="Ex: 70" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ventaDays">Prazo (dias)</Label>
                    <Input id="ventaDays" type="number" min={1} value={ventaTimeframeDays} onChange={(e) => setVentaTimeframeDays(e.target.value)} placeholder="Ex: 90" />
                  </div>
                </div>
                <WeightProjectionCard
                  ventaTargetWeight={ventaTargetWeight ? parseFloat(ventaTargetWeight) : undefined}
                  ventaTimeframeDays={ventaTimeframeDays ? parseInt(ventaTimeframeDays, 10) : undefined}
                  currentWeight={weightNum}
                  getResult={getResult}
                />
              </CardContent>
            </Card>

            <EnergyExpenditureResultsPanel
              tmbResult={tmbResult}
              getBase={getBase}
              metsAverageDaily={metsTotalKcal}
              etaEnabled={etaEnabled}
              etaKcal={etaKcal}
              ventaAdjustmentKcal={ventaAdjustmentKcal}
              finalPlannedKcal={finalPlannedKcal}
            />

            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">Meta calórica final (VET)</p>
                  <p className="text-5xl font-bold text-primary">{Math.round(finalPlannedKcal)} <span className="text-3xl font-normal">kcal</span></p>
                  <p className="text-sm text-muted-foreground mt-2">por dia</p>
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSave} disabled={saving} size="lg" className="w-full gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4" /> Salvar planejamento</>}
            </Button>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
