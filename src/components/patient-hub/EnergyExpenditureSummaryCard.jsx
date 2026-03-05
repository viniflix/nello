import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, Flame, Activity, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/customSupabaseClient';
import { patientRoute } from '@/lib/utils/patientRoutes';
import { getPatientModuleSyncFlags } from '@/lib/supabase/anthropometry-queries';

const EnergyExpenditureSummaryCard = ({ patientId, patient }) => {
    const navigate = useNavigate();
    const patientForRoute = patient && (patient.id || patientId) ? { id: patient.id || patientId, slug: patient.slug } : null;
    const [loading, setLoading] = useState(true);
    const [hasRequiredData, setHasRequiredData] = useState(false);
    const [calculatedData, setCalculatedData] = useState(null);
    const [patientBasicData, setPatientBasicData] = useState(null);
    const [syncFlags, setSyncFlags] = useState(null);

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        if (!patientId) return;

        setLoading(true);
        try {
            // Buscar dados básicos do paciente
            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('name, birth_date, gender, weight, height')
                .eq('id', patientId)
                .single();

            if (profileError) throw profileError;

            // Buscar último registro antropométrico
            const { data: latestRecord } = await supabase
                .from('growth_records')
                .select('weight, height')
                .eq('patient_id', patientId)
                .order('record_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            const finalData = {
                weight: latestRecord?.weight || profile.weight,
                height: latestRecord?.height || profile.height,
                birth_date: profile.birth_date,
                gender: profile.gender
            };

            setPatientBasicData(finalData);

            // Verificar se tem todos os dados necessários
            const age = calculateAge(finalData.birth_date);
            const hasData = finalData.weight && finalData.height && age && finalData.gender;
            setHasRequiredData(hasData);

            // Buscar cálculo salvo (schema novo: tmb_result, get_result, final_planned_kcal, mets_activities, venta_*)
            const { data: savedCalc } = await supabase
                .from('energy_expenditure_calculations')
                .select('*')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (savedCalc) setCalculatedData(savedCalc);

            // Flags de sincronização (antropometria atualizada → recomendar revisar GET)
            const { data: flags } = await getPatientModuleSyncFlags(patientId);
            setSyncFlags(flags || null);

        } catch (error) {
            console.error('Erro ao buscar dados:', error);
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

    const handleNavigateToFullPage = () => {
        const url = patientForRoute
            ? patientRoute(patientForRoute, 'energy-expenditure')
            : `/nutritionist/patients/${patientId}/energy-expenditure`;
        navigate(url);
    };

    if (loading) {
        return (
            <Card className="hover:shadow-md transition-all">
                <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }

    // Estado: Sem dados suficientes
    if (!hasRequiredData) {
        return (
            <Card
                className="hover:shadow-md transition-all border-dashed border-2 border-amber-300 bg-amber-50/30 cursor-pointer"
                onClick={handleNavigateToFullPage}
            >
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-amber-600" />
                        <CardTitle className="text-base">Gasto Energético</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {syncFlags?.needs_energy_recalc && (
                            <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30" onClick={(e) => e.stopPropagation()}>
                                <AlertCircle className="h-4 w-4 text-amber-700" />
                                <AlertDescription className="text-amber-800 dark:text-amber-200">
                                    <p className="font-medium">Antropometria atualizada.</p>
                                    <p className="text-sm mt-1">Recomendamos revisar o GET e salvar.</p>
                                    <Button size="sm" variant="outline" className="mt-2 border-amber-400 text-amber-800" onClick={(e) => { e.stopPropagation(); handleNavigateToFullPage(); }}>Atualizar dados</Button>
                                </AlertDescription>
                            </Alert>
                        )}
                        <Alert className="border-amber-300 bg-amber-50/50">
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                            <AlertDescription className="text-sm">
                                <strong>Dados incompletos</strong>
                                <p className="mt-1 text-muted-foreground text-xs">
                                    Para calcular, é necessário peso, altura, idade e sexo.
                                </p>
                            </AlertDescription>
                        </Alert>

                        <Button
                            onClick={handleNavigateToFullPage}
                            className="w-full gap-2"
                            variant="outline"
                        >
                            <Calculator className="w-4 h-4" />
                            Calcular Gasto Energético
                            <ArrowRight className="w-4 h-4 ml-auto" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Estado: Dados calculados existem (schema novo: final_planned_kcal, get_result, tmb_result, mets_activities, venta_*)
    if (calculatedData) {
        const isEERProtocol = (calculatedData.tmb_protocol || calculatedData.protocol || '').toString().startsWith('eer-iom');
        const displayGET = calculatedData.get_result ?? calculatedData.get_with_activities ?? calculatedData.get ?? 0;
        const metaCalories = calculatedData.final_planned_kcal ?? calculatedData.target_calories ?? displayGET;
        const hasActivities = Array.isArray(calculatedData.mets_activities) && calculatedData.mets_activities.length > 0;
        const hasVENTA = (calculatedData.venta_target_weight != null || calculatedData.target_weight != null) && (calculatedData.venta_adjustment_kcal != null || calculatedData.venta_adjusted != null);

        return (
            <Card
                className="hover:shadow-md transition-all border-l-4 border-l-[#5f6f52] cursor-pointer"
                onClick={handleNavigateToFullPage}
            >
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Calculator className="w-5 h-5 text-[#5f6f52]" />
                        <CardTitle className="text-base">Gasto Energético</CardTitle>
                        {hasActivities && (
                            <Badge variant="outline" className="text-xs border-[#5f6f52] text-[#5f6f52]">
                                +{(calculatedData.mets_activities || calculatedData.activities || []).length} atividades
                            </Badge>
                        )}
                        {hasVENTA && (
                            <Badge className="text-xs bg-amber-500 hover:bg-amber-600">
                                Objetivo: {(calculatedData.venta_target_weight ?? calculatedData.target_weight)}kg
                            </Badge>
                        )}
                    </div>
                    <CardDescription className="text-xs">
                        Protocolo: {calculatedData.tmb_protocol || calculatedData.protocol || 'TMB'}
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* Alerta: antropometria atualizada — revisar GET (some ao salvar o cálculo) */}
                    {syncFlags?.needs_energy_recalc && (
                        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30" onClick={(e) => e.stopPropagation()}>
                            <AlertCircle className="h-4 w-4 text-amber-700" />
                            <AlertDescription className="text-amber-800 dark:text-amber-200">
                                <p className="font-medium">Antropometria atualizada.</p>
                                <p className="text-sm mt-1">Recomendamos revisar o GET e salvar.</p>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-2 border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/50"
                                    onClick={(e) => { e.stopPropagation(); handleNavigateToFullPage(); }}
                                >
                                    Atualizar dados
                                </Button>
                            </AlertDescription>
                        </Alert>
                    )}
                    {/* Resumo dos Resultados */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* TMB - apenas se não for EER */}
                        {!isEERProtocol && (
                            <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
                                <Flame className="w-4 h-4 text-orange-600 mx-auto mb-1" />
                                <div className="text-2xl font-bold text-orange-700">
                                    {Math.round(calculatedData.tmb_result ?? calculatedData.tmb ?? 0)}
                                </div>
                                <div className="text-xs text-muted-foreground">TMB (kcal)</div>
                            </div>
                        )}

                        {/* GET */}
                        <div className={`text-center p-3 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-lg text-white ${isEERProtocol ? 'col-span-2' : ''}`}>
                            <Activity className="w-4 h-4 mx-auto mb-1 opacity-90" />
                            <div className="text-2xl font-bold">{Math.round(displayGET)}</div>
                            <div className="text-xs opacity-90">
                                {hasActivities ? 'GET + METs' : isEERProtocol ? 'EER' : 'GET'} (kcal)
                            </div>
                        </div>
                    </div>

                    {/* Meta calórica final (VET) */}
                    <div className="text-center p-2.5 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg text-white shadow-sm">
                        <div className="text-lg font-bold">{Math.round(metaCalories)} kcal/dia</div>
                        <div className="text-xs opacity-90">{hasVENTA ? 'Meta com VENTA' : 'Meta calórica'}</div>
                    </div>

                    {/* Nível de Atividade */}
                    <div className="text-xs text-center text-muted-foreground">
                        {String(calculatedData.activity_factor ?? calculatedData.activity_level ?? '') === '1.2' && 'Sedentário'}
                        {String(calculatedData.activity_factor ?? calculatedData.activity_level ?? '') === '1.375' && 'Levemente Ativo'}
                        {String(calculatedData.activity_factor ?? calculatedData.activity_level ?? '') === '1.55' && 'Moderadamente Ativo'}
                        {String(calculatedData.activity_factor ?? calculatedData.activity_level ?? '') === '1.725' && 'Muito Ativo'}
                        {String(calculatedData.activity_factor ?? calculatedData.activity_level ?? '') === '1.9' && 'Extremamente Ativo'}
                    </div>

                    {/* CTA */}
                    <Button
                        onClick={handleNavigateToFullPage}
                        variant="outline"
                        size="sm"
                        className="w-full gap-1"
                    >
                        Ver detalhes / Editar
                        <ArrowRight className="w-3 h-3" />
                    </Button>
                </CardContent>
            </Card>
        );
    }

    // Estado: Tem dados mas nunca calculou
    return (
        <Card
            className="hover:shadow-md transition-all border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30 cursor-pointer"
            onClick={handleNavigateToFullPage}
        >
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-[#5f6f52]" />
                    <CardTitle className="text-base">Gasto Energético</CardTitle>
                </div>
            </CardHeader>

            <CardContent>
                <div className="text-center py-6">
                    <div className="w-12 h-12 rounded-full bg-[#fefae0] flex items-center justify-center mx-auto mb-3">
                        <Flame className="w-6 h-6 text-[#c4661f]" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-2">
                        Calcular TMB e GET
                    </p>
                    <p className="text-xs text-muted-foreground mb-4">
                        Dados disponíveis. Calcule o gasto energético total.
                    </p>
                    <Button
                        onClick={handleNavigateToFullPage}
                        className="gap-2"
                    >
                        <Calculator className="w-4 h-4" />
                        Calcular Agora
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default EnergyExpenditureSummaryCard;
