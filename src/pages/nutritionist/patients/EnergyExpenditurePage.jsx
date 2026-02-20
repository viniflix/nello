import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calculator, Save, Loader2, Target, TrendingUp, Database, User, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { ProtocolComparisonTable } from '@/components/energy';
import ActivityLevelSelector from '@/components/energy/ActivityLevelSelector';
import WeightProjectionCard from '@/components/energy/WeightProjectionCard';
import CalculationInfoTooltip from '@/components/energy/CalculationInfoTooltip';
import { getLatestAnamnesisForEnergy, getActiveGoalForEnergy, logActivityEvent } from '@/lib/supabase/patient-queries';
import { getPatientModuleSyncFlags, clearPatientModuleSyncFlags } from '@/lib/supabase/anthropometry-queries';
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

    // Parâmetros biológicos (com flags de origem)
    const [weight, setWeight] = useState('');
    const [height, setHeight] = useState('');
    const [age, setAge] = useState('');
    const [gender, setGender] = useState('');
    const [leanMass, setLeanMass] = useState('');
    
    // Flags para indicar origem dos dados
    const [dataSource, setDataSource] = useState({
        weight: null, // 'anthropometry' | 'profile' | 'manual'
        height: null,
        leanMass: null
    });

    // Nível de atividade
    const [activityFactor, setActivityFactor] = useState(1.55);

    // Protocolo selecionado
    const [selectedProtocol, setSelectedProtocol] = useState('mifflin');

    // Goal (Deficit/Superavit)
    const [goalAdjustment, setGoalAdjustment] = useState(0); // -1000 to +1000

    // Smart Defaults (sugestões baseadas em anamnese/objetivos)
    const [suggestedActivity, setSuggestedActivity] = useState(null);
    const [suggestedGoal, setSuggestedGoal] = useState(null);
    const [goalSuggestionSource, setGoalSuggestionSource] = useState(null); // 'goal' | null
    const [syncFlags, setSyncFlags] = useState(null);

    // Resultados calculados
    const [protocols, setProtocols] = useState([]);
    const [selectedProtocolData, setSelectedProtocolData] = useState(null);
    const [finalGET, setFinalGET] = useState(0);
    const [goalCalories, setGoalCalories] = useState(0);

    // Carregar dados do paciente (SMART FETCHING)
    useEffect(() => {
        loadPatientData();
    }, [patientId]);

    // Calcular protocolos quando dados mudarem
    useEffect(() => {
        if (weight && height && age && gender) {
            calculateProtocols();
        }
    }, [weight, height, age, gender, leanMass]);

    // Atualizar GET final quando protocolo ou atividade mudar
    useEffect(() => {
        if (selectedProtocolData) {
            const get = calculateGET(selectedProtocolData.bmr, activityFactor);
            setFinalGET(get);
            setGoalCalories(get + goalAdjustment);
        }
    }, [selectedProtocolData, activityFactor, goalAdjustment]);

    const loadPatientData = async () => {
        setLoading(true);
        try {
            let hasActivitySuggestion = false;
            let hasGoalSuggestion = false;

            // 1. Buscar perfil do paciente
            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('name, birth_date, gender, weight, height')
                .eq('id', patientId)
                .single();

            if (profileError) throw profileError;

            setPatientName(profile.name || 'Paciente');
            setGender(profile.gender || '');

            // Calcular idade
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

            // 2. Buscar último registro de ANTROPOMETRIA (prioridade)
            let latestAnthropometry = null;
            {
                const { data, error } = await supabase
                    .from('growth_records')
                    .select('weight, height, results, record_date')
                    .eq('patient_id', patientId)
                    .eq('is_latest_revision', true)
                    .order('record_date', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (!error) {
                    latestAnthropometry = data;
                } else {
                    const fallback = await supabase
                        .from('growth_records')
                        .select('weight, height, results, record_date')
                        .eq('patient_id', patientId)
                        .order('record_date', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    latestAnthropometry = fallback.data || null;
                }
            }

            // Lógica: Antropometria > Perfil > Vazio
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

            // Massa magra apenas de antropometria
            if (latestAnthropometry?.results?.lean_mass_kg) {
                setLeanMass(latestAnthropometry.results.lean_mass_kg.toString());
                setDataSource(prev => ({ ...prev, leanMass: 'anthropometry' }));
            }

            // 3. Buscar anamnese e objetivos para smart defaults
            const [anamnesisResult, goalResult] = await Promise.all([
                getLatestAnamnesisForEnergy(patientId),
                getActiveGoalForEnergy(patientId)
            ]);

            // 4. Auto-selecionar atividade baseado em anamnese
            if (anamnesisResult.data?.exerciseFrequency) {
                const freq = anamnesisResult.data.exerciseFrequency.toString().toLowerCase();
                
                // Mapear frequência de exercício para fator de atividade
                if (freq.includes('sedent') || freq.includes('não') || freq.includes('nao') || freq === '0') {
                    setActivityFactor(1.2);
                    setSuggestedActivity('Sedentário (baseado na anamnese)');
                    hasActivitySuggestion = true;
                } else if (freq.includes('1-3') || freq.includes('1 a 3') || freq.includes('leve')) {
                    setActivityFactor(1.375);
                    setSuggestedActivity('Levemente Ativo (baseado na anamnese)');
                    hasActivitySuggestion = true;
                } else if (freq.includes('3-5') || freq.includes('3 a 5') || freq.includes('moder')) {
                    setActivityFactor(1.55);
                    setSuggestedActivity('Moderadamente Ativo (baseado na anamnese)');
                    hasActivitySuggestion = true;
                } else if (freq.includes('6-7') || freq.includes('6 a 7') || freq.includes('muito')) {
                    setActivityFactor(1.725);
                    setSuggestedActivity('Muito Ativo (baseado na anamnese)');
                    hasActivitySuggestion = true;
                } else if (freq.includes('2x') || freq.includes('duas') || freq.includes('extremo')) {
                    setActivityFactor(1.9);
                    setSuggestedActivity('Extremamente Ativo (baseado na anamnese)');
                    hasActivitySuggestion = true;
                }
            }

            // 5. Auto-ajustar objetivo calórico baseado em meta ativa
            if (goalResult.data) {
                const goalType = (goalResult.data.goal_type || goalResult.data.type || '').toLowerCase();
                
                if (goalType === 'weight_loss' || goalType === 'perda_peso' || goalType === 'emagrecimento') {
                    setGoalAdjustment(-500);
                    setSuggestedGoal('Perda de Peso');
                    setGoalSuggestionSource('goal');
                    hasGoalSuggestion = true;
                } else if (goalType === 'hypertrophy' || goalType === 'hipertrofia' || goalType === 'ganho_massa') {
                    setGoalAdjustment(300);
                    setSuggestedGoal('Hipertrofia');
                    setGoalSuggestionSource('goal');
                    hasGoalSuggestion = true;
                } else if (goalType === 'maintenance' || goalType === 'manutencao') {
                    setGoalAdjustment(0);
                    setSuggestedGoal('Manutenção');
                    setGoalSuggestionSource('goal');
                    hasGoalSuggestion = true;
                }
            }

            // 6. Buscar cálculo salvo anteriormente (sobrescreve apenas se não houver sugestões)
            const { data: savedCalc } = await supabase
                .from('energy_expenditure_calculations')
                .select('*')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (savedCalc) {
                // Só aplicar se não tivermos sugestão de atividade
                if (!hasActivitySuggestion) {
                    setActivityFactor(parseFloat(savedCalc.activity_level) || 1.55);
                }
                // Só aplicar se não tivermos sugestão de objetivo
                if (!hasGoalSuggestion && savedCalc.get_with_activities && savedCalc.get) {
                    setGoalAdjustment(savedCalc.get_with_activities - savedCalc.get);
                }
                // Restaurar protocolo (sempre)
                if (savedCalc.protocol) {
                    const protocolMap = {
                        'harris-benedict': 'harris',
                        'mifflin-st-jeor': 'mifflin',
                        'fao-who': 'fao',
                        'harris': 'harris',
                        'mifflin': 'mifflin',
                        'fao': 'fao',
                        'cunningham': 'cunningham',
                        'tinsley': 'tinsley'
                    };
                    setSelectedProtocol(protocolMap[savedCalc.protocol] || 'mifflin');
                }
            }

            const { data: flagsData } = await getPatientModuleSyncFlags(patientId);
            setSyncFlags(flagsData || null);

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

        // Atualizar protocolo selecionado
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
                'cunningham': 'cunningham',
                'tinsley': 'tinsley'
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
                updated_at: new Date().toISOString()
            };

            // Verificar se já existe um registro
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

            await logActivityEvent({
                eventName: existing ? 'energy.calculation.updated' : 'energy.calculation.created',
                sourceModule: 'energy',
                patientId,
                payload: {
                    protocol: dataToSave.protocol,
                    activity_level: dataToSave.activity_level,
                    get: dataToSave.get,
                    get_with_activities: dataToSave.get_with_activities
                }
            });

            const { error: clearError } = await clearPatientModuleSyncFlags(patientId, { energy: true });
            if (clearError) {
                console.warn('Não foi possível limpar flag de energia automaticamente:', clearError);
            } else {
                setSyncFlags((prev) => ({ ...(prev || {}), needs_energy_recalc: false }));
            }

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

    const formatSyncUpdateTime = (isoDate) => {
        if (!isoDate) return null;
        const date = new Date(isoDate);
        if (Number.isNaN(date.getTime())) return null;

        const diffMs = Date.now() - date.getTime();
        if (diffMs < 0) return `atualizado em ${date.toLocaleString('pt-BR')}`;

        const minutes = Math.floor(diffMs / 60000);
        if (minutes < 1) return 'atualizado agora';
        if (minutes < 60) return `atualizado há ${minutes} min`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `atualizado há ${hours}h`;

        const days = Math.floor(hours / 24);
        if (days <= 7) return `atualizado há ${days} dia${days > 1 ? 's' : ''}`;

        return `atualizado em ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    };

    const handleMarkEnergyAsReviewed = async () => {
        const { error } = await clearPatientModuleSyncFlags(patientId, { energy: true });
        if (error) {
            toast({
                title: 'Não foi possível marcar como revisado',
                description: 'Tente novamente em instantes.',
                variant: 'destructive'
            });
            return;
        }

        setSyncFlags((prev) => ({ ...(prev || {}), needs_energy_recalc: false }));
        toast({
            title: 'Pendência removida',
            description: 'O módulo de GET foi marcado como revisado.',
            variant: 'success'
        });
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
        <div className="min-h-screen bg-background overflow-x-hidden">
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 min-w-0">
                {/* Header */}
                <div className="flex items-center gap-2 md:gap-4 mb-6 min-w-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(-1)}
                        className="shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="min-w-0">
                        <h1 className="text-2xl md:text-3xl font-bold break-words">Centro de Controle Metabólico</h1>
                        <p className="text-muted-foreground text-sm md:text-base truncate">
                            {patientName} - Análise e Planejamento Energético
                        </p>
                    </div>
                </div>

                {syncFlags?.needs_energy_recalc && (
                    <Alert className="mb-6 border-amber-200 bg-amber-50">
                        <AlertCircle className="h-4 w-4 text-amber-700" />
                        <AlertDescription className="text-amber-800">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p>A antropometria foi atualizada recentemente. Recomendamos revisar/recalcular o GET e salvar.</p>
                                    {syncFlags?.anthropometry_updated_at && (
                                        <p className="mt-1 text-xs text-amber-700/90">
                                            {formatSyncUpdateTime(syncFlags.anthropometry_updated_at)}
                                        </p>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                                        onClick={loadPatientData}
                                    >
                                        Atualizar dados
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="text-amber-900 hover:bg-amber-100"
                                        onClick={handleMarkEnergyAsReviewed}
                                    >
                                        Marcar como revisado
                                    </Button>
                                </div>
                            </div>
                        </AlertDescription>
                    </Alert>
                )}

                {/* Split View Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* LEFT COLUMN: Parameters */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Dados Biológicos */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Calculator className="w-5 h-5" />
                                    Dados Biológicos
                                </CardTitle>
                                <CardDescription>
                                    Parâmetros para cálculo da TMB
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="weight" className="flex items-center">
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
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="height" className="flex items-center">
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
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="age">Idade (anos) *</Label>
                                    <Input
                                        id="age"
                                        type="number"
                                        min="1"
                                        max="120"
                                        value={age}
                                        onChange={(e) => setAge(e.target.value)}
                                        placeholder="30"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="gender">Sexo *</Label>
                                    <Select value={gender || ''} onValueChange={setGender}>
                                        <SelectTrigger id="gender">
                                            <SelectValue placeholder="Selecione o sexo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="female">Feminino</SelectItem>
                                            <SelectItem value="male">Masculino</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="leanMass" className="flex items-center">
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
                                        placeholder="Opcional - Desbloqueia protocolos de atleta"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {dataSource.leanMass === 'anthropometry' 
                                            ? 'Valor obtido do último registro de antropometria.'
                                            : 'Preencha para habilitar protocolos Cunningham e Tinsley.'}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Nível de Atividade */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5" />
                                    Nível de Atividade
                                </CardTitle>
                                <CardDescription>
                                    Selecione o fator de atividade física
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ActivityLevelSelector
                                    value={activityFactor}
                                    onChange={setActivityFactor}
                                />
                            </CardContent>
                        </Card>
                    </div>

                    {/* RIGHT COLUMN: The Lab & Strategy */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Comparativo Científico */}
                        {protocols.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Comparativo Científico</CardTitle>
                                    <CardDescription>
                                        Compare diferentes fórmulas de cálculo de TMB
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ProtocolComparisonTable
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
                                </CardContent>
                            </Card>
                        )}

                        {/* Definição de Meta */}
                        {selectedProtocolData && (
                            <Card className="sticky top-6">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Target className="w-5 h-5" />
                                        Definição de Meta
                                    </CardTitle>
                                    <CardDescription>
                                        Configure o objetivo calórico final
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {/* Protocolo Base */}
                                    <div className="space-y-2">
                                        <Label htmlFor="protocolSelect">Protocolo Base</Label>
                                        <Select
                                            value={selectedProtocol}
                                            onValueChange={(value) => {
                                                const protocol = protocols.find(p => p.id === value);
                                                if (protocol) {
                                                    handleProtocolSelect(protocol);
                                                }
                                            }}
                                        >
                                            <SelectTrigger id="protocolSelect">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {protocols.map((protocol) => (
                                                    <SelectItem key={protocol.id} value={protocol.id}>
                                                        {protocol.name}
                                                        {protocol.recommended && ' (Recomendado)'}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* GET Base */}
                                    <div className="p-4 bg-muted/50 rounded-lg">
                                        <div className="flex justify-between items-center">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm text-muted-foreground">Gasto Energético Total (GET)</p>
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
                                                <p className="text-2xl font-bold text-primary mt-1">
                                                    {Math.round(finalGET)} <span className="text-base font-normal">kcal/dia</span>
                                                </p>
                                            </div>
                                            <div className="text-right text-sm text-muted-foreground">
                                                <p>TMB: {Math.round(selectedProtocolData.bmr)} kcal</p>
                                                <p>NAF: x{activityFactor}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Slider VET Alvo */}
                                    <div className="space-y-4">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex justify-between items-center">
                                                <Label htmlFor="goalAdjustment">Ajuste de Objetivo (Déficit/Superávit)</Label>
                                                <span className={`text-sm font-semibold ${
                                                    goalAdjustment > 0 ? 'text-green-600' : 
                                                    goalAdjustment < 0 ? 'text-red-600' : 
                                                    'text-muted-foreground'
                                                }`}>
                                                    {goalAdjustment > 0 ? '+' : ''}{goalAdjustment} kcal
                                                </span>
                                            </div>
                                            {suggestedGoal && goalSuggestionSource && (
                                                <Badge variant="outline" className="self-start text-xs">
                                                    💡 Sugestão baseada no objetivo: <strong>{suggestedGoal}</strong>
                                                </Badge>
                                            )}
                                        </div>
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
                                            <span>Equilíbrio 0</span>
                                            <span>Superávit +1000</span>
                                        </div>
                                    </div>

                                    {/* Meta Final (BIG NUMBER) */}
                                    <div className="p-6 bg-primary/10 border-2 border-primary/20 rounded-lg">
                                        <div className="text-center">
                                            <p className="text-sm text-muted-foreground mb-2">Meta da Dieta</p>
                                            <p className="text-5xl font-bold text-primary">
                                                {Math.round(goalCalories)} <span className="text-3xl font-normal">kcal</span>
                                            </p>
                                            <p className="text-sm text-muted-foreground mt-2">por dia</p>
                                        </div>
                                    </div>

                                    {/* Weight Projection Card */}
                                    <WeightProjectionCard dailyDeficit={goalAdjustment} />

                                    {/* Floating Action Button */}
                                    <Button
                                        onClick={handleSave}
                                        disabled={saving}
                                        size="lg"
                                        className="w-full"
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
                    </div>
                </div>
            </main>
        </div>
    );
};

export default EnergyExpenditurePage;
