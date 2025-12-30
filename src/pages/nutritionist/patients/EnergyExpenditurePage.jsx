import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calculator, Save, Loader2, Target, TrendingUp, Database, User, Activity, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import ActivityLevelSelector from '@/components/energy/ActivityLevelSelector';
import WeightProjectionCard from '@/components/energy/WeightProjectionCard';
import CalculationInfoTooltip from '@/components/energy/CalculationInfoTooltip';
import ExerciseSelector, { calculateExerciseCalories, EXERCISE_DATABASE } from '@/components/energy/ExerciseSelector';
import ProtocolComparisonModal from '@/components/energy/ProtocolComparisonModal';
import { getLatestAnamnesisForEnergy, getActiveGoalForEnergy } from '@/lib/supabase/patient-queries';
import { 
    calculateAllProtocols, 
    calculateGET,
    getGETBreakdown,
    ACTIVITY_FACTORS
} from '@/lib/utils/energy-calculations';

const EnergyExpenditurePage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [patientName, setPatientName] = useState('');

    // Parâmetros biológicos
    const [weight, setWeight] = useState('');
    const [height, setHeight] = useState('');
    const [age, setAge] = useState('');
    const [gender, setGender] = useState('');
    const [leanMass, setLeanMass] = useState('');
    
    const [dataSource, setDataSource] = useState({
        weight: null,
        height: null,
        leanMass: null
    });

    // Nível de atividade
    const [activityFactor, setActivityFactor] = useState(1.55);

    // Protocolo selecionado
    const [selectedProtocol, setSelectedProtocol] = useState('mifflin');

    // Goal (Deficit/Superavit)
    const [goalAdjustment, setGoalAdjustment] = useState(0);

    // Exercícios físicos
    const [selectedExercises, setSelectedExercises] = useState([]);

    // Smart Defaults
    const [suggestedActivity, setSuggestedActivity] = useState(null);
    const [suggestedGoal, setSuggestedGoal] = useState(null);
    const [goalSuggestionSource, setGoalSuggestionSource] = useState(null);

    // Resultados calculados
    const [protocols, setProtocols] = useState([]);
    const [selectedProtocolData, setSelectedProtocolData] = useState(null);
    const [finalGET, setFinalGET] = useState(0);
    const [goalCalories, setGoalCalories] = useState(0);
    const [exerciseCalories, setExerciseCalories] = useState(0);

    // Carregar dados do paciente
    useEffect(() => {
        loadPatientData();
    }, [patientId]);

    // Calcular protocolos quando dados mudarem
    useEffect(() => {
        if (weight && height && age && gender) {
            calculateProtocols();
        }
    }, [weight, height, age, gender, leanMass]);

    // Calcular calorias dos exercícios
    useEffect(() => {
        if (selectedExercises.length > 0 && weight) {
            const totalWeekly = selectedExercises.reduce((total, exercise) => {
                const exerciseData = EXERCISE_DATABASE.find(e => e.id === exercise.id);
                if (!exerciseData) return total;
                
                const caloriesPerSession = calculateExerciseCalories(
                    exerciseData.met,
                    parseFloat(weight),
                    exercise.minutes
                );
                return total + (caloriesPerSession * exercise.daysPerWeek);
            }, 0);
            setExerciseCalories(totalWeekly / 7);
        } else {
            setExerciseCalories(0);
        }
    }, [selectedExercises, weight]);

    // Atualizar GET final quando protocolo ou atividade mudar
    useEffect(() => {
        if (selectedProtocolData) {
            const get = calculateGET(selectedProtocolData.bmr, activityFactor);
            setFinalGET(get);
            const getWithExercises = get + exerciseCalories;
            setGoalCalories(getWithExercises + goalAdjustment);
        }
    }, [selectedProtocolData, activityFactor, goalAdjustment, exerciseCalories]);

    const loadPatientData = async () => {
        setLoading(true);
        try {
            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('name, birth_date, gender, weight, height')
                .eq('id', patientId)
                .single();

            if (profileError) throw profileError;

            setPatientName(profile.name || 'Paciente');
            setGender(profile.gender || '');

            if (profile.birth_date) {
                const birthDate = new Date(profile.birth_date);
                const today = new Date();
                const calculatedAge = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();
                const ageValue = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) 
                    ? calculatedAge - 1 
                    : calculatedAge;
                setAge(ageValue.toString());
            }

            const { data: latestAnthropometry } = await supabase
                .from('growth_records')
                .select('weight, height, results, record_date')
                .eq('patient_id', patientId)
                .order('record_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestAnthropometry?.weight) {
                setWeight(latestAnthropometry.weight.toString());
                setDataSource(prev => ({ ...prev, weight: 'anthropometry' }));
            } else if (profile.weight) {
                setWeight(profile.weight.toString());
                setDataSource(prev => ({ ...prev, weight: 'profile' }));
            }

            if (latestAnthropometry?.height) {
                setHeight(latestAnthropometry.height.toString());
                setDataSource(prev => ({ ...prev, height: 'anthropometry' }));
            } else if (profile.height) {
                setHeight(profile.height.toString());
                setDataSource(prev => ({ ...prev, height: 'profile' }));
            }

            if (latestAnthropometry?.results?.lean_mass_kg) {
                setLeanMass(latestAnthropometry.results.lean_mass_kg.toString());
                setDataSource(prev => ({ ...prev, leanMass: 'anthropometry' }));
            }

            const [anamnesisResult, goalResult] = await Promise.all([
                getLatestAnamnesisForEnergy(patientId),
                getActiveGoalForEnergy(patientId)
            ]);

            if (anamnesisResult.data?.exerciseFrequency) {
                const freq = anamnesisResult.data.exerciseFrequency.toString().toLowerCase();
                
                if (freq.includes('sedent') || freq.includes('não') || freq.includes('nao') || freq === '0') {
                    setActivityFactor(1.2);
                    setSuggestedActivity('Sedentário (baseado na anamnese)');
                } else if (freq.includes('1-3') || freq.includes('1 a 3') || freq.includes('leve')) {
                    setActivityFactor(1.375);
                    setSuggestedActivity('Levemente Ativo (baseado na anamnese)');
                } else if (freq.includes('3-5') || freq.includes('3 a 5') || freq.includes('moder')) {
                    setActivityFactor(1.55);
                    setSuggestedActivity('Moderadamente Ativo (baseado na anamnese)');
                } else if (freq.includes('6-7') || freq.includes('6 a 7') || freq.includes('muito')) {
                    setActivityFactor(1.725);
                    setSuggestedActivity('Muito Ativo (baseado na anamnese)');
                } else if (freq.includes('2x') || freq.includes('duas') || freq.includes('extremo')) {
                    setActivityFactor(1.9);
                    setSuggestedActivity('Extremamente Ativo (baseado na anamnese)');
                }
            }

            if (goalResult.data) {
                const goalType = goalResult.data.type?.toLowerCase();
                
                if (goalType === 'weight_loss' || goalType === 'perda_peso' || goalType === 'emagrecimento') {
                    setGoalAdjustment(-500);
                    setSuggestedGoal('Perda de Peso');
                    setGoalSuggestionSource('goal');
                } else if (goalType === 'hypertrophy' || goalType === 'hipertrofia' || goalType === 'ganho_massa') {
                    setGoalAdjustment(300);
                    setSuggestedGoal('Hipertrofia');
                    setGoalSuggestionSource('goal');
                } else if (goalType === 'maintenance' || goalType === 'manutencao') {
                    setGoalAdjustment(0);
                    setSuggestedGoal('Manutenção');
                    setGoalSuggestionSource('goal');
                }
            }

            const { data: savedCalc } = await supabase
                .from('energy_expenditure_calculations')
                .select('*')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (savedCalc) {
                if (!suggestedActivity) {
                    setActivityFactor(parseFloat(savedCalc.activity_level) || 1.55);
                }
                if (!goalSuggestionSource && savedCalc.get_with_activities && savedCalc.get) {
                    setGoalAdjustment(savedCalc.get_with_activities - savedCalc.get);
                }
                if (savedCalc.protocol) {
                    const protocolMap = {
                        'harris-benedict': 'harris',
                        'mifflin-st-jeor': 'mifflin',
                        'fao-who': 'fao',
                        'fao-oms-2001': 'fao2001',
                        'schofield': 'schofield',
                        'owen': 'owen',
                        'cunningham': 'cunningham',
                        'tinsley': 'tinsley',
                        'katch-mcardle': 'katch',
                        'de-lorenzo': 'delorenzo'
                    };
                    setSelectedProtocol(protocolMap[savedCalc.protocol] || 'mifflin');
                }
                if (savedCalc.activities) {
                    setSelectedExercises(savedCalc.activities);
                }
            }

        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível carregar os dados do paciente.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const calculateProtocols = () => {
        const data = {
            weight: parseFloat(weight),
            height: parseFloat(height),
            age: parseInt(age),
            gender: gender,
            leanMass: leanMass ? parseFloat(leanMass) : null
        };

        if (!data.weight || !data.height || !data.age || !data.gender) {
            setProtocols([]);
            return;
        }

        const calculatedProtocols = calculateAllProtocols(data);
        setProtocols(calculatedProtocols);

        const currentProtocol = calculatedProtocols.find(p => p.id === selectedProtocol);
        if (!currentProtocol && calculatedProtocols.length > 0) {
            const recommended = calculatedProtocols.find(p => p.recommended) || calculatedProtocols[0];
            setSelectedProtocol(recommended.id);
            setSelectedProtocolData(recommended);
        } else if (currentProtocol) {
            setSelectedProtocolData(currentProtocol);
        }
    };

    const handleProtocolSelect = (protocol) => {
        setSelectedProtocol(protocol.id);
        setSelectedProtocolData(protocol);
    };

    const handleSave = async () => {
        if (!selectedProtocolData || !weight || !height || !age || !gender) {
            toast({
                title: 'Dados incompletos',
                description: 'Preencha todos os campos obrigatórios.',
                variant: 'destructive'
            });
            return;
        }

        setSaving(true);
        try {
            const protocolMap = {
                'harris': 'harris-benedict',
                'mifflin': 'mifflin-st-jeor',
                'fao': 'fao-who',
                'fao2001': 'fao-oms-2001',
                'schofield': 'schofield',
                'owen': 'owen',
                'cunningham': 'cunningham',
                'tinsley': 'tinsley',
                'katch': 'katch-mcardle',
                'delorenzo': 'de-lorenzo'
            };

            const dataToSave = {
                patient_id: patientId,
                weight: parseFloat(weight),
                height: parseFloat(height),
                age: parseInt(age),
                gender: gender,
                protocol: protocolMap[selectedProtocol] || selectedProtocol,
                activity_level: activityFactor,
                tmb: selectedProtocolData.bmr,
                get: finalGET,
                get_with_activities: goalCalories,
                activities: selectedExercises.length > 0 ? selectedExercises : null,
                updated_at: new Date().toISOString()
            };

            const { data: existing } = await supabase
                .from('energy_expenditure_calculations')
                .select('id')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            let error;
            if (existing) {
                const { error: updateError } = await supabase
                    .from('energy_expenditure_calculations')
                    .update(dataToSave)
                    .eq('id', existing.id);
                error = updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('energy_expenditure_calculations')
                    .insert(dataToSave);
                error = insertError;
            }

            if (error) throw error;

            toast({
                title: 'Salvo!',
                description: 'Planejamento energético salvo com sucesso.'
            });

        } catch (error) {
            console.error('Erro ao salvar:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível salvar o cálculo.',
                variant: 'destructive'
            });
        } finally {
            setSaving(false);
        }
    };

    const getDataSourceBadge = (field) => {
        const source = dataSource[field];
        if (source === 'anthropometry') {
            return <Badge variant="secondary" className="text-xs ml-2"><Database className="w-3 h-3 mr-1" />Auto</Badge>;
        } else if (source === 'profile') {
            return <Badge variant="outline" className="text-xs ml-2"><User className="w-3 h-3 mr-1" />Perfil</Badge>;
        }
        return null;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(-1)}
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold">Gastos Energéticos</h1>
                            <p className="text-sm text-muted-foreground">
                                {patientName}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Layout Principal - 2 Colunas */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* COLUNA ESQUERDA: Entrada de Dados */}
                    <div className="space-y-6">
                        {/* Dados Biológicos */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Calculator className="w-5 h-5" />
                                    Dados Biológicos
                                </CardTitle>
                                <CardDescription>
                                    Informações necessárias para cálculo da TMB
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="weight" className="flex items-center text-sm">
                                            Peso (kg) *
                                            {getDataSourceBadge('weight')}
                                        </Label>
                                        <Input
                                            id="weight"
                                            type="number"
                                            step="0.1"
                                            min="1"
                                            value={weight}
                                            onChange={(e) => {
                                                setWeight(e.target.value);
                                                setDataSource(prev => ({ ...prev, weight: 'manual' }));
                                            }}
                                            placeholder="70.0"
                                            className="h-10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="height" className="flex items-center text-sm">
                                            Altura (cm) *
                                            {getDataSourceBadge('height')}
                                        </Label>
                                        <Input
                                            id="height"
                                            type="number"
                                            step="0.1"
                                            min="50"
                                            value={height}
                                            onChange={(e) => {
                                                setHeight(e.target.value);
                                                setDataSource(prev => ({ ...prev, height: 'manual' }));
                                            }}
                                            placeholder="175.0"
                                            className="h-10"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="age" className="text-sm">Idade (anos) *</Label>
                                        <Input
                                            id="age"
                                            type="number"
                                            min="1"
                                            max="120"
                                            value={age}
                                            onChange={(e) => setAge(e.target.value)}
                                            placeholder="30"
                                            className="h-10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="leanMass" className="flex items-center text-sm">
                                            Massa Magra (kg)
                                            {getDataSourceBadge('leanMass')}
                                        </Label>
                                        <Input
                                            id="leanMass"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            value={leanMass}
                                            onChange={(e) => {
                                                setLeanMass(e.target.value);
                                                setDataSource(prev => ({ ...prev, leanMass: 'manual' }));
                                            }}
                                            placeholder="Opcional"
                                            className="h-10"
                                        />
                                    </div>
                                </div>
                                {leanMass && (
                                    <p className="text-xs text-muted-foreground">
                                        Massa magra desbloqueia protocolos específicos para atletas
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Nível de Atividade */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5" />
                                    Nível de Atividade
                                </CardTitle>
                                <CardDescription>
                                    Selecione o fator de atividade física diária
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ActivityLevelSelector
                                    value={activityFactor}
                                    onChange={setActivityFactor}
                                />
                            </CardContent>
                        </Card>

                        {/* Exercícios Físicos */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Activity className="w-5 h-5" />
                                    Exercícios Físicos
                                </CardTitle>
                                <CardDescription>
                                    Adicione exercícios específicos para cálculo mais preciso
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ExerciseSelector
                                    selectedExercises={selectedExercises}
                                    onExercisesChange={setSelectedExercises}
                                    patientWeight={parseFloat(weight) || 70}
                                />
                            </CardContent>
                        </Card>
                    </div>

                    {/* COLUNA DIREITA: Resultados e Meta */}
                    <div className="space-y-6">
                        {/* Protocolo e GET */}
                        {selectedProtocolData && (
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-lg flex items-center gap-2">
                                                <Target className="w-5 h-5" />
                                                Resultado e Meta
                                            </CardTitle>
                                            <CardDescription>
                                                Configure o protocolo e objetivo calórico
                                            </CardDescription>
                                        </div>
                                        {protocols.length > 1 && (
                                            <ProtocolComparisonModal
                                                protocols={protocols}
                                                activityFactor={activityFactor}
                                                selectedProtocolId={selectedProtocol}
                                                onSelect={handleProtocolSelect}
                                                patientData={{
                                                    weight: parseFloat(weight) || 0,
                                                    height: parseFloat(height) || 0,
                                                    age: parseInt(age) || 0,
                                                    gender: gender || '',
                                                    leanMass: leanMass ? parseFloat(leanMass) : null
                                                }}
                                            />
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {/* Seleção de Protocolo */}
                                    <div className="space-y-2">
                                        <Label htmlFor="protocolSelect" className="text-sm font-medium">
                                            Protocolo de Cálculo
                                        </Label>
                                        <Select
                                            value={selectedProtocol}
                                            onValueChange={(value) => {
                                                const protocol = protocols.find(p => p.id === value);
                                                if (protocol) {
                                                    handleProtocolSelect(protocol);
                                                }
                                            }}
                                        >
                                            <SelectTrigger id="protocolSelect" className="h-10">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {protocols.map((protocol) => (
                                                    <SelectItem key={protocol.id} value={protocol.id}>
                                                        {protocol.name}
                                                        {protocol.recommended && ' ⭐ (Recomendado)'}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* GET Base */}
                                    <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium">Gasto Energético Total (GET)</p>
                                                {selectedProtocolData && (() => {
                                                    const activityInfo = ACTIVITY_FACTORS.find(f => f.value === activityFactor);
                                                    const breakdown = getGETBreakdown(
                                                        selectedProtocolData.bmr,
                                                        activityFactor,
                                                        activityInfo?.label
                                                    );
                                                    return breakdown ? (
                                                        <CalculationInfoTooltip breakdown={breakdown} variant="compact" />
                                                    ) : null;
                                                })()}
                                            </div>
                                        </div>
                                        <div className="flex items-baseline justify-between">
                                            <p className="text-3xl font-bold text-primary">
                                                {Math.round(finalGET)} <span className="text-lg font-normal text-muted-foreground">kcal/dia</span>
                                            </p>
                                            <div className="text-right text-xs text-muted-foreground space-y-0.5">
                                                <p>TMB: {Math.round(selectedProtocolData.bmr)} kcal</p>
                                                <p>NAF: x{activityFactor}</p>
                                                {exerciseCalories > 0 && (
                                                    <p className="text-green-600 font-medium">
                                                        + {Math.round(exerciseCalories)} kcal exercícios
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Ajuste de Objetivo */}
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <Label htmlFor="goalAdjustment" className="text-sm font-medium">
                                                Ajuste de Objetivo
                                            </Label>
                                            <span className={`text-sm font-semibold ${
                                                goalAdjustment > 0 ? 'text-green-600' : 
                                                goalAdjustment < 0 ? 'text-red-600' : 
                                                'text-muted-foreground'
                                            }`}>
                                                {goalAdjustment > 0 ? '+' : ''}{goalAdjustment} kcal
                                            </span>
                                        </div>
                                        {suggestedGoal && goalSuggestionSource && (
                                            <Badge variant="outline" className="text-xs">
                                                💡 Sugestão: {suggestedGoal}
                                            </Badge>
                                        )}
                                        <Slider
                                            id="goalAdjustment"
                                            min={-1000}
                                            max={1000}
                                            step={50}
                                            value={[goalAdjustment]}
                                            onValueChange={(value) => setGoalAdjustment(value[0])}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>Déficit -1000</span>
                                            <span>0</span>
                                            <span>Superávit +1000</span>
                                        </div>
                                    </div>

                                    {/* Meta Final */}
                                    <div className="p-6 bg-primary/10 border-2 border-primary/20 rounded-lg">
                                        <div className="text-center">
                                            <p className="text-sm text-muted-foreground mb-2">Meta Calórica Diária</p>
                                            <p className="text-4xl font-bold text-primary">
                                                {Math.round(goalCalories)} <span className="text-2xl font-normal">kcal</span>
                                            </p>
                                        </div>
                                    </div>

                                    {/* Projeção de Peso */}
                                    <WeightProjectionCard dailyDeficit={goalAdjustment} />

                                    {/* Botão Salvar */}
                                    <Button
                                        onClick={handleSave}
                                        disabled={saving}
                                        size="lg"
                                        className="w-full h-11"
                                    >
                                        {saving ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Salvando...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4 mr-2" />
                                                Salvar Planejamento
                                            </>
                                        )}
                                    </Button>
                                </CardContent>
                            </Card>
                        )}

                        {/* Mensagem quando não há dados */}
                        {!selectedProtocolData && (
                            <Card>
                                <CardContent className="p-8 text-center">
                                    <Info className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                                    <p className="text-sm text-muted-foreground">
                                        Preencha os dados biológicos para calcular o gasto energético
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default EnergyExpenditurePage;
