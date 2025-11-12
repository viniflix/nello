import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import AnthropometryForm from '@/components/anthropometry/AnthropometryForm';
import AnthropometryTable from '@/components/anthropometry/AnthropometryTable';
import WeightChart from '@/components/anthropometry/WeightChart';
import IMCChart from '@/components/anthropometry/IMCChart';
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

    // Carregar dados
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
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
        <div className="container mx-auto p-6 max-w-7xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/nutritionist/patients/${patientId}/hub`)}
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Voltar ao Hub
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">Avaliação Antropométrica</h1>
                        <p className="text-muted-foreground">
                            Acompanhamento de peso, altura e IMC
                        </p>
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={loadData}
                    disabled={loading}
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                </Button>
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
            />

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <WeightChart data={chartData} />
                <IMCChart data={chartData} />
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
