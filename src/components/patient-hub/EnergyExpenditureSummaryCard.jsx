import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { HubPanel, HubMetric } from '@/components/patient-hub/HubPanel';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/customSupabaseClient';
import { patientRoute } from '@/lib/utils/patientRoutes';
import { getPatientModuleSyncFlags } from '@/lib/supabase/anthropometry-queries';
import { CardSkeleton } from '@/components/ui/card-skeleton';

const EnergyExpenditureSummaryCard = ({ patientId, patient }) => {
    const navigate = useNavigate();
    const patientForRoute = patient && (patient.id || patientId) ? { id: patient.id || patientId, slug: patient.slug } : null;
    const [loading, setLoading] = useState(true);
    const [hasRequiredData, setHasRequiredData] = useState(false);
    const [calculatedData, setCalculatedData] = useState(null);
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

    if (loading) return <div role="status" aria-label="Carregando gasto energético"><CardSkeleton lines={4} /></div>;

    const protocol = calculatedData?.tmb_protocol || calculatedData?.protocol || '';
    const isEER = protocol.toLowerCase().includes('eer');
    const get = calculatedData?.get_result ?? calculatedData?.get_with_activities ?? calculatedData?.get;
    const target = calculatedData?.final_planned_kcal ?? calculatedData?.target_calories ?? get;
    const hasVENTA = calculatedData?.venta_target_weight != null || calculatedData?.target_weight != null;
    const activities = calculatedData?.mets_activities || calculatedData?.activities || [];
    const display = value => value == null || !Number.isFinite(Number(value)) ? '—' : Math.round(Number(value)).toLocaleString('pt-BR');
    return <HubPanel title="Gasto energético"
        description={calculatedData ? `Protocolo: ${protocol || 'Não informado'}` : 'Estimativas e planejamento energético'}
        action={<Button variant="outline" size="sm" onClick={handleNavigateToFullPage}>{calculatedData ? 'Editar cálculo' : 'Calcular gasto'}</Button>}>
        <div className="flex flex-col gap-3">
            {syncFlags?.needs_energy_recalc && <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>Antropometria atualizada. Revise o cálculo energético.</AlertDescription></Alert>}
            {calculatedData ? <>
                <div className="grid grid-cols-2 gap-2">
                    {!isEER && <HubMetric label="TMB" value={display(calculatedData.tmb_result ?? calculatedData.tmb)} detail="kcal/dia" />}
                    <HubMetric label={isEER ? 'EER' : activities.length ? 'GET + METs' : 'GET'} value={display(get)} detail="kcal/dia" />
                    <HubMetric label={hasVENTA ? 'Meta com VENTA' : 'Meta calórica'} value={display(target)} detail="kcal/dia" />
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Fator de atividade: {calculatedData.activity_factor ?? calculatedData.activity_level ?? '—'}</span>
                    {activities.length > 0 && <span>· {activities.length} atividades</span>}
                    {hasVENTA && <span>· Peso-alvo: {calculatedData.venta_target_weight ?? calculatedData.target_weight} kg</span>}
                </div>
            </> : <p className="text-sm leading-relaxed text-muted-foreground">{hasRequiredData ? 'Dados disponíveis. Abra o cálculo para planejar o gasto energético.' : 'Para calcular, confira peso, altura, idade e sexo no cadastro e na avaliação.'}</p>}
        </div>
    </HubPanel>;
};

export default EnergyExpenditureSummaryCard;
