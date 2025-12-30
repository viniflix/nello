import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertCircle, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import AnthropometryForm from '@/components/anthropometry/AnthropometryForm';
import AnthropometryTable from '@/components/anthropometry/AnthropometryTable';
import WeightChart from '@/components/anthropometry/WeightChart';
import IMCChart from '@/components/anthropometry/IMCChart';
import CompositionCharts from '@/components/anthropometry/CompositionCharts';
import SomatotypeChart from '@/components/anthropometry/SomatotypeChart';
import { supabase } from '@/lib/customSupabaseClient';
import {
    getAnthropometryRecords,
    getAnthropometryChartData,
    createAnthropometryRecord,
    updateAnthropometryRecord,
    deleteAnthropometryRecord
} from '@/lib/supabase/anthropometry-queries';

const AnthropometryPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [records, setRecords] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [editingRecord, setEditingRecord] = useState(null);
    const [error, setError] = useState(null);
    const [latestRecord, setLatestRecord] = useState(null);
    const [idealWeightRange, setIdealWeightRange] = useState(null);
    const [patientProfile, setPatientProfile] = useState(null);

    // Carregar dados
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Buscar perfil do paciente para gender e age
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('gender, birth_date')
                .eq('id', patientId)
                .single();
            
            if (profile) {
                setPatientProfile(profile);
            }

            const [recordsResult, chartResult] = await Promise.all([
                getAnthropometryRecords(patientId, { limit: 50 }),
                getAnthropometryChartData(patientId)
            ]);

            // Verificar se houve erro real (não apenas lista vazia)
            if (recordsResult.error) {
                console.error('Erro ao buscar registros:', recordsResult.error);
                throw new Error('Erro ao buscar registros antropométricos');
            }
            if (chartResult.error) {
                console.error('Erro ao buscar dados de gráficos:', chartResult.error);
                throw new Error('Erro ao buscar dados de gráficos');
            }

            // Dados vazios não são erro - apenas defina arrays vazios
            setRecords(recordsResult.data || []);
            setChartData(chartResult.data || []);

            // Calcular peso ideal do último registro
            if (recordsResult.data && recordsResult.data.length > 0) {
                const latest = recordsResult.data[0]; // Já ordenado por data desc
                setLatestRecord(latest);
                
                if (latest.height && latest.weight) {
                    const heightM = parseFloat(latest.height) / 100;
                    const minIdealWeight = 18.5 * Math.pow(heightM, 2);
                    const maxIdealWeight = 24.9 * Math.pow(heightM, 2);
                    setIdealWeightRange({
                        min: minIdealWeight,
                        max: maxIdealWeight,
                        current: parseFloat(latest.weight)
                    });
                } else {
                    setIdealWeightRange(null);
                }
            } else {
                setLatestRecord(null);
                setIdealWeightRange(null);
            }
        } catch (err) {
            console.error('Erro ao carregar dados:', err);
            const errorMessage = err.message || 'Erro ao carregar dados';
            setError(errorMessage);
            toast({
                title: 'Erro',
                description: errorMessage,
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    }, [patientId, toast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Criar ou atualizar registro
    const handleSubmit = async (data, recordId = null) => {
        setSubmitting(true);

        try {
            let result;

            if (recordId) {
                // Atualizar registro existente
                result = await updateAnthropometryRecord(recordId, data);
            } else {
                // Criar novo registro
                result = await createAnthropometryRecord(data);
            }

            if (result.error) throw result.error;

            toast({
                title: 'Sucesso',
                description: recordId
                    ? 'Registro atualizado com sucesso'
                    : 'Registro criado com sucesso',
                variant: 'success'
            });

            // Limpar formulário de edição e recarregar dados
            setEditingRecord(null);
            await loadData();
        } catch (err) {
            console.error('Erro ao salvar registro:', err);
            toast({
                title: 'Erro',
                description: err.message || 'Não foi possível salvar o registro',
                variant: 'destructive'
            });
        } finally {
            setSubmitting(false);
        }
    };

    // Editar registro
    const handleEdit = (record) => {
        setEditingRecord(record);
        // Scroll suave até o formulário
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Deletar registro
    const handleDelete = async (record) => {
        if (!window.confirm('Tem certeza que deseja excluir este registro?')) {
            return;
        }

        try {
            const result = await deleteAnthropometryRecord(record.id);

            if (result.error) throw result.error;

            toast({
                title: 'Sucesso',
                description: 'Registro excluído com sucesso',
                variant: 'success'
            });

            await loadData();
        } catch (err) {
            console.error('Erro ao deletar registro:', err);
            toast({
                title: 'Erro',
                description: err.message || 'Não foi possível excluir o registro',
                variant: 'destructive'
            });
        }
    };

    // Cancelar edição
    const handleCancelEdit = () => {
        setEditingRecord(null);
    };

    return (
        <div className="container mx-auto p-4 sm:p-6 max-w-7xl space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/nutritionist/patients/${patientId}/hub`)}
                        className="-ml-2 text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10"
                    >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Voltar
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={loadData}
                        disabled={loading}
                        className="flex-shrink-0"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Atualizar</span>
                    </Button>
                </div>
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 text-[#5f6f52]" />
                        <span className="truncate">Avaliação Antropométrica</span>
                    </h1>
                    <div className="flex flex-wrap items-center gap-4 mt-2">
                        <p className="text-sm text-muted-foreground">
                            Acompanhamento de peso, altura e IMC
                        </p>
                        {latestRecord && latestRecord.weight && (
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">Peso atual:</span>
                                <span className="font-semibold">{latestRecord.weight} kg</span>
                            </div>
                        )}
                        {idealWeightRange && (
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">Peso ideal:</span>
                                <span className="font-semibold text-[#5f6f52]">
                                    {idealWeightRange.min.toFixed(1)} - {idealWeightRange.max.toFixed(1)} kg
                                </span>
                                {idealWeightRange.current && (
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                        idealWeightRange.current < idealWeightRange.min
                                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                            : idealWeightRange.current > idealWeightRange.max
                                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                                            : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                    }`}>
                                        {idealWeightRange.current < idealWeightRange.min
                                            ? 'Abaixo'
                                            : idealWeightRange.current > idealWeightRange.max
                                            ? 'Acima'
                                            : 'Ideal'}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Erro geral */}
            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Formulário */}
            <AnthropometryForm
                patientId={patientId}
                initialData={editingRecord}
                onSubmit={handleSubmit}
                onCancel={handleCancelEdit}
                loading={submitting}
                patientGender={patientProfile?.gender}
                patientBirthDate={patientProfile?.birth_date}
            />

            {/* Gráficos */}
            <div className="space-y-6">
                {/* Composição Corporal (se houver dados) */}
                {records.some(r => r.results || r.bioimpedance) && (
                    <CompositionCharts data={records} />
                )}
                
                {/* Somatotipo Chart (se houver dados do último registro) */}
                {latestRecord?.results?.somatotype && (
                    <SomatotypeChart somatotype={latestRecord.results.somatotype} />
                )}
                
                {/* Gráficos tradicionais */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <WeightChart data={chartData} />
                    <IMCChart data={chartData} />
                </div>
            </div>

            {/* Tabela de Registros */}
            <div>
                <h2 className="text-2xl font-bold mb-4">Histórico de Registros</h2>
                <AnthropometryTable
                    records={records}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    loading={loading}
                />
            </div>
        </div>
    );
};

export default AnthropometryPage;
