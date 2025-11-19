import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calculator, Flame, Activity, Save, RefreshCw, Plus, Edit, Trash2, X, Printer, History, TrendingUp, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// ====================== MET VALUES (Metabolic Equivalent of Task) ======================
const MET_ACTIVITIES = [
    { value: 'walking-light', label: 'Caminhada Leve', met: 3.5 },
    { value: 'walking-moderate', label: 'Caminhada Moderada', met: 4.5 },
    { value: 'running-light', label: 'Corrida Leve', met: 7.0 },
    { value: 'running-moderate', label: 'Corrida Moderada', met: 9.0 },
    { value: 'swimming', label: 'Natação', met: 6.0 },
    { value: 'cycling-light', label: 'Ciclismo Leve', met: 5.0 },
    { value: 'cycling-moderate', label: 'Ciclismo Moderado', met: 8.0 },
    { value: 'weight-training', label: 'Musculação', met: 5.0 },
    { value: 'yoga', label: 'Yoga', met: 2.5 },
    { value: 'pilates', label: 'Pilates', met: 3.0 },
    { value: 'dance', label: 'Dança', met: 4.5 },
    { value: 'soccer', label: 'Futebol', met: 7.0 },
    { value: 'basketball', label: 'Basquete', met: 6.5 },
    { value: 'tennis', label: 'Tênis', met: 7.0 },
    { value: 'volleyball', label: 'Vôlei', met: 4.0 },
    { value: 'other', label: 'Outra Atividade', met: 5.0 }
];

// ====================== ACTIVITY MODAL COMPONENT ======================
const ActivityModal = ({ isOpen, onClose, onSave, activity, patientWeight }) => {
    const [formData, setFormData] = useState({
        activity_type: '',
        duration: '',
        frequency: '',
        custom_name: ''
    });

    useEffect(() => {
        if (activity) {
            setFormData({
                activity_type: activity.activity_type,
                duration: activity.duration?.toString() || '',
                frequency: activity.frequency?.toString() || '',
                custom_name: activity.custom_name || ''
            });
        } else {
            setFormData({
                activity_type: '',
                duration: '',
                frequency: '',
                custom_name: ''
            });
        }
    }, [activity, isOpen]);

    const selectedActivity = MET_ACTIVITIES.find(a => a.value === formData.activity_type);

    // Cálculo: Calorias = MET × peso_kg × (duração_minutos / 60) × frequência_semanal
    const calculateCalories = () => {
        if (!selectedActivity || !formData.duration || !formData.frequency || !patientWeight) return 0;
        const durationHours = parseFloat(formData.duration) / 60;
        const met = selectedActivity.met;
        const weight = parseFloat(patientWeight);
        const frequency = parseInt(formData.frequency);

        // Calorias por sessão × frequência semanal / 7 dias
        const caloriesPerSession = met * weight * durationHours;
        const dailyCalories = (caloriesPerSession * frequency) / 7;

        return Math.round(dailyCalories);
    };

    const handleSave = () => {
        if (!formData.activity_type || !formData.duration || !formData.frequency) {
            return;
        }

        onSave({
            ...activity,
            activity_type: formData.activity_type,
            duration: parseInt(formData.duration),
            frequency: parseInt(formData.frequency),
            custom_name: formData.custom_name,
            calories: calculateCalories()
        });

        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{activity ? 'Editar Atividade' : 'Adicionar Atividade Física'}</DialogTitle>
                    <DialogDescription>
                        Adicione as atividades físicas praticadas pelo paciente para um cálculo mais preciso.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Tipo de Atividade */}
                    <div className="space-y-2">
                        <Label htmlFor="activity-type">Atividade</Label>
                        <Select
                            value={formData.activity_type}
                            onValueChange={(value) => setFormData({ ...formData, activity_type: value })}
                        >
                            <SelectTrigger id="activity-type">
                                <SelectValue placeholder="Selecione a atividade..." />
                            </SelectTrigger>
                            <SelectContent>
                                {MET_ACTIVITIES.map((act) => (
                                    <SelectItem key={act.value} value={act.value}>
                                        {act.label} ({act.met} MET)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Nome Personalizado (se "Outra Atividade") */}
                    {formData.activity_type === 'other' && (
                        <div className="space-y-2">
                            <Label htmlFor="custom-name">Nome da Atividade</Label>
                            <Input
                                id="custom-name"
                                value={formData.custom_name}
                                onChange={(e) => setFormData({ ...formData, custom_name: e.target.value })}
                                placeholder="Ex: Crossfit"
                            />
                        </div>
                    )}

                    {/* Duração */}
                    <div className="space-y-2">
                        <Label htmlFor="duration">Duração por Sessão (minutos)</Label>
                        <Input
                            id="duration"
                            type="number"
                            min="1"
                            max="360"
                            value={formData.duration}
                            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                            placeholder="60"
                        />
                    </div>

                    {/* Frequência Semanal */}
                    <div className="space-y-2">
                        <Label htmlFor="frequency">Frequência (vezes por semana)</Label>
                        <Input
                            id="frequency"
                            type="number"
                            min="1"
                            max="7"
                            value={formData.frequency}
                            onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                            placeholder="3"
                        />
                    </div>

                    {/* Preview do Cálculo */}
                    {formData.activity_type && formData.duration && formData.frequency && (
                        <div className="p-3 bg-muted rounded-lg">
                            <p className="text-sm text-muted-foreground mb-1">Gasto estimado:</p>
                            <p className="text-2xl font-bold text-primary">
                                +{calculateCalories()} <span className="text-sm font-normal">kcal/dia</span>
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                (média diária considerando {formData.frequency}x por semana)
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!formData.activity_type || !formData.duration || !formData.frequency}
                    >
                        Salvar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// ====================== COMPARISON MODAL COMPONENT (FASE 3) ======================
const ComparisonModal = ({ isOpen, onClose, comparisons }) => {
    if (!comparisons || comparisons.length === 0) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GitCompare className="w-5 h-5 text-primary" />
                        Comparação de Protocolos
                    </DialogTitle>
                    <DialogDescription>
                        Comparando {comparisons.length} protocolos diferentes com os mesmos dados antropométricos
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    {comparisons.map((comp, index) => (
                        <div
                            key={comp.protocol}
                            className="p-4 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h4 className="font-semibold text-foreground">{comp.protocolName}</h4>
                                    <p className="text-xs text-muted-foreground">{comp.protocol}</p>
                                </div>
                                {index === 0 && (
                                    <Badge variant="outline" className="text-xs">
                                        Mais utilizado
                                    </Badge>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {!comp.protocol.startsWith('eer-iom') && (
                                    <div className="text-center p-2 bg-background rounded border border-[#c4661f]/30">
                                        <div className="text-sm text-muted-foreground mb-1">TMB</div>
                                        <div className="text-xl font-bold text-[#c4661f]">{comp.tmb}</div>
                                        <div className="text-xs text-muted-foreground">kcal/dia</div>
                                    </div>
                                )}
                                <div className={`text-center p-2 bg-gradient-to-br from-[#5f6f52]/10 to-[#a9b388]/10 rounded border border-[#5f6f52]/30 ${comp.protocol.startsWith('eer-iom') ? 'col-span-2' : ''}`}>
                                    <div className="text-sm text-muted-foreground mb-1">
                                        {comp.protocol.startsWith('eer-iom') ? 'EER' : 'GET'}
                                    </div>
                                    <div className="text-xl font-bold text-[#5f6f52]">{comp.get}</div>
                                    <div className="text-xs text-muted-foreground">kcal/dia</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-900">
                        <strong>Nota:</strong> As diferenças entre protocolos são normais. Escolha o protocolo
                        mais adequado ao perfil do paciente e suas necessidades clínicas.
                    </p>
                </div>

                <DialogFooter>
                    <Button onClick={onClose} variant="outline">Fechar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// ====================== HISTORY CHART COMPONENT (FASE 3) ======================
const HistoryChart = ({ historyData }) => {
    if (!historyData || historyData.length === 0) return null;

    // Preparar dados para o gráfico (últimos 10 registros, ordem cronológica)
    const chartData = historyData
        .slice(0, 10)
        .reverse()
        .map(item => ({
            date: new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
            GET: Math.round(item.get_with_activities || item.get || 0),
            TMB: Math.round(item.tmb || 0),
            fullDate: new Date(item.created_at).toLocaleDateString('pt-BR')
        }));

    return (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Evolução do Gasto Energético
                </CardTitle>
                <CardDescription>
                    Histórico dos últimos {chartData.length} cálculos realizados
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                            dataKey="date"
                            stroke="#6b7280"
                            fontSize={12}
                        />
                        <YAxis
                            stroke="#6b7280"
                            fontSize={12}
                            label={{ value: 'kcal/dia', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#ffffff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                fontSize: '12px'
                            }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Line
                            type="monotone"
                            dataKey="TMB"
                            stroke="#c4661f"
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            name="TMB (kcal)"
                        />
                        <Line
                            type="monotone"
                            dataKey="GET"
                            stroke="#5f6f52"
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            name="GET (kcal)"
                        />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

// ====================== MAIN COMPONENT ======================
const EnergyExpenditurePage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [patientName, setPatientName] = useState('');

    // Dados do formulário
    const [formData, setFormData] = useState({
        weight: '',
        height: '',
        age: '',
        gender: '',
        birth_date: '',
        protocol: 'harris-benedict',
        activity_level: '1.55'
    });

    // Atividades Físicas
    const [activities, setActivities] = useState([]);
    const [activityModalOpen, setActivityModalOpen] = useState(false);
    const [editingActivity, setEditingActivity] = useState(null);

    // VENTA
    const [ventaEnabled, setVentaEnabled] = useState(false);
    const [targetWeight, setTargetWeight] = useState('');

    // Resultados
    const [results, setResults] = useState({
        tmb: 0,
        get: 0,
        getWithActivities: 0,
        ventaAdjusted: 0
    });

    // FASE 3: Histórico e Comparações
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [compareModalOpen, setCompareModalOpen] = useState(false);
    const [comparisonResults, setComparisonResults] = useState([]);

    useEffect(() => {
        loadPatientData();
        loadHistory();
    }, [patientId]);

    // CÁLCULO AUTOMÁTICO EM TEMPO REAL
    useEffect(() => {
        // Só calcular se tiver os dados mínimos
        if (formData.weight && formData.height && formData.age && formData.gender && formData.protocol) {
            const tmb = calculateTMB();
            const get = calculateGET(tmb, formData.activity_level);
            const activitiesCalories = calculateActivitiesCalories();
            const getWithActivities = get + activitiesCalories;

            let ventaAdjusted = 0;
            if (ventaEnabled && targetWeight && formData.weight) {
                ventaAdjusted = calculateVENTA(getWithActivities, formData.weight, targetWeight);
            }

            setResults({ tmb, get, getWithActivities, ventaAdjusted });
        }
    }, [formData, activities, ventaEnabled, targetWeight]);

    const loadPatientData = async () => {
        setLoading(true);
        try {
            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('name, birth_date, gender, weight, height')
                .eq('id', patientId)
                .single();

            if (profileError) throw profileError;

            setPatientName(profile.name);

            const { data: latestRecord } = await supabase
                .from('growth_records')
                .select('weight, height, record_date')
                .eq('patient_id', patientId)
                .order('record_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            const age = calculateAge(profile.birth_date);

            setFormData({
                weight: (latestRecord?.weight || profile.weight || '').toString(),
                height: (latestRecord?.height || profile.height || '').toString(),
                age: age?.toString() || '',
                gender: profile.gender || '',
                birth_date: profile.birth_date || '',
                protocol: 'harris-benedict',
                activity_level: '1.55'
            });

            // Buscar cálculo salvo
            const { data: savedCalc } = await supabase
                .from('energy_expenditure_calculations')
                .select('*')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: false})
                .limit(1)
                .maybeSingle();

            if (savedCalc) {
                setFormData({
                    weight: savedCalc.weight?.toString() || '',
                    height: savedCalc.height?.toString() || '',
                    age: savedCalc.age?.toString() || '',
                    gender: savedCalc.gender || '',
                    birth_date: profile.birth_date || '',
                    protocol: savedCalc.protocol || 'harris-benedict',
                    activity_level: savedCalc.activity_level || '1.55'
                });

                setResults({
                    tmb: savedCalc.tmb || 0,
                    get: savedCalc.get || 0,
                    getWithActivities: savedCalc.get_with_activities || savedCalc.get || 0,
                    ventaAdjusted: savedCalc.venta_adjusted || 0
                });

                if (savedCalc.activities && Array.isArray(savedCalc.activities)) {
                    setActivities(savedCalc.activities);
                }

                if (savedCalc.target_weight) {
                    setVentaEnabled(true);
                    setTargetWeight(savedCalc.target_weight.toString());
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

    const calculateAge = (birthDate) => {
        if (!birthDate) return null;
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    // ========== FASE 3: HISTÓRICO E EXPORTAÇÃO ==========

    const loadHistory = async () => {
        try {
            const { data, error } = await supabase
                .from('energy_expenditure_calculations')
                .select('*')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;
            setHistory(data || []);
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const loadHistoryCalculation = (calc) => {
        setFormData({
            weight: calc.weight?.toString() || '',
            height: calc.height?.toString() || '',
            age: calc.age?.toString() || '',
            gender: calc.gender || '',
            birth_date: formData.birth_date,
            protocol: calc.protocol || 'harris-benedict',
            activity_level: calc.activity_level || '1.55'
        });

        setResults({
            tmb: calc.tmb || 0,
            get: calc.get || 0,
            getWithActivities: calc.get_with_activities || calc.get || 0,
            ventaAdjusted: calc.venta_adjusted || 0
        });

        if (calc.activities && Array.isArray(calc.activities)) {
            setActivities(calc.activities);
        } else {
            setActivities([]);
        }

        if (calc.target_weight) {
            setVentaEnabled(true);
            setTargetWeight(calc.target_weight.toString());
        } else {
            setVentaEnabled(false);
            setTargetWeight('');
        }

        setShowHistory(false);
        toast({
            title: 'Cálculo carregado',
            description: `Cálculo de ${new Date(calc.created_at).toLocaleDateString('pt-BR')}`
        });
    };

    const handleCompareProtocols = () => {
        if (!formData.weight || !formData.height || !formData.age || !formData.gender) {
            toast({
                title: 'Dados incompletos',
                description: 'Preencha todos os campos básicos para comparar protocolos.',
                variant: 'destructive'
            });
            return;
        }

        const protocols = ['harris-benedict', 'schofield', 'fao-oms-2001', 'fao-oms-1985', 'eer-iom-2023', 'eer-iom-2005'];
        const comparisons = [];

        protocols.forEach(protocol => {
            const tmb = calculateTMB(formData.weight, formData.height, formData.age, formData.gender, protocol);
            const get = protocol.startsWith('eer-iom')
                ? tmb
                : tmb * parseFloat(formData.activity_level);

            comparisons.push({
                protocol: protocol,
                protocolName: getProtocolName(protocol),
                tmb: Math.round(tmb),
                get: Math.round(get)
            });
        });

        setComparisonResults(comparisons);
        setCompareModalOpen(true);
    };

    const getProtocolName = (protocol) => {
        const names = {
            'harris-benedict': 'Harris-Benedict',
            'schofield': 'Schofield (1985)',
            'fao-oms-2001': 'FAO/OMS (2001)',
            'fao-oms-1985': 'FAO/OMS (1985)',
            'eer-iom-2023': 'EER/IOM (2023)',
            'eer-iom-2005': 'EER/IOM (2005)',
            'eer-iom-2005-sobrepeso': 'EER/IOM (2005) Sobrepeso'
        };
        return names[protocol] || protocol;
    };

    // ========== FÓRMULAS DE CÁLCULO ==========

    // Harris-Benedict (1984 revisado)
    const calculateTMB_HarrisBenedict = (weight, height, age, gender) => {
        const w = parseFloat(weight);
        const h = parseFloat(height);
        const a = parseInt(age);

        if (gender.toLowerCase() === 'masculino' || gender.toLowerCase() === 'male' || gender.toLowerCase() === 'm') {
            return 88.362 + (13.397 * w) + (4.799 * h) - (5.677 * a);
        } else {
            return 447.593 + (9.247 * w) + (3.098 * h) - (4.330 * a);
        }
    };

    // Schofield (1985)
    const calculateTMB_Schofield = (weight, age, gender) => {
        const w = parseFloat(weight);
        const a = parseInt(age);
        const isMale = gender.toLowerCase() === 'masculino' || gender.toLowerCase() === 'male' || gender.toLowerCase() === 'm';

        if (isMale) {
            if (a < 3) return 59.512 * w - 30.4;
            if (a >= 3 && a < 10) return 22.706 * w + 504.3;
            if (a >= 10 && a < 18) return 17.686 * w + 658.2;
            if (a >= 18 && a < 30) return 15.057 * w + 692.2;
            if (a >= 30 && a < 60) return 11.472 * w + 873.1;
            return 11.711 * w + 587.7;
        } else {
            if (a < 3) return 58.317 * w - 31.1;
            if (a >= 3 && a < 10) return 20.315 * w + 485.9;
            if (a >= 10 && a < 18) return 13.384 * w + 692.6;
            if (a >= 18 && a < 30) return 14.818 * w + 486.6;
            if (a >= 30 && a < 60) return 8.126 * w + 845.6;
            return 9.082 * w + 658.5;
        }
    };

    // FAO/OMS 2001
    const calculateTMB_FAO2001 = (weight, height, age, gender) => {
        const w = parseFloat(weight);
        const h = parseFloat(height) / 100;
        const a = parseInt(age);
        const isMale = gender.toLowerCase() === 'masculino' || gender.toLowerCase() === 'male' || gender.toLowerCase() === 'm';

        if (isMale) {
            if (a >= 18 && a < 30) return 15.4 * w - 27 * h + 717;
            if (a >= 30 && a < 60) return 11.3 * w + 16 * h + 901;
            return 8.8 * w + 1128 * h - 1071;
        } else {
            if (a >= 18 && a < 30) return 13.3 * w + 334 * h + 35;
            if (a >= 30 && a < 60) return 8.7 * w - 25 * h + 865;
            return 9.2 * w + 637 * h - 302;
        }
    };

    // FAO/OMS 1985 (fórmulas simplificadas por faixa etária)
    const calculateTMB_FAO1985 = (weight, height, age, gender) => {
        const w = parseFloat(weight);
        const h = parseFloat(height) / 100;
        const a = parseInt(age);
        const isMale = gender.toLowerCase() === 'masculino' || gender.toLowerCase() === 'male' || gender.toLowerCase() === 'm';

        if (isMale) {
            if (a >= 18 && a < 30) return 15.3 * w + 679;
            if (a >= 30 && a < 60) return 11.6 * w + 879;
            return 13.5 * w + 487;
        } else {
            if (a >= 18 && a < 30) return 14.7 * w + 496;
            if (a >= 30 && a < 60) return 8.7 * w + 829;
            return 10.5 * w + 596;
        }
    };

    // EER/IOM 2005 (Estimated Energy Requirement)
    const calculateEER_IOM2005 = (weight, height, age, gender, activityLevel) => {
        const w = parseFloat(weight);
        const h = parseFloat(height) / 100;
        const a = parseInt(age);
        const pa = parseFloat(activityLevel);
        const isMale = gender.toLowerCase() === 'masculino' || gender.toLowerCase() === 'male' || gender.toLowerCase() === 'm';

        // EER já inclui atividade física
        if (isMale) {
            return 662 - (9.53 * a) + pa * ((15.91 * w) + (539.6 * h));
        } else {
            return 354 - (6.91 * a) + pa * ((9.36 * w) + (726 * h));
        }
    };

    // EER/IOM 2005 para Sobrepeso (ajustado)
    const calculateEER_IOM2005_Overweight = (weight, height, age, gender, activityLevel) => {
        const eer = calculateEER_IOM2005(weight, height, age, gender, activityLevel);
        return eer * 0.9; // 10% de redução para sobrepeso
    };

    // EER/IOM 2023 (atualizado - usa coeficientes revisados)
    const calculateEER_IOM2023 = (weight, height, age, gender, activityLevel) => {
        const w = parseFloat(weight);
        const h = parseFloat(height) / 100;
        const a = parseInt(age);
        const pa = parseFloat(activityLevel);
        const isMale = gender.toLowerCase() === 'masculino' || gender.toLowerCase() === 'male' || gender.toLowerCase() === 'm';

        if (isMale) {
            return 693 - (9.8 * a) + pa * ((16.2 * w) + (545 * h));
        } else {
            return 378 - (7.1 * a) + pa * ((9.5 * w) + (732 * h));
        }
    };

    const calculateTMB = () => {
        const { weight, height, age, gender, protocol, activity_level } = formData;

        if (!weight || !height || !age || !gender) {
            return 0;
        }

        // EER protocolos retornam direto GET (já incluem atividade)
        if (protocol.startsWith('eer-iom')) {
            switch (protocol) {
                case 'eer-iom-2023':
                    return calculateEER_IOM2023(weight, height, age, gender, activity_level);
                case 'eer-iom-2005':
                    return calculateEER_IOM2005(weight, height, age, gender, activity_level);
                case 'eer-iom-2005-overweight':
                    return calculateEER_IOM2005_Overweight(weight, height, age, gender, activity_level);
                default:
                    return 0;
            }
        }

        // Outros protocolos calculam TMB
        switch (protocol) {
            case 'harris-benedict':
                return calculateTMB_HarrisBenedict(weight, height, age, gender);
            case 'schofield':
                return calculateTMB_Schofield(weight, age, gender);
            case 'fao-oms-2001':
                return calculateTMB_FAO2001(weight, height, age, gender);
            case 'fao-oms-1985':
                return calculateTMB_FAO1985(weight, height, age, gender);
            default:
                return 0;
        }
    };

    const calculateGET = (tmb, activityLevel) => {
        // EER protocols já retornam GET diretamente
        if (formData.protocol.startsWith('eer-iom')) {
            return tmb;
        }
        return tmb * parseFloat(activityLevel);
    };

    const calculateActivitiesCalories = () => {
        return activities.reduce((sum, activity) => sum + (activity.calories || 0), 0);
    };

    const calculateVENTA = (get, currentWeight, targetWeight) => {
        const current = parseFloat(currentWeight);
        const target = parseFloat(targetWeight);
        const weightDiff = current - target;

        // 7700 kcal por kg de gordura
        const caloriesPerKg = 7700;
        const dailyAdjustment = (weightDiff * caloriesPerKg) / 90; // 90 dias

        return get - dailyAdjustment;
    };

    const handleCalculate = () => {
        const tmb = calculateTMB();
        const get = calculateGET(tmb, formData.activity_level);
        const activitiesCalories = calculateActivitiesCalories();
        const getWithActivities = get + activitiesCalories;

        let ventaAdjusted = 0;
        if (ventaEnabled && targetWeight && formData.weight) {
            ventaAdjusted = calculateVENTA(getWithActivities, formData.weight, targetWeight);
        }

        setResults({ tmb, get, getWithActivities, ventaAdjusted });

        toast({
            title: 'Sucesso',
            description: 'Gasto energético calculado!',
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const dataToSave = {
                patient_id: patientId,
                weight: parseFloat(formData.weight),
                height: parseFloat(formData.height),
                age: parseInt(formData.age),
                gender: formData.gender,
                protocol: formData.protocol,
                activity_level: formData.activity_level,
                tmb: formData.protocol.startsWith('eer-iom') ? 0 : results.tmb,
                get: results.get,
                get_with_activities: results.getWithActivities,
                activities: activities,
                target_weight: ventaEnabled && targetWeight ? parseFloat(targetWeight) : null,
                venta_adjusted: ventaEnabled ? results.ventaAdjusted : null,
                created_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('energy_expenditure_calculations')
                .insert(dataToSave);

            if (error) throw error;

            toast({
                title: 'Salvo!',
                description: 'Cálculo salvo com sucesso.',
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

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleAddActivity = () => {
        setEditingActivity(null);
        setActivityModalOpen(true);
    };

    const handleEditActivity = (activity, index) => {
        setEditingActivity({ ...activity, index });
        setActivityModalOpen(true);
    };

    const handleDeleteActivity = (index) => {
        setActivities(activities.filter((_, i) => i !== index));
    };

    const handleSaveActivity = (activity) => {
        if (activity.index !== undefined) {
            // Editar
            const newActivities = [...activities];
            newActivities[activity.index] = {
                activity_type: activity.activity_type,
                duration: activity.duration,
                frequency: activity.frequency,
                custom_name: activity.custom_name,
                calories: activity.calories
            };
            setActivities(newActivities);
        } else {
            // Adicionar
            setActivities([...activities, {
                activity_type: activity.activity_type,
                duration: activity.duration,
                frequency: activity.frequency,
                custom_name: activity.custom_name,
                calories: activity.calories
            }]);
        }
    };

    const protocolLabels = {
        'harris-benedict': 'Harris-Benedict (1984)',
        'schofield': 'Schofield (1985)',
        'fao-oms-2001': 'FAO/OMS (2001)',
        'fao-oms-1985': 'FAO/OMS (1985)',
        'eer-iom-2023': 'EER/IOM (2023)',
        'eer-iom-2005': 'EER/IOM (2005)',
        'eer-iom-2005-overweight': 'EER/IOM (2005) Sobrepeso'
    };

    const activityLevels = [
        { value: '1.2', label: 'Sedentário', description: 'Pouco ou nenhum exercício' },
        { value: '1.375', label: 'Levemente Ativo', description: 'Exercício leve 1-3 dias/semana' },
        { value: '1.55', label: 'Moderadamente Ativo', description: 'Exercício moderado 3-5 dias/semana' },
        { value: '1.725', label: 'Muito Ativo', description: 'Exercício intenso 6-7 dias/semana' }
    ];

    const isFormValid = formData.weight && formData.height && formData.age && formData.gender;
    const isEERProtocol = formData.protocol.startsWith('eer-iom');

    return loading ? null : (
        <div className="flex flex-col min-h-screen bg-background">
            <div className="max-w-6xl mx-auto w-full px-4 md:px-8 py-6 md:py-8">
                {/* Header */}
                <div className="flex flex-col gap-4 mb-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/nutritionist/patients/${patientId}/hub`)}
                        className="-ml-2 w-fit text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10"
                    >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Voltar
                    </Button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
                            <Flame className="w-6 h-6 md:w-8 md:h-8 text-[#c4661f]" />
                            <span className="truncate">Gasto Energético</span>
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                            Paciente: <span className="font-medium text-foreground">{patientName}</span>
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Coluna Esquerda - Formulário */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Dados Antropométricos */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Dados Antropométricos</CardTitle>
                                <CardDescription>Informações básicas para o cálculo</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="weight">Peso (kg)</Label>
                                        <Input
                                            id="weight"
                                            type="number"
                                            step="0.1"
                                            min="1"
                                            max="300"
                                            value={formData.weight}
                                            onChange={(e) => handleInputChange('weight', e.target.value)}
                                            placeholder="70.0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="height">Altura (cm)</Label>
                                        <Input
                                            id="height"
                                            type="number"
                                            step="0.1"
                                            min="50"
                                            max="255"
                                            value={formData.height}
                                            onChange={(e) => handleInputChange('height', e.target.value)}
                                            placeholder="170"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="age">Idade (anos)</Label>
                                        <Input
                                            id="age"
                                            type="number"
                                            min="0"
                                            max="120"
                                            value={formData.age}
                                            onChange={(e) => handleInputChange('age', e.target.value)}
                                            placeholder="30"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="gender">Sexo</Label>
                                        <Select
                                            value={formData.gender}
                                            onValueChange={(value) => handleInputChange('gender', value)}
                                        >
                                            <SelectTrigger id="gender">
                                                <SelectValue placeholder="Selecione..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Masculino">Masculino</SelectItem>
                                                <SelectItem value="Feminino">Feminino</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Protocolo de Cálculo */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Protocolo de Cálculo</CardTitle>
                                <CardDescription>Selecione a fórmula científica</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="protocol">Protocolo</Label>
                                    <Select
                                        value={formData.protocol}
                                        onValueChange={(value) => handleInputChange('protocol', value)}
                                    >
                                        <SelectTrigger id="protocol">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="harris-benedict">Harris-Benedict (1984)</SelectItem>
                                            <SelectItem value="schofield">Schofield (1985)</SelectItem>
                                            <SelectItem value="fao-oms-2001">FAO/OMS (2001)</SelectItem>
                                            <SelectItem value="fao-oms-1985">FAO/OMS (1985)</SelectItem>
                                            <SelectItem value="eer-iom-2023">EER/IOM (2023)</SelectItem>
                                            <SelectItem value="eer-iom-2005">EER/IOM (2005)</SelectItem>
                                            <SelectItem value="eer-iom-2005-overweight">EER/IOM (2005) Sobrepeso</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {isEERProtocol && (
                                        <p className="text-xs text-amber-600">
                                            * EER já inclui atividade física integrada ao cálculo
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Nível de Atividade Física */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Nível de Atividade Física (NAF)</CardTitle>
                                <CardDescription>Atividade física diária do paciente</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="activity">Nível de Atividade</Label>
                                    <Select
                                        value={formData.activity_level}
                                        onValueChange={(value) => handleInputChange('activity_level', value)}
                                    >
                                        <SelectTrigger id="activity">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {activityLevels.map((level) => (
                                                <SelectItem key={level.value} value={level.value}>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{level.label}</span>
                                                        <span className="text-xs text-muted-foreground">{level.description}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Atividades Físicas Específicas */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center justify-between">
                                    Atividades Físicas Específicas
                                    <Badge variant="outline" className="text-xs">
                                        +{calculateActivitiesCalories()} kcal/dia
                                    </Badge>
                                </CardTitle>
                                <CardDescription>
                                    Adicione as atividades físicas praticadas para um cálculo mais preciso
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Button
                                    onClick={handleAddActivity}
                                    variant="outline"
                                    className="w-full"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Adicionar Atividade
                                </Button>

                                {activities.length > 0 && (
                                    <div className="space-y-2">
                                        {activities.map((activity, index) => {
                                            const activityInfo = MET_ACTIVITIES.find(a => a.value === activity.activity_type);
                                            const displayName = activity.custom_name || activityInfo?.label || activity.activity_type;

                                            return (
                                                <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                                    <div className="flex-1">
                                                        <p className="font-medium text-sm">{displayName}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {activity.duration}min × {activity.frequency}x/semana
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge className="bg-[#5f6f52]">
                                                            +{activity.calories} kcal/dia
                                                        </Badge>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleEditActivity(activity, index)}
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleDeleteActivity(index)}
                                                        >
                                                            <Trash2 className="w-4 h-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {activities.length === 0 && (
                                    <p className="text-sm text-center text-muted-foreground py-4">
                                        Nenhuma atividade adicionada
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {/* VENTA - Objetivo de Peso */}
                        <Card className={ventaEnabled ? 'border-amber-300' : ''}>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Checkbox
                                        id="venta-enabled"
                                        checked={ventaEnabled}
                                        onCheckedChange={setVentaEnabled}
                                    />
                                    <label htmlFor="venta-enabled" className="cursor-pointer">
                                        Ajuste Calórico para Objetivo de Peso (VENTA)
                                    </label>
                                </CardTitle>
                                <CardDescription>
                                    Calcule as calorias ajustadas para atingir um peso objetivo
                                </CardDescription>
                            </CardHeader>
                            {ventaEnabled && (
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="target-weight">Peso Objetivo (kg)</Label>
                                        <Input
                                            id="target-weight"
                                            type="number"
                                            step="0.1"
                                            min="1"
                                            max="300"
                                            value={targetWeight}
                                            onChange={(e) => setTargetWeight(e.target.value)}
                                            placeholder="65.0"
                                        />
                                    </div>

                                    {targetWeight && formData.weight && (
                                        <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg">
                                            <p className="text-sm font-medium text-amber-900">
                                                {parseFloat(formData.weight) > parseFloat(targetWeight)
                                                    ? '📉 Objetivo: Perder '
                                                    : '📈 Objetivo: Ganhar '}
                                                {Math.abs(parseFloat(formData.weight) - parseFloat(targetWeight)).toFixed(1)} kg
                                            </p>
                                            <p className="text-xs text-amber-700 mt-1">
                                                Meta de 90 dias (~{(Math.abs(parseFloat(formData.weight) - parseFloat(targetWeight)) / 12).toFixed(1)}kg/semana)
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                            )}
                        </Card>

                        {/* Botões de Ação */}
                        <div className="space-y-3">
                            <div className="flex gap-3">
                                <Button
                                    onClick={handleCalculate}
                                    disabled={!isFormValid}
                                    className="flex-1 gap-2"
                                >
                                    <Calculator className="w-4 h-4" />
                                    Calcular
                                </Button>
                                <Button
                                    onClick={handleSave}
                                    disabled={!results.get || saving}
                                    variant="outline"
                                    className="gap-2"
                                >
                                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Salvar
                                </Button>
                            </div>

                            {/* FASE 3: Botões Adicionais */}
                            <div className="grid grid-cols-3 gap-2">
                                <Button
                                    onClick={() => setShowHistory(!showHistory)}
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 text-xs"
                                >
                                    <History className="w-3 h-3" />
                                    Histórico
                                </Button>
                                <Button
                                    onClick={handleCompareProtocols}
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 text-xs"
                                    disabled={!isFormValid}
                                >
                                    <GitCompare className="w-3 h-3" />
                                    Comparar
                                </Button>
                                <Button
                                    onClick={handlePrint}
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 text-xs"
                                    disabled={!results.get}
                                >
                                    <Printer className="w-3 h-3" />
                                    Imprimir
                                </Button>
                            </div>
                        </div>

                        {/* FASE 3: Seção de Histórico */}
                        {showHistory && history.length > 0 && (
                            <Card className="border-dashed">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <History className="w-4 h-4 text-primary" />
                                        Cálculos Anteriores
                                    </CardTitle>
                                    <CardDescription>
                                        Clique em um cálculo para carregá-lo
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                        {history.map((calc, index) => (
                                            <div
                                                key={calc.id}
                                                onClick={() => loadHistoryCalculation(calc)}
                                                className="p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                                            >
                                                <div className="flex items-start justify-between mb-2">
                                                    <div>
                                                        <div className="text-sm font-medium">
                                                            {new Date(calc.created_at).toLocaleDateString('pt-BR', {
                                                                day: '2-digit',
                                                                month: 'long',
                                                                year: 'numeric'
                                                            })}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground mt-1">
                                                            {calc.weight}kg • {calc.height}cm • {getProtocolName(calc.protocol)}
                                                        </div>
                                                    </div>
                                                    {index === 0 && (
                                                        <Badge variant="outline" className="text-xs">Mais recente</Badge>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                    <div className="text-xs bg-muted/30 rounded p-1.5 text-center">
                                                        <div className="text-muted-foreground">GET</div>
                                                        <div className="font-semibold">{Math.round(calc.get_with_activities || calc.get)} kcal</div>
                                                    </div>
                                                    {calc.target_weight && (
                                                        <div className="text-xs bg-amber-50 border border-amber-200 rounded p-1.5 text-center">
                                                            <div className="text-amber-800">Objetivo</div>
                                                            <div className="font-semibold text-amber-900">{calc.target_weight}kg</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* FASE 3: Gráfico de Evolução */}
                        {history.length > 1 && (
                            <HistoryChart historyData={history} />
                        )}
                    </div>

                    {/* Coluna Direita - Resultados */}
                    <div className="space-y-6">
                        <Card className="sticky top-8">
                            <CardHeader>
                                <CardTitle className="text-lg">Resultados</CardTitle>
                                {results.get > 0 && (
                                    <Badge variant="outline" className="w-fit">
                                        {protocolLabels[formData.protocol]}
                                    </Badge>
                                )}
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {results.get > 0 ? (
                                    <>
                                        {/* TMB (só mostra se não for EER) */}
                                        {!isEERProtocol && (
                                            <div className="text-center p-4 bg-[#fefae0] rounded-lg border-2 border-[#c4661f]">
                                                <div className="flex items-center justify-center gap-2 mb-2">
                                                    <Flame className="w-5 h-5 text-[#c4661f]" />
                                                    <span className="text-sm font-medium text-muted-foreground">TMB</span>
                                                </div>
                                                <div className="text-4xl font-bold text-[#c4661f]">
                                                    {Math.round(results.tmb)}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    kcal/dia em repouso
                                                </div>
                                            </div>
                                        )}

                                        {/* GET Base */}
                                        <div className="text-center p-4 bg-gradient-to-br from-[#5f6f52] to-[#a9b388] rounded-lg text-white">
                                            <div className="flex items-center justify-center gap-2 mb-2">
                                                <Activity className="w-5 h-5 opacity-90" />
                                                <span className="text-sm font-medium opacity-90">
                                                    {isEERProtocol ? 'EER' : 'GET Base'}
                                                </span>
                                            </div>
                                            <div className="text-4xl font-bold">
                                                {Math.round(results.get)}
                                            </div>
                                            <div className="text-xs opacity-90 mt-1">
                                                kcal/dia {!isEERProtocol && '(TMB × NAF)'}
                                            </div>
                                        </div>

                                        {/* GET com Atividades */}
                                        {activities.length > 0 && (
                                            <div className="text-center p-4 bg-gradient-to-br from-[#4a5a42] to-[#8ea36f] rounded-lg text-white">
                                                <div className="flex items-center justify-center gap-2 mb-2">
                                                    <Activity className="w-5 h-5 opacity-90" />
                                                    <span className="text-sm font-medium opacity-90">GET + Atividades</span>
                                                </div>
                                                <div className="text-4xl font-bold">
                                                    {Math.round(results.getWithActivities)}
                                                </div>
                                                <div className="text-xs opacity-90 mt-1">
                                                    kcal/dia total
                                                </div>
                                            </div>
                                        )}

                                        {/* VENTA Ajustado */}
                                        {ventaEnabled && results.ventaAdjusted > 0 && (
                                            <div className="text-center p-4 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg text-white">
                                                <div className="flex items-center justify-center gap-2 mb-2">
                                                    <Calculator className="w-5 h-5 opacity-90" />
                                                    <span className="text-sm font-medium opacity-90">Objetivo Ajustado</span>
                                                </div>
                                                <div className="text-4xl font-bold">
                                                    {Math.round(results.ventaAdjusted)}
                                                </div>
                                                <div className="text-xs opacity-90 mt-1">
                                                    kcal/dia para {targetWeight}kg
                                                </div>
                                            </div>
                                        )}

                                        {/* Breakdown */}
                                        <div className="p-3 bg-muted/30 rounded-lg text-xs space-y-1">
                                            {!isEERProtocol && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">TMB:</span>
                                                    <span className="font-medium">{Math.round(results.tmb)} kcal</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">NAF:</span>
                                                <span className="font-medium">{formData.activity_level}</span>
                                            </div>
                                            {!isEERProtocol && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">GET Base:</span>
                                                    <span className="font-medium">{Math.round(results.get)} kcal</span>
                                                </div>
                                            )}
                                            {activities.length > 0 && (
                                                <>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Atividades:</span>
                                                        <span className="font-medium">+{calculateActivitiesCalories()} kcal</span>
                                                    </div>
                                                    <div className="flex justify-between border-t pt-1 mt-1">
                                                        <span className="text-muted-foreground">GET Total:</span>
                                                        <span className="font-semibold">{Math.round(results.getWithActivities)} kcal</span>
                                                    </div>
                                                </>
                                            )}
                                            {ventaEnabled && results.ventaAdjusted > 0 && (
                                                <div className="flex justify-between border-t pt-1 mt-1 text-amber-700">
                                                    <span>Ajuste VENTA:</span>
                                                    <span className="font-semibold">{Math.round(results.ventaAdjusted)} kcal</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <p className="text-xs text-center text-muted-foreground">
                                            {ventaEnabled && results.ventaAdjusted > 0
                                                ? 'Calorias ajustadas para atingir o peso objetivo'
                                                : 'Energia necessária para manter o peso atual'}
                                        </p>
                                    </>
                                ) : (
                                    <div className="text-center py-12">
                                        <Calculator className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                                        <p className="text-sm text-muted-foreground">
                                            Preencha os dados e clique em "Calcular"
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>

            {/* Activity Modal */}
            <ActivityModal
                isOpen={activityModalOpen}
                onClose={() => setActivityModalOpen(false)}
                onSave={handleSaveActivity}
                activity={editingActivity}
                patientWeight={formData.weight}
            />

            {/* FASE 3: Comparison Modal */}
            <ComparisonModal
                isOpen={compareModalOpen}
                onClose={() => setCompareModalOpen(false)}
                comparisons={comparisonResults}
            />
        </div>
    );
};

export default EnergyExpenditurePage;
