import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { isUuid, patientHubRoute } from '@/lib/utils/patientRoutes';
import { ArrowLeft, Calculator, Save, Loader2, Target, Database, User, AlertCircle, HelpCircle, ChevronRight, ChevronLeft, Flame, Activity, CheckCircle2 } from 'lucide-react';
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
import { restoreEnergyBiometry } from '@/lib/utils/energy-inputs';
import { parseFiniteEnergyNumber } from '@/lib/utils/energy-numbers';
import DriActivitySelector from '@/components/energy/DriActivitySelector';
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
  { id: 'cunningham', label: 'Cunningham (massa magra)' },
  { id: 'tinsley', label: 'Tinsley (massa magra)' },
  { id: 'eer_iom', label: 'DRIs / EER-IOM (2005)' },
  { id: 'dri_2023', label: 'DRIs / EER (2023)' }
];

const STEP_META = [
  { id: 'biometry', number: 1, short: 'Dados', label: 'Dados e protocolo' },
  { id: 'factors', number: 2, short: 'Fatores', label: 'Fatores clínicos' },
  { id: 'venta', number: 3, short: 'Meta', label: 'Meta energética' },
];

function EnergyProgressNav({ activeTab, onChange, completedSteps }) {
  return (
    <TabsList aria-label="Etapas do cálculo energético" className="grid h-auto w-full grid-cols-3 gap-1 rounded-2xl border bg-white p-1.5 shadow-card">
      {STEP_META.map((step) => {
        const complete = completedSteps.includes(step.id);
        return (
          <TabsTrigger
            key={step.id}
            value={step.id}
            aria-label={`Etapa ${step.number}: ${step.label}`}
            onClick={() => onChange(step.id)}
            className="min-w-0 flex-col gap-1 rounded-xl px-1 py-2 text-[11px] data-[state=active]:bg-primary data-[state=active]:text-white sm:flex-row sm:gap-2 sm:px-4 sm:py-3 sm:text-sm"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current/25 bg-current/10 text-xs font-bold">
              {complete ? <CheckCircle2 className="h-4 w-4" /> : step.number}
            </span>
            <span className="sm:hidden">{step.short}</span>
            <span className="hidden truncate sm:inline">{step.label}</span>
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
}

function EnergySummary({ protocolLabel, plan, isEer, activeTab, hasRequiredBiometry }) {
  const ready = plan.valid;
  const nextMessage = !hasRequiredBiometry
    ? 'Preencha os dados obrigatórios e escolha o protocolo.'
    : !ready
      ? 'Complete os fatores da etapa 2 para liberar o resultado.'
      : activeTab === 'venta'
        ? 'Revise a meta final antes de salvar.'
        : 'O cálculo está pronto para avançar.';

  return (
    <aside className="space-y-3 xl:sticky xl:top-5" aria-label="Resumo do cálculo">
      <Card className="overflow-hidden rounded-2xl border-primary/15">
        <div className="bg-primary px-5 py-4 text-primary-foreground">
          <div className="flex items-center gap-2 text-sm font-medium text-white/80"><Flame className="h-4 w-4" />Resumo do cálculo</div>
          <p className="mt-1 text-lg font-semibold leading-tight">{protocolLabel || 'Protocolo não selecionado'}</p>
        </div>
        <CardContent className="space-y-4 p-5">
          {!isEer && (
            <div className="flex items-end justify-between gap-3 border-b pb-3">
              <span className="text-sm text-muted-foreground">TMB</span>
              <strong className="text-lg">{plan.tmbResult != null ? Math.round(plan.tmbResult).toLocaleString('pt-BR') : '—'} <span className="text-xs font-normal text-muted-foreground">kcal/dia</span></strong>
            </div>
          )}
          <div className="flex items-end justify-between gap-3 border-b pb-3">
            <span className="text-sm text-muted-foreground">GET</span>
            <strong className="text-xl text-primary">{ready ? Math.round(plan.getResult).toLocaleString('pt-BR') : '—'} <span className="text-xs font-normal text-muted-foreground">kcal/dia</span></strong>
          </div>
          <div className="rounded-xl bg-primary-50 p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary-700">Meta final (VET)</span>
            <p className="mt-1 text-3xl font-bold text-primary-800">{ready ? Math.round(plan.finalPlannedKcal).toLocaleString('pt-BR') : '—'} <span className="text-sm font-medium">kcal</span></p>
          </div>
          <div className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${ready ? 'text-primary' : 'text-muted-foreground/50'}`} />
            <span>{nextMessage}</span>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

export default function EnergyExpenditurePage() {
  const resolvedPatient = useResolvedPatientId();
  return <EnergyExpenditureForm key={resolvedPatient.patientId || resolvedPatient.paramValue} resolvedPatient={resolvedPatient} />;
}

function EnergyExpenditureForm({ resolvedPatient }) {
  const { patientId, loading: resolveLoading, error: resolveError, paramValue } = resolvedPatient;
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
  const [ventaConfirmedFor, setVentaConfirmedFor] = useState('');
  const [ventaReviewReason, setVentaReviewReason] = useState('');
  const [clinicalMobility, setClinicalMobility] = useState('');
  const [driActivity, setDriActivity] = useState('');
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
    weight: parseFiniteEnergyNumber(weight), height: parseFiniteEnergyNumber(height), age: parseFiniteEnergyNumber(age), gender,
    leanMass: leanMass ? parseFiniteEnergyNumber(leanMass) : null, driActivity,
  }), [weight, height, age, gender, leanMass, driActivity]);
  const protocols = useMemo(() => calculateAllProtocols(patientData), [patientData]);
  const selectedProtocolData = protocols.find(p => p.id === selectedProtocol);
  const planInput = { ...patientData, leanMass: leanMass || null, protocol: selectedProtocol, activityFactor,
    injuryFactor: getInjuryFactorValue(injuryFactorId), injuryFactorId, clinicalMobility, lifeStage,
    targetWeight: ventaTargetWeight, timeframeDays: ventaTimeframeDays };
  const plan = calculateEnergyPlan(planInput);
  const ventaSignature = JSON.stringify(planInput);
  const ventaConfirmed = !plan.requiresVentaConfirmation || ventaConfirmedFor === ventaSignature;
  const { tmbResult, getBase, getResult, finalPlannedKcal, ventaAdjustmentKcal } = plan;
  const isEer = ['eer_iom', 'dri_2023'].includes(selectedProtocol);
  const isHarris = selectedProtocol === 'harris';
  const protocolLabel = TMB_PROTOCOLS.find((protocol) => protocol.id === selectedProtocol)?.label || '';
  const hasRequiredBiometry = Number(weight) >= 1 && Number(height) >= 50 && Number.isInteger(Number(age)) && Number(age) >= (isEer ? 19 : 18) && !!gender && !!selectedProtocol;
  const factorsComplete = hasRequiredBiometry && (
    isHarris
      ? !!clinicalMobility && !!injuryFactorId
      : isEer
        ? !!driActivity && lifeStage === 'adult'
        : Number.isFinite(Number(activityFactor))
  );
  const completedSteps = [
    ...(hasRequiredBiometry ? ['biometry'] : []),
    ...(factorsComplete && plan.valid ? ['factors'] : []),
    ...(factorsComplete && plan.valid && activeTab === 'venta' ? ['venta'] : []),
  ];

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

      const [{ data: currentBiometry, error: biometryError }, { data: saved }] = await Promise.all([
        getInitialBiometryForEnergy(patientId), getLatestEnergyCalculation(patientId)
      ]);
      const biometry = restoreEnergyBiometry(currentBiometry, saved);
      if (biometryError) toast({ title: 'Confira a biometria', description: 'Parte dos dados não pôde ser carregada. Confira os campos e a origem indicada antes de salvar.', variant: 'destructive' });
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

      if (saved) {
        if (saved.tmb_protocol || saved.protocol) setSelectedProtocol(saved.tmb_protocol || saved.protocol);
        const restored = restoreEnergyInputs(saved);
        setClinicalMobility(restored.clinicalMobility);
        setDriActivity(restored.driActivity);
        setLifeStage(restored.lifeStage);
        setRequiresReview(restored.requiresReview);
        if (saved.activity_factor != null) setActivityFactor(Number(saved.activity_factor));
        setInjuryFactorId(restored.injuryFactorId);
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
    const w = parseFiniteEnergyNumber(weight);
    const h = parseFiniteEnergyNumber(height);
    const a = parseFiniteEnergyNumber(age);
    if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(a) || !gender) {
      throw new Error('Preencha peso, altura, idade e sexo.');
    }
    if (!selectedProtocolData) {
      throw new Error('Selecione um protocolo TMB.');
    }
    if (!plan.valid) throw new Error(plan.errors.join(' '));
    if (!ventaConfirmed) throw new Error('Confirme a avaliação clínica da meta de peso.');
    const payload = {
      patient_id: patientId,
      nutritionist_id: user?.id || null,
      height: h,
      weight: w,
      age: a,
      gender: gender,
      body_fat_percentage: bodyFatPct || null,
      lean_mass_kg: leanMass || null,
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
      venta_target_weight: ventaTargetWeight ? parseFiniteEnergyNumber(ventaTargetWeight) : null,
      venta_timeframe_days: ventaTimeframeDays ? parseFiniteEnergyNumber(ventaTimeframeDays) : null,
      venta_confirmed: ventaConfirmed,
      venta_review_reason: ventaReviewReason,
      venta_adjustment_kcal: ventaAdjustmentKcal,
      final_planned_kcal: finalPlannedKcal
    };
    const { error } = await saveEnergyCalculation(payload);
    if (error) throw error;
    setRequiresReview(false);
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
    if (src === 'saved') return <Badge variant="outline" className="text-xs ml-2">Último cálculo — confira</Badge>;
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
    <div className="min-h-screen overflow-x-hidden bg-[#f7f7f5]">
      <main className="mx-auto w-full max-w-[1440px] min-w-0 px-3 py-4 sm:px-6 md:py-6 lg:px-8">
        <Button variant="ghost" size="sm" onClick={() => navigate(patientHubRoute({ id: patientId, slug: patientSlug || paramValue }, 'nutrition'))} className="-ml-2 mb-3 gap-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          Prontuário do paciente
        </Button>

        <header className="mb-5 overflow-hidden rounded-2xl border border-primary/15 bg-white shadow-card">
          <div className="flex flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge className="bg-primary-50 text-primary-700 hover:bg-primary-50">Nutrição clínica</Badge>
                {requiresReview && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Revisão necessária</Badge>}
              </div>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Gastos energéticos</h1>
              <p className="mt-1 text-sm text-muted-foreground sm:text-base"><span className="font-medium text-foreground">{patientName}</span> · cálculo, fatores e planejamento da meta calórica</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-primary-50 px-4 py-3 lg:max-w-sm">
              <Calculator className="h-5 w-5 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-primary-900">Preencha as três etapas. O resumo será atualizado automaticamente sem aplicar fatores em duplicidade.</p>
            </div>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
          <EnergyProgressNav activeTab={activeTab} onChange={setActiveTab} completedSteps={completedSteps} />

          <TabsContent value="biometry" className="mt-0">
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="min-w-0 space-y-4">
            <Card className="rounded-2xl border-0 shadow-card">
              <CardHeader className="border-b p-4 sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary"><Calculator className="h-5 w-5" /></span>
                  <div>
                    <CardTitle className="text-lg sm:text-xl">1. Dados e protocolo</CardTitle>
                    <CardDescription className="mt-1">Confirme os dados usados pela equação e escolha o método de cálculo.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-4 sm:p-6">
                <div>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">Dados obrigatórios</h2>
                    <span className="text-xs text-muted-foreground">* preenchimento obrigatório</span>
                  </div>
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
                </div>
                </div>
                <div className="rounded-xl border border-dashed bg-muted/20 p-4">
                  <h2 className="mb-1 text-sm font-semibold">Composição corporal <span className="font-normal text-muted-foreground">(opcional)</span></h2>
                  <p className="mb-4 text-xs text-muted-foreground">Necessária apenas para protocolos que utilizam massa magra.</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="bodyFat" className="flex items-center">Gordura corporal (%)</Label>
                      <Input id="bodyFat" type="number" step="0.1" min={0} max={100} value={bodyFatPct} onChange={(e) => setBodyFatPct(e.target.value)} placeholder="Ex.: 28" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="leanMass" className="flex flex-wrap items-center gap-1">Massa magra (kg) {getDataSourceBadge('leanMass')}</Label>
                      <Input id="leanMass" type="number" step="0.1" min={0} value={leanMass} onChange={(e) => { setLeanMass(e.target.value); setDataSource((p) => ({ ...p, leanMass: 'manual' })); }} placeholder="Ex.: 49" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-sm font-semibold">Protocolo energético *</Label>
                    <p className="text-xs text-muted-foreground">Escolha a equação adequada ao contexto clínico do paciente.</p>
                  </div>
                  <Select value={selectedProtocol} onValueChange={(v) => setSelectedProtocol(v)}>
                    <SelectTrigger aria-label="Protocolo energético" className="h-11 bg-white"><SelectValue placeholder="Selecione o protocolo" /></SelectTrigger>
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

            {!hasRequiredBiometry && <p className="text-sm text-muted-foreground">Preencha os campos obrigatórios para avançar.</p>}
            <div className="flex justify-end border-t pt-4">
              <Button
                onClick={() => setActiveTab('factors')}
                disabled={saving || !hasRequiredBiometry}
                size="lg"
                className="w-full gap-2 sm:w-auto"
              >
                Continuar para fatores
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
              </section>
              <EnergySummary protocolLabel={protocolLabel} plan={plan} isEer={isEer} activeTab={activeTab} hasRequiredBiometry={hasRequiredBiometry} />
            </div>
          </TabsContent>

          <TabsContent value="factors" className="mt-0">
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="min-w-0 space-y-4">
            {requiresReview && <Alert className="border-amber-300 bg-amber-50 text-amber-950"><AlertCircle className="h-4 w-4" /><AlertDescription><strong>Revise este cálculo histórico.</strong> Confira fórmula, biometria, fatores e meta de peso antes de salvar uma nova avaliação.</AlertDescription></Alert>}
            {isHarris ? (
              <Card className="rounded-2xl border-0 shadow-card"><CardHeader className="border-b p-4 sm:p-6"><CardTitle className="flex items-center gap-3 text-lg sm:text-xl"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary"><Activity className="h-5 w-5" /></span>2. Contexto clínico</CardTitle>
                <CardDescription className="sm:pl-[52px]">Neste fluxo Harris-Benedict, escolha a mobilidade clínica para calcular o GET. O exercício não é multiplicado novamente.</CardDescription></CardHeader>
                <CardContent className="space-y-5 p-4 sm:p-6">
                  <div className="space-y-2"><Label>Condição do paciente *</Label>
                  <Select value={clinicalMobility} onValueChange={setClinicalMobility}><SelectTrigger aria-label="Condição do paciente"><SelectValue placeholder="Selecione a condição" /></SelectTrigger><SelectContent>
                    <SelectItem value="bedridden">Acamado (×1,2)</SelectItem><SelectItem value="ambulatory">Ambulante (×1,3)</SelectItem>
                  </SelectContent></Select></div>
                  <div className="space-y-2"><Label>Fator de injúria / estresse clínico *</Label>
                  <Select value={injuryFactorId} onValueChange={setInjuryFactorId}><SelectTrigger aria-label="Fator de injúria"><SelectValue placeholder="Selecione a condição" /></SelectTrigger><SelectContent>
                    {INJURY_FACTORS.map(f => <SelectItem key={f.id} value={f.id}>{f.label} (×{f.value})</SelectItem>)}
                  </SelectContent></Select></div>
                  <div className="rounded-xl bg-primary-50 p-3 text-xs leading-relaxed text-primary-900"><strong>Fórmula aplicada:</strong> TMB × mobilidade clínica × fator de injúria. Sem injúria: ×1. Confira a condição e o coeficiente com o contexto clínico; a estimativa não substitui a avaliação profissional.</div>
                </CardContent></Card>
            ) : isEer ? (
              <Card className="rounded-2xl border-0 shadow-card"><CardHeader className="border-b p-4 sm:p-6"><CardTitle className="flex items-center gap-3 text-lg sm:text-xl"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary"><Activity className="h-5 w-5" /></span>2. Atividade nas DRIs</CardTitle><CardDescription className="sm:pl-[52px]">Para adultos a partir de 19 anos. A categoria escolhida já faz parte da equação do GET.</CardDescription></CardHeader><CardContent className="space-y-5 p-4 sm:p-6">
                <DriActivitySelector value={driActivity} onChange={setDriActivity} protocol={selectedProtocol} gender={gender} onEditBiometry={() => setActiveTab('biometry')} />
                <div className="space-y-2"><Label>Fase de vida *</Label><Select value={lifeStage} onValueChange={setLifeStage}><SelectTrigger aria-label="Aplicabilidade das DRIs"><SelectValue placeholder="Confirme a fase de vida" /></SelectTrigger><SelectContent>
                  <SelectItem value="adult">Adulto, fora de gestação e lactação</SelectItem><SelectItem value="pregnancy">Gestação — requer equação específica</SelectItem><SelectItem value="lactation">Lactação — requer equação específica</SelectItem>
                </SelectContent></Select></div>
              </CardContent></Card>
            ) : (
              <Card className="rounded-2xl border-0 shadow-card"><CardHeader className="border-b p-4 sm:p-6"><CardTitle className="flex items-center gap-3 text-lg sm:text-xl"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary"><Activity className="h-5 w-5" /></span>2. Nível de atividade</CardTitle><CardDescription className="sm:pl-[52px]">Selecione a rotina que melhor representa o paciente. O fator é aplicado uma única vez.</CardDescription></CardHeader><CardContent className="p-4 sm:p-6">
                <ActivityLevelSelector value={activityFactor} onChange={setActivityFactor} />
                {suggestedActivity && <p className="text-xs text-muted-foreground mt-3">Sugestão da anamnese: {suggestedActivity}</p>}
              </CardContent></Card>
            )}
            {!isHarris && <details className="rounded-xl border bg-white p-4 shadow-sm"><summary className="cursor-pointer text-sm font-medium">Exercícios por METs <span className="font-normal text-muted-foreground">(consulta opcional)</span></summary>
              <p className="text-sm text-muted-foreground my-3">A atividade física e o efeito térmico dos alimentos já estão contemplados no GET. Os METs ficam registrados para consulta e não são somados novamente.</p>
              <MetsActivitiesForm activities={metsActivities} onChange={setMetsActivities} weightKg={weightNum} />
            </details>}
            {selectedProtocol && !plan.valid && <Alert variant="destructive"><AlertDescription>{plan.errors.join(' ')}</AlertDescription></Alert>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
              {!isEer && <Card className="rounded-xl"><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">TMB</p><p className="mt-1 text-2xl font-bold">{Math.round(tmbResult || 0).toLocaleString('pt-BR')} <span className="text-sm font-normal">kcal/dia</span></p></CardContent></Card>}
              <Card className="rounded-xl border-primary/25 bg-primary-50"><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-primary-700">Gasto Energético Total</p><p className="mt-1 text-2xl font-bold text-primary-800">{plan.valid ? Math.round(getResult).toLocaleString('pt-BR') : '—'} <span className="text-sm font-normal">kcal/dia</span></p></CardContent></Card>
            </div>
            {plan.valid && <EnergyFormulaDetails plan={plan} />}

            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" size="lg" onClick={() => setActiveTab('biometry')} className="gap-2"><ChevronLeft className="h-4 w-4" />Voltar aos dados</Button>
              <Button
                onClick={() => setActiveTab('venta')}
                disabled={saving || !plan.valid}
                size="lg"
                className="gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Prosseguir para a meta
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
              </section>
              <EnergySummary protocolLabel={protocolLabel} plan={plan} isEer={isEer} activeTab={activeTab} hasRequiredBiometry={hasRequiredBiometry} />
            </div>
          </TabsContent>

          <TabsContent value="venta" className="mt-0">
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="min-w-0 space-y-4">
            {!plan.valid && <Alert variant="destructive"><AlertDescription>{plan.errors.join(' ')}</AlertDescription></Alert>}
            <Card className="rounded-2xl border-0 shadow-card">
              <CardHeader className="border-b p-4 sm:p-6">
                <CardTitle className="flex items-center gap-3 text-lg sm:text-xl"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary"><Target className="h-5 w-5" /></span>3. Defina a meta energética</CardTitle>
                <CardDescription className="sm:pl-[52px]">Informe peso-alvo e prazo somente quando houver uma estratégia de alteração de peso. Para manutenção, deixe os dois campos vazios.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 p-4 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ventaTarget">Peso-alvo (kg)</Label>
                    <Input id="ventaTarget" type="number" step="0.1" min={0} value={ventaTargetWeight} onChange={(e) => setVentaTargetWeight(e.target.value)} placeholder="Ex: 70" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ventaDays">Prazo (dias)</Label>
                    <Input id="ventaDays" type="number" min={1} value={ventaTimeframeDays} onChange={(e) => setVentaTimeframeDays(e.target.value)} placeholder="Ex: 90" />
                  </div>
                </div>
                {plan.valid && <WeightProjectionCard
                  ventaTargetWeight={ventaTargetWeight ? parseFloat(ventaTargetWeight) : undefined}
                  ventaTimeframeDays={ventaTimeframeDays ? parseInt(ventaTimeframeDays, 10) : undefined}
                  currentWeight={weightNum}
                  getResult={getResult}
                />}
                {plan.valid && plan.requiresVentaConfirmation && <Alert className={plan.ventaRiskLevel === 'high' ? 'border-destructive/50' : ''}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="space-y-3">
                    <p className="font-semibold">{plan.ventaRiskLevel === 'high' ? 'Meta exige revisão clínica reforçada' : 'Revise a meta antes de salvar'}</p>
                    <p>Ajuste: {Math.abs(plan.ventaAdjustmentKcal).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kcal/dia; mudança projetada: {plan.weeklyWeightChangeKg.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg/semana; VET: {plan.finalPlannedKcal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kcal/dia.</p>
                    {plan.ventaRiskReasons.map(reason => <p key={reason}>{reason}</p>)}
                    <p className="text-xs">A projeção linear de 7.700 kcal/kg é apenas uma aproximação; a mudança real de peso varia com a adaptação metabólica e o contexto clínico.</p>
                    {plan.ventaRiskLevel === 'high' && <div className="space-y-1"><Label htmlFor="ventaReviewReason">Justificativa clínica (obrigatória)</Label><Input id="ventaReviewReason" value={ventaReviewReason} onChange={event => setVentaReviewReason(event.target.value)} placeholder="Descreva a avaliação individual" /></div>}
                    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ventaConfirmed} onChange={event => setVentaConfirmedFor(event.target.checked ? ventaSignature : '')} /><span>Confirmei a meta, o prazo e o VET para este paciente.</span></label>
                  </AlertDescription>
                </Alert>}
              </CardContent>
            </Card>

            {plan.valid && <EnergyFormulaDetails plan={plan} />}
            {plan.valid && <div className="hidden xl:block"><EnergyExpenditureResultsPanel
              tmbResult={tmbResult}
              getBase={getBase}
              metsAverageDaily={0}
              etaEnabled={false}
              etaKcal={0}
              isHarris={isHarris}
              ventaAdjustmentKcal={ventaAdjustmentKcal}
              finalPlannedKcal={finalPlannedKcal}
            /></div>}

            <Card className="overflow-hidden rounded-2xl border-2 border-primary/20 bg-primary-50 xl:hidden">
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-col gap-1 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
                  <div><p className="text-sm font-medium text-primary-700">Meta calórica final (VET)</p><p className="text-xs text-muted-foreground">Valor diário para o planejamento alimentar</p></div>
                  <p className="mt-2 text-4xl font-bold text-primary-800 sm:mt-0">{plan.valid ? Math.round(finalPlannedKcal).toLocaleString('pt-BR') : '—'} <span className="text-lg font-medium">kcal</span></p>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" size="lg" onClick={() => setActiveTab('factors')} className="gap-2"><ChevronLeft className="h-4 w-4" />Voltar aos fatores</Button>
              <Button onClick={handleSave} disabled={saving || !plan.valid || !ventaConfirmed || (plan.ventaRiskLevel === 'high' && ventaReviewReason.trim().length < 10)} size="lg" className="gap-2 sm:min-w-56">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4" /> Salvar cálculo</>}
              </Button>
            </div>
              </section>
              <EnergySummary protocolLabel={protocolLabel} plan={plan} isEer={isEer} activeTab={activeTab} hasRequiredBiometry={hasRequiredBiometry} />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
