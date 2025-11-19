import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, Flame, Activity, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/customSupabaseClient';

const EnergyExpenditureSummaryCard = ({ patientId }) => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [hasRequiredData, setHasRequiredData] = useState(false);
    const [calculatedData, setCalculatedData] = useState(null);
    const [patientBasicData, setPatientBasicData] = useState(null);

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

            // Buscar cálculo salvo (se existir)
            const { data: savedCalc } = await supabase
                .from('energy_expenditure_calculations')
                .select('*')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (savedCalc) {
                setCalculatedData(savedCalc);
            }

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
        navigate(`/nutritionist/patients/${patientId}/energy-expenditure`);
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
            <Card className="hover:shadow-md transition-all border-dashed border-2 border-amber-300 bg-amber-50/30">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-amber-600" />
                        <CardTitle className="text-base">Gasto Energético</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
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

    // Estado: Dados calculados existem
    if (calculatedData) {
        // Verificar se é protocolo EER (que não tem TMB separado)
        const isEERProtocol = calculatedData.protocol?.startsWith('eer-iom');

        // Usar GET com atividades se existir, senão GET normal
        const displayGET = calculatedData.get_with_activities || calculatedData.get || 0;

        // Verificar se tem atividades
        const hasActivities = calculatedData.activities && Array.isArray(calculatedData.activities) && calculatedData.activities.length > 0;

        // Verificar se tem VENTA
        const hasVENTA = calculatedData.target_weight && calculatedData.venta_adjusted;

        return (
            <Card className="hover:shadow-md transition-all border-l-4 border-l-[#5f6f52]">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Calculator className="w-5 h-5 text-[#5f6f52]" />
                        <CardTitle className="text-base">Gasto Energético</CardTitle>
                        {hasActivities && (
                            <Badge variant="outline" className="text-xs border-[#5f6f52] text-[#5f6f52]">
                                +{calculatedData.activities.length} {calculatedData.activities.length === 1 ? 'atividade' : 'atividades'}
                            </Badge>
                        )}
                        {hasVENTA && (
                            <Badge className="text-xs bg-amber-500 hover:bg-amber-600">
                                Objetivo: {calculatedData.target_weight}kg
                            </Badge>
                        )}
                    </div>
                    <CardDescription className="text-xs">
                        Protocolo: {calculatedData.protocol || 'Harris-Benedict'}
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* Resumo dos Resultados */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* TMB - apenas se não for EER */}
                        {!isEERProtocol && (
                            <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
                                <Flame className="w-4 h-4 text-orange-600 mx-auto mb-1" />
                                <div className="text-2xl font-bold text-orange-700">
                                    {Math.round(calculatedData.tmb || 0)}
                                </div>
                                <div className="text-xs text-muted-foreground">TMB (kcal)</div>
                            </div>
                        )}

                        {/* GET (ou GET+Atividades se houver) */}
                        <div className={`text-center p-3 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-lg text-white ${isEERProtocol ? 'col-span-2' : ''}`}>
                            <Activity className="w-4 h-4 mx-auto mb-1 opacity-90" />
                            <div className="text-2xl font-bold">
                                {Math.round(displayGET)}
                            </div>
                            <div className="text-xs opacity-90">
                                {hasActivities ? 'GET + Atividades' : isEERProtocol ? 'EER' : 'GET'} (kcal)
                            </div>
                        </div>
                    </div>

                    {/* VENTA - se houver */}
                    {hasVENTA && (
                        <div className="text-center p-2.5 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg text-white shadow-sm">
                            <div className="text-lg font-bold">
                                {Math.round(calculatedData.venta_adjusted)} kcal/dia
                            </div>
                            <div className="text-xs opacity-90">
                                Objetivo: {calculatedData.target_weight}kg
                            </div>
                        </div>
                    )}

                    {/* Nível de Atividade */}
                    <div className="text-xs text-center text-muted-foreground">
                        {calculatedData.activity_level === '1.2' && 'Sedentário'}
                        {calculatedData.activity_level === '1.375' && 'Levemente Ativo'}
                        {calculatedData.activity_level === '1.55' && 'Moderadamente Ativo'}
                        {calculatedData.activity_level === '1.725' && 'Muito Ativo'}
                        {calculatedData.activity_level === '1.9' && 'Extremamente Ativo'}
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
        <Card className="hover:shadow-md transition-all border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30">
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
