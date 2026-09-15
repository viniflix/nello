import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { isUuid, patientHubRoute } from '@/lib/utils/patientRoutes';
import { ArrowLeft, Calculator, Save, Loader2, Target, TrendingUp, Database, User, AlertCircle, HelpCircle, ChevronRight, Flame, Activity, HeartPulse, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeaderSkeleton, CardSkeleton } from '@/components/ui/custom-skeletons';
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
import { calculateEnergyPlan, restoreEnergyInputs } from '@/lib/utils/energy-planning';
import { DRI_ACTIVITY_LEVELS, driPaCoefficient } from '@/lib/utils/dri-energy';
import EnergyFormulaDetails from '@/components/energy/EnergyFormulaDetails';
import {
  getLatestAnamnesisForEnergy,
  getActiveGoalForEnergy,
  logActivityEvent
} from '@/lib/supabase/patient-queries';
import { getPatientModuleSyncFlags, clearPatientModuleSyncFlags } from '@/lib/supabase/anthropometry-queries';
import { useClinicalFlags } from '@/hooks/useClinicalFlags';
import {
  getInitialBiometryForEnergy,
  getLatestEnergyCalculation,
  saveEnergyCalculation
} from '@/lib/supabase/energy-queries';
import {
  calculateAllProtocols,
  sumMetsActivitiesAverageDaily,
} from '@/lib/utils/energy-calculations';
import { INJURY_FACTORS, getInjuryFactorValue } from '@/lib/constants/injury-factors';

const TMB_PROTOCOLS = [
  { id: 'mifflin', label: 'Mifflin-St Jeor' },
  { id: 'harris', label: 'Harris-Benedict (1919)' },
  { id: 'fao_1985', label: 'FAO/OMS' },
  { id: 'eer_iom', label: 'DRIs / EER-IOM (2005)' },
  { id: 'dri_2023', label: 'DRIs / EER (2023)' }
];

export default function EnergyExpenditurePage() {
  const { patientId, loading: resolveLoading, error: resolveError, paramValue } = useResolvedPatientId();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [patientSlug, setPatientSlug] = useState(null);

  // Biometria (M/F para gender)
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [leanMass, setLeanMass] = useState('');
  const [dataSource, setDataSource] = useState({ weight: null, height: null, age: null, gender: null, leanMass: null });

  const [activityFactor, setActivityFactor] = useState(1.55);
  const [injuryFactorId, setInjuryFactorId] = useState('none');
  const [metsActivities, setMetsActivities] = useState([]);
  const [selectedProtocol, setSelectedProtocol] = useState('');
  const [ventaTargetWeight, setVentaTargetWeight] = useState('');
  const [ventaTimeframeDays, setVentaTimeframeDays] = useState('');
  const [clinicalMobility, setClinicalMobility] = useState('');
  const [driActivity, setDriActivity] = useState('inactive');
  const [lifeStage, setLifeStage] = useState('');
  const [requiresReview, setRequiresReview] = useState(false);

  const [suggestedActivity, setSuggestedActivity] = useState(null);
  const [suggestedGoal, setSuggestedGoal] = useState(null);
  const [goalSuggestionSource, setGoalSuggestionSource] = useState(null);
  const [syncFlags, setSyncFlags] = useState(null);
  // Sprint E: Clinical flags hook (source of truth para level de atividade)
  const { flags: clinicalFlags } = useClinicalFlags(patientId);

  const [showProtocolComparison, setShowProtocolComparison] = useState(false);
  const [activeTab, setActiveTab] = useState('biometry');

  // Carregar paciente + biometria inicial + último cálculo
  useEffect(() => {
    if (resolveLoading) return;
    if (!patientId) {
      setLoading(false);
      return;
    }
    loadPatientData();
  }, [patientId, resolveLoading]);

  // Substituir URL por slug quando acessada com UUID (igual às outras páginas do hub)
  useEffect(() => {
    if (!patientSlug || !paramValue || !isUuid(paramValue)) return;
    const path = `/nutritionist/patients/${patientSlug}/energy-expenditure`;
    if (window.location.pathname !== path) {
      navigate(path, { replace: true });
    }
  }, [patientSlug, paramValue, navigate]);

  const weightNum = Number(weight) || 0;
  const patientData = useMemo(() => ({
    weight: Number(weight), height: Number(height), age: Number(age), gender,
    leanMass: leanMass ? Number(leanMass) : null, driActivity,
  }), [weight, height, age, gender, leanMass, driActivity]);
  const protocols = useMemo(() => calculateAllProtocols(patientData), [patientData]);
  const selectedProtocolData = protocols.find(p => p.id === selectedProtocol);
  const planInput = { ...patientData, protocol: selectedProtocol, activityFactor,
    injuryFactor: getInjuryFactorValue(injuryFactorId), clinicalMobility, lifeStage,
    targetWeight: ventaTargetWeight, timeframeDays: ventaTimeframeDays };
  const plan = calculateEnergyPlan(planInput);
  const { tmbResult, getBase, getResult, finalPlannedKcal, ventaAdjustmentKcal } = plan;
  const isEer = ['eer_iom', 'dri_2023'].includes(selectedProtocol);
  const isHarris = selectedProtocol === 'harris';

  async function loadPatientData() {
    if (!patientId) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('name, slug')
        .eq('id', patientId)
        .single();
      setPatientName(profile?.name || 'Paciente');
      setPatientSlug(profile?.slug || null);

      const { data: biometry } = await getInitialBiometryForEnergy(patientId);
      if (biometry) {
        if (biometry.weight != null) setWeight(String(biometry.weight));
        if (biometry.height != null) setHeight(String(biometry.height));
        if (biometry.age != null) setAge(String(biometry.age));
        if (biometry.gender) setGender(biometry.gender);
        if (biometry.body_fat_percentage != null) setBodyFatPct(String(biometry.body_fat_percentage));
        if (biometry.lean_mass_kg != null) setLeanMass(String(biometry.lean_mass_kg));
        const src = biometry._sources || {};
        setDataSource({
          weight: src.weight || null,
          height: src.height || null,
          age: src.age || null,
          gender: src.gender || null,
          leanMass: src.lean_mass_kg || null
        });
      }

      const [anamnesisResult, goalResult] = await Promise.all([
        getLatestAnamnesisForEnergy(patientId),
        getActiveGoalForEnergy(patientId)
      ]);

      // Sprint E: Prioridade 1 — clinical_flags.activity_level (dado limpo e tipado)
      const activityFromFlags = clinicalFlags?.activity_level?.value;
      if (activityFromFlags) {
        const levelMap = {
          sedentary:    { factor: 1.2,   label: 'Sedentário (flags clínicas)' },
          light:        { factor: 1.375, label: 'Levemente Ativo (flags clínicas)' },
          moderate:     { factor: 1.55,  label: 'Moderadamente Ativo (flags clínicas)' },
          active:       { factor: 1.725, label: 'Muito Ativo (flags clínicas)' },
          very_active:  { factor: 1.9,   label: 'Extremamente Ativo (flags clínicas)' },
        };
        const mapped = levelMap[String(activityFromFlags).toLowerCase()];
        if (mapped) {
          setActivityFactor(mapped.factor);
          setSuggestedActivity(mapped.label);
        }
      // Prioridade 2 — texto livre da anamnese (legado)
      } else if (anamnesisResult?.data?.exerciseFrequency) {
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
        if (saved.tmb_protocol || saved.protocol) setSelectedProtocol(saved.tmb_protocol || saved.protocol);
        const restored = restoreEnergyInputs(saved);
        setClinicalMobility(restored.clinicalMobility);
        setDriActivity(restored.driActivity || 'inactive');
        setLifeStage(restored.lifeStage);
        setRequiresReview(restored.requiresReview);
        if (saved.activity_factor != null) setActivityFactor(Number(saved.activity_factor));
        if (saved.injury_factor != null) {
          const found = INJURY_FACTORS.find((f) => Math.abs(f.value - Number(saved.injury_factor)) < 0.01);
          setInjuryFactorId(saved.input_snapshot?.injury_factor_id || (found ? found.id : 'none'));
        }
        if (Array.isArray(saved.mets_activities) && saved.mets_activities.length)
          setMetsActivities(saved.mets_activities);
        if (saved.venta_target_weight != null) setVentaTargetWeight(String(saved.venta_target_weight));
        if (saved.venta_timeframe_days != null) setVentaTimeframeDays(String(saved.venta_timeframe_days));
      }

      const { data: flags } = await getPatientModuleSyncFlags(patientId);
      setSyncFlags(flags || null);
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro', description: err?.message || 'Não foi possível carregar os dados do paciente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const saveCurrentState = async () => {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    const a = parseInt(age, 10);
    if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(a) || !gender) {
      throw new Error('Preencha peso, altura, idade e sexo.');
    }
    if (!selectedProtocolData) {
      throw new Error('Selecione um protocolo TMB.');
    }
    if (!plan.valid) throw new Error(plan.errors.join(' '));
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
      activity_factor: plan.activityFactor,
      injury_factor: plan.injuryFactor,
      clinical_mobility: isHarris ? clinicalMobility : null,
      injury_factor_id: isHarris ? injuryFactorId : 'none',
      dri_activity: isEer ? driActivity : null,
      life_stage: isEer ? lifeStage : null,
      mets_activities: sumMetsActivitiesAverageDaily(metsActivities, w).items,
      calculation_details: plan,
      get_result: getResult,
      venta_target_weight: ventaTargetWeight ? parseFloat(ventaTargetWeight) : null,
      venta_timeframe_days: ventaTimeframeDays ? parseInt(ventaTimeframeDays, 10) : null,
      venta_adjustment_kcal: ventaAdjustmentKcal,
      final_planned_kcal: finalPlannedKcal
    };
    const { error } = await saveEnergyCalculation(payload);
    if (error) throw error;
    await logActivityEvent({
      eventName: 'energy.calculation.updated',
      sourceModule: 'energy',
      patientId,
      payload: { tmb_protocol: payload.tmb_protocol, final_planned_kcal: payload.final_planned_kcal }
    });
    await clearPatientModuleSyncFlags(patientId, { energy: true });
    setSyncFlags((prev) => (prev ? { ...prev, needs_energy_recalc: false } : null));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveCurrentState();
      toast({ title: 'Salvo!', description: 'Planejamento energético salvo com sucesso.' });
      const patient = { id: patientId, slug: patientSlug || paramValue };
      navigate(patientHubRoute(patient, 'nutrition'));
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro', description: err?.message || 'Não foi possível salvar o cálculo.', variant: 'destructive' });
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
    if (src === 'anthropometry') return <Badge variant="secondary" className="text-xs ml-2"><Database className="w-3 h-3 mr-1" />Antropometria</Badge>;
    if (src === 'anamnesis') return <Badge variant="secondary" className="text-xs ml-2">Anamnese</Badge>;
    if (src === 'profile') return <Badge variant="outline" className="text-xs ml-2"><User className="w-3 h-3 mr-1" />Perfil</Badge>;
    return null;
  };

  if (resolveLoading || loading) {
    return (
      <div className="container max-w-[1400px] py-8 space-y-6">
        <PageHeaderSkeleton />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <CardSkeleton className="lg:col-span-1" />
            <CardSkeleton className="lg:col-span-2" />
        </div>
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
        <Button variant="outline" className="mt-4 gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 shrink-0" />
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 min-w-0">
        <div className="flex items-center gap-2 md:gap-4 mb-6 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => navigate(patientHubRoute({ id: patientId, slug: patientSlug || paramValue }, 'nutrition'))} className="gap-2 shrink-0">
            <ArrowLeft className="w-4 h-4 shrink-0" />
            Voltar
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold break-words">Gastos Energéticos</h1>
            <p className="text-muted-foreground text-sm md:text-base truncate">{patientName} — Análise e planejamento</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
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
                    <Label htmlFor="age" className="flex items-center">Idade (anos) * {getDataSourceBadge('age')}</Label>
                    <Input id="age" type="number" min={1} max={120} value={age} onChange={(e) => { setAge(e.target.value); setDataSource((p) => ({ ...p, age: 'manual' })); }} placeholder="30" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender" className="flex items-center">Sexo * {getDataSourceBadge('gender')}</Label>
                    <Select value={gender || ''} onValueChange={(v) => { setGender(v); setDataSource((p) => ({ ...p, gender: 'manual' })); }}>
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
                    <Input id="leanMass" type="number" step="0.1" min={0} value={leanMass} onChange={(e) => { setLeanMass(e.target.value); setDataSource((p) => ({ ...p, leanMass: 'manual' })); }} placeholder="Opcional" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Protocolo energético (TMB ou DRIs)</Label>
                  <Select value={selectedProtocol} onValueChange={(v) => setSelectedProtocol(v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o protocolo" /></SelectTrigger>
                    <SelectContent>
                      {TMB_PROTOCOLS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {protocols.length > 0 && (
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-muted-foreground"
                      onClick={() => setShowProtocolComparison((v) => !v)}
                    >
                      <HelpCircle className="w-4 h-4" />
                      {showProtocolComparison ? 'Ocultar comparativo' : 'Verificar diferenças entre protocolos'}
                    </Button>
                    {showProtocolComparison && (
                      <Card className="mt-3">
                        <CardHeader>
                          <CardTitle>Comparativo de protocolos</CardTitle>
                          <CardDescription>TMB em tempo real por protocolo</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ProtocolComparisonTable
                            protocols={protocols}
                            activityFactor={activityFactor}
                            selectedProtocolId={selectedProtocol}
                            onSelect={(protocol) => setSelectedProtocol(protocol.id)}
                            patientData={patientData}
                            planInput={planInput}
                          />
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={() => setActiveTab('factors')}
                disabled={saving}
                className="gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Prosseguir
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="factors" className="space-y-6">
            {requiresReview && <Alert><AlertDescription>Cálculo anterior à correção. Revise os fatores e confirme os novos resultados antes de salvar.</AlertDescription></Alert>}
            {isHarris ? (
              <Card><CardHeader><CardTitle>Harris-Benedict — contexto clínico</CardTitle>
                <CardDescription>Somente acamados ou ambulantes. GET = TMB × mobilidade clínica × injúria. Sem fator geral de exercícios.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <Label>Condição do paciente</Label>
                  <Select value={clinicalMobility} onValueChange={setClinicalMobility}><SelectTrigger aria-label="Condição do paciente"><SelectValue placeholder="Selecione a condição" /></SelectTrigger><SelectContent>
                    <SelectItem value="bedridden">Acamado (×1,2)</SelectItem><SelectItem value="ambulatory">Ambulante (×1,3)</SelectItem>
                  </SelectContent></Select>
                  <Label>Fator de injúria / estresse clínico</Label>
                  <Select value={injuryFactorId} onValueChange={setInjuryFactorId}><SelectTrigger aria-label="Fator de injúria"><SelectValue /></SelectTrigger><SelectContent>
                    {INJURY_FACTORS.map(f => <SelectItem key={f.id} value={f.id}>{f.label} (×{f.value})</SelectItem>)}
                  </SelectContent></Select>
                  <p className="text-xs text-muted-foreground">Coeficientes clínicos aproximados; selecione conforme avaliação individual. Sem injúria: ×1.</p>
                </CardContent></Card>
            ) : isEer ? (
              <Card><CardHeader><CardTitle>DRIs — nível de atividade física</CardTitle><CardDescription>Adultos a partir de 19 anos. A atividade entra uma única vez na equação do GET.</CardDescription></CardHeader><CardContent className="space-y-4">
                <Select value={driActivity} onValueChange={setDriActivity}><SelectTrigger aria-label="Atividade nas DRIs"><SelectValue /></SelectTrigger><SelectContent>
                  {DRI_ACTIVITY_LEVELS.map(item => <SelectItem key={item.id} value={item.id}>{item.label}{selectedProtocol === 'eer_iom' ? ' (PA ' + driPaCoefficient(item.id, gender) + ')' : ''}</SelectItem>)}
                </SelectContent></Select>
                <p className="text-xs text-muted-foreground">{selectedProtocol === 'dri_2023' ? 'PAL: inativo 1,00–<1,53; pouco ativo 1,53–<1,68; ativo 1,68–<1,85; muito ativo 1,85–<2,50. A categoria seleciona os coeficientes da fórmula; não multiplica o resultado.' : 'PAL: sedentário 1,00–<1,40; pouco ativo 1,40–<1,60; ativo 1,60–<1,90; muito ativo 1,90–<2,50. PA é o coeficiente específico por sexo, aplicado aos termos de peso e altura.'}</p>
                <Select value={lifeStage} onValueChange={setLifeStage}><SelectTrigger aria-label="Aplicabilidade das DRIs"><SelectValue placeholder="Confirme a fase de vida" /></SelectTrigger><SelectContent>
                  <SelectItem value="adult">Adulto, fora de gestação e lactação</SelectItem>
                  <SelectItem value="pregnancy">Gestação — requer equação específica</SelectItem>
                  <SelectItem value="lactation">Lactação — requer equação específica</SelectItem>
                </SelectContent></Select>
              </CardContent></Card>
            ) : (
              <Card><CardHeader><CardTitle>Fator de atividade</CardTitle><CardDescription>GET = TMB × fator de atividade, aplicado uma vez.</CardDescription></CardHeader><CardContent>
                <ActivityLevelSelector value={activityFactor} onChange={setActivityFactor} />
                {suggestedActivity && <p className="text-xs text-muted-foreground mt-3">Sugestão da anamnese: {suggestedActivity}</p>}
              </CardContent></Card>
            )}
            {!isHarris && <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Exercícios por METs — referência</summary>
              <p className="text-sm text-muted-foreground my-3">A atividade física e o efeito térmico dos alimentos já estão contemplados no GET. Os METs ficam registrados para consulta e não são somados novamente.</p>
              <MetsActivitiesForm activities={metsActivities} onChange={setMetsActivities} weightKg={weightNum} />
            </details>}
            {selectedProtocol && !plan.valid && <Alert variant="destructive"><AlertDescription>{plan.errors.join(' ')}</AlertDescription></Alert>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!isEer && <Card><CardHeader><CardTitle>TMB</CardTitle></CardHeader><CardContent>{Math.round(tmbResult || 0)} kcal/dia</CardContent></Card>}
              <Card><CardHeader><CardTitle>Gasto Energético Total (GET)</CardTitle></CardHeader><CardContent>{plan.valid ? Math.round(getResult) : '—'} kcal/dia</CardContent></Card>
            </div>
            <EnergyFormulaDetails plan={plan} />

            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  setSaving(true);
                  try {
                    await saveCurrentState();
                    setActiveTab('venta');
                    toast({ title: 'Salvo', description: 'Fatores e atividades salvos. Revise o planejamento (VENTA).' });
                  } catch (err) {
                    toast({ title: 'Erro', description: err?.message || 'Não foi possível salvar.', variant: 'destructive' });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar e prosseguir
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="venta" className="space-y-6">
            {!plan.valid && <Alert variant="destructive"><AlertDescription>{plan.errors.join(' ')}</AlertDescription></Alert>}
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

            <EnergyFormulaDetails plan={plan} />
            <EnergyExpenditureResultsPanel
              tmbResult={tmbResult}
              getBase={getBase}
              metsAverageDaily={0}
              etaEnabled={false}
              etaKcal={0}
              isHarris={isHarris}
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

            <Button onClick={handleSave} disabled={saving || !plan.valid} size="lg" className="w-full gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4" /> Salvar Gastos Energéticos</>}
            </Button>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
