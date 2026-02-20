import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertCircle, BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import AnthropometryForm from '@/components/anthropometry/AnthropometryForm';
import AnthropometryTable from '@/components/anthropometry/AnthropometryTable';
import WeightChart from '@/components/anthropometry/WeightChart';
import IMCChart from '@/components/anthropometry/IMCChart';
import CompositionCharts from '@/components/anthropometry/CompositionCharts';
import SomatotypeChart from '@/components/anthropometry/SomatotypeChart';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import {
    getAnthropometryRecords,
    getAnthropometryChartData,
    createAnthropometryRecord,
    deleteAnthropometryRecord,
    getAnthropometryLongitudinalScore,
    getPatientModuleSyncFlags
} from '@/lib/supabase/anthropometry-queries';
import { getActiveGoal } from '@/lib/supabase/goals-queries';
import { getLatestAnamnesis } from '@/lib/supabase/anamnesis-queries';
import jsPDF from 'jspdf';

const AnthropometryPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [records, setRecords] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [editingRecord, setEditingRecord] = useState(null);
    const [error, setError] = useState(null);
    const [latestRecord, setLatestRecord] = useState(null);
    const [idealWeightRange, setIdealWeightRange] = useState(null);
    const [patientProfile, setPatientProfile] = useState(null);
    const [patientName, setPatientName] = useState('');
    const [patientObjective, setPatientObjective] = useState('maintenance');
    const [longitudinalScore, setLongitudinalScore] = useState(null);
    const [syncFlags, setSyncFlags] = useState(null);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [recordDetailOpen, setRecordDetailOpen] = useState(false);
    const [compareRecordId, setCompareRecordId] = useState('');
    const [historyFilter, setHistoryFilter] = useState('all');
    const [sectionHighlights, setSectionHighlights] = useState([]);

    const getFilledCount = (obj) => Object.values(obj || {}).filter((v) => v !== null && v !== undefined && v !== '').length;

    const resolveObjective = (goalType, anamnesisObjective, bmi) => {
        const normalizedGoal = String(goalType || '').toLowerCase();
        if (['weight_loss', 'perda_peso', 'emagrecimento'].includes(normalizedGoal)) return 'weight_loss';
        if (['weight_gain', 'ganho_peso', 'hipertrofia'].includes(normalizedGoal)) return 'weight_gain';
        if (['maintenance', 'manutencao', 'manutenção', 'recomposition', 'recomposicao'].includes(normalizedGoal)) return 'maintenance';

        const normalizedText = String(anamnesisObjective || '').toLowerCase();
        if (normalizedText.includes('perder') || normalizedText.includes('emagrec')) return 'weight_loss';
        if (normalizedText.includes('ganhar') || normalizedText.includes('hipertrof')) return 'weight_gain';
        if (normalizedText.includes('manter') || normalizedText.includes('recompos')) return 'maintenance';

        if (bmi !== null && bmi !== undefined) {
            if (bmi >= 25) return 'weight_loss';
            if (bmi < 18.5) return 'weight_gain';
        }
        return 'maintenance';
    };

    const getRecordSections = (record) => ({
        basico: Boolean(record?.weight || record?.height),
        circunferencias: getFilledCount(record?.circumferences) > 0,
        dobras: getFilledCount(record?.skinfolds) > 0 || getFilledCount(record?.bioimpedance) > 0,
        diametros: getFilledCount(record?.bone_diameters) > 0,
        fotos: Array.isArray(record?.photos) && record.photos.length > 0
    });

    const getRecordSectionCount = (record) => Object.values(getRecordSections(record)).filter(Boolean).length;

    const getRecordComparison = (current, other) => {
        if (!current || !other) return null;
        const currentBmi = current.height && current.weight ? current.weight / Math.pow(current.height / 100, 2) : null;
        const otherBmi = other.height && other.weight ? other.weight / Math.pow(other.height / 100, 2) : null;

        const diff = (a, b) => {
            if (a === null || a === undefined || b === null || b === undefined) return null;
            return Number((a - b).toFixed(2));
        };

        return {
            weight: diff(current.weight, other.weight),
            height: diff(current.height, other.height),
            bmi: diff(currentBmi, otherBmi),
            circumferenceFields: getFilledCount(current.circumferences) - getFilledCount(other.circumferences),
            skinfoldFields: getFilledCount(current.skinfolds) - getFilledCount(other.skinfolds),
            diameterFields: getFilledCount(current.bone_diameters) - getFilledCount(other.bone_diameters),
            photoFields: (current.photos?.length || 0) - (other.photos?.length || 0)
        };
    };

    const getPreviousRecord = (record) => {
        if (!record) return null;
        const currentIndex = orderedRecords.findIndex((r) => r.id === record.id);
        if (currentIndex < 0) return null;
        return orderedRecords[currentIndex + 1] || null;
    };

    const compareObjectFields = (currentObj = {}, compareObj = {}) => {
        const keys = Array.from(new Set([...Object.keys(currentObj || {}), ...Object.keys(compareObj || {})]));
        return keys
            .map((key) => {
                const currentValue = currentObj?.[key];
                const previousValue = compareObj?.[key];
                const currentNum = Number(currentValue);
                const previousNum = Number(previousValue);
                const hasCurrent = currentValue !== null && currentValue !== undefined && currentValue !== '';
                const hasPrevious = previousValue !== null && previousValue !== undefined && previousValue !== '';
                const bothNumeric = hasCurrent && hasPrevious && Number.isFinite(currentNum) && Number.isFinite(previousNum);
                const delta = bothNumeric ? Number((currentNum - previousNum).toFixed(2)) : null;
                const changed = hasCurrent !== hasPrevious || String(currentValue ?? '') !== String(previousValue ?? '');
                if (!changed) return null;
                return {
                    key,
                    currentValue: hasCurrent ? currentValue : 'N/A',
                    previousValue: hasPrevious ? previousValue : 'N/A',
                    delta
                };
            })
            .filter(Boolean);
    };

    const getVersionTimeline = (record) => {
        if (!record) return [];
        const result = [];
        let cursor = record;
        const seen = new Set();
        while (cursor && !seen.has(cursor.id)) {
            seen.add(cursor.id);
            result.push(cursor);
            const parentId = cursor?.supersedes_record_id || cursor?.results?.audit?.source_record_id;
            if (!parentId) break;
            cursor = records.find((r) => String(r.id) === String(parentId));
        }
        return result.reverse();
    };

    const getClinicalIndicator = (current, previous, objective) => {
        if (!current || !previous) return null;

        const getNum = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        };
        const currentBmi = current.height && current.weight ? getNum(current.weight / Math.pow(current.height / 100, 2)) : null;
        const previousBmi = previous.height && previous.weight ? getNum(previous.weight / Math.pow(previous.height / 100, 2)) : null;
        const currentBodyFat = getNum(current?.results?.body_fat_percent ?? current?.bioimpedance?.percent_gordura);
        const previousBodyFat = getNum(previous?.results?.body_fat_percent ?? previous?.bioimpedance?.percent_gordura);

        const weightDelta = getNum((current.weight ?? 0) - (previous.weight ?? 0));
        const bmiDelta = currentBmi !== null && previousBmi !== null ? getNum(currentBmi - previousBmi) : null;
        const fatDelta = currentBodyFat !== null && previousBodyFat !== null ? getNum(currentBodyFat - previousBodyFat) : null;

        let score = 0;
        const reasons = [];

        if (objective === 'weight_loss') {
            if (weightDelta !== null) {
                if (weightDelta < -0.2) { score += 2; reasons.push('Redução de peso coerente com objetivo.'); }
                else if (weightDelta > 0.2) { score -= 2; reasons.push('Aumento de peso fora do objetivo principal.'); }
            }
            if (bmiDelta !== null) {
                if (bmiDelta < -0.1) score += 1;
                else if (bmiDelta > 0.1) score -= 1;
            }
            if (fatDelta !== null) {
                if (fatDelta < -0.2) { score += 2; reasons.push('Percentual de gordura em queda.'); }
                else if (fatDelta > 0.2) { score -= 2; reasons.push('Percentual de gordura em alta.'); }
            }
        } else if (objective === 'weight_gain') {
            if (weightDelta !== null) {
                if (weightDelta > 0.2) { score += 2; reasons.push('Ganho de peso compatível com objetivo.'); }
                else if (weightDelta < -0.2) { score -= 2; reasons.push('Perda de peso fora do objetivo principal.'); }
            }
            if (fatDelta !== null) {
                if (fatDelta <= 0.2) score += 1;
                else score -= 1;
            }
            if (bmiDelta !== null) {
                if (bmiDelta > 0.1) score += 1;
                else if (bmiDelta < -0.1) score -= 1;
            }
        } else {
            if (weightDelta !== null) {
                if (Math.abs(weightDelta) <= 0.5) { score += 1; reasons.push('Peso estável (boa manutenção).'); }
                else score -= 1;
            }
            if (fatDelta !== null) {
                if (fatDelta < -0.2) { score += 2; reasons.push('Redução de gordura em manutenção/recomposição.'); }
                else if (fatDelta > 0.2) score -= 1;
            }
        }

        const status = score >= 2 ? 'improved' : score <= -2 ? 'worsened' : 'stable';
        return { status, score, reasons, weightDelta, bmiDelta, fatDelta };
    };

    // Carregar dados
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Buscar perfil do paciente para gender e age
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('name, gender, birth_date')
                .eq('id', patientId)
                .single();
            
            if (profile) {
                setPatientProfile(profile);
                setPatientName(profile.name || '');
            }

            const [
                recordsResult,
                chartResult,
                activeGoalResult,
                latestAnamnesisResult,
                longitudinalResult,
                syncFlagsResult
            ] = await Promise.all([
                getAnthropometryRecords(patientId, { limit: 50 }),
                getAnthropometryChartData(patientId),
                getActiveGoal(patientId),
                getLatestAnamnesis(patientId, true),
                getAnthropometryLongitudinalScore(patientId),
                getPatientModuleSyncFlags(patientId)
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
            setLongitudinalScore(longitudinalResult.data || null);
            setSyncFlags(syncFlagsResult.data || null);

            // Calcular peso ideal do último registro
            let latest = null;
            if (recordsResult.data && recordsResult.data.length > 0) {
                latest = [...recordsResult.data].sort((a, b) => {
                    const dateA = new Date(a.record_date || 0).getTime();
                    const dateB = new Date(b.record_date || 0).getTime();
                    if (dateA !== dateB) return dateB - dateA;
                    const revA = Number(a.revision_number || 1);
                    const revB = Number(b.revision_number || 1);
                    return revB - revA;
                })[0];
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

            const latestBmi = latest?.height && latest?.weight
                ? latest.weight / Math.pow(latest.height / 100, 2)
                : null;
            const anamnesisObjective = latestAnamnesisResult?.data?.content?.objetivos?.objetivo_principal;
            const goalType = activeGoalResult?.data?.goal_type;
            setPatientObjective(resolveObjective(goalType, anamnesisObjective, latestBmi));
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
                // Edição auditável: cria nova versão sem sobrescrever o registro antigo
                result = await createAnthropometryRecord({
                    ...data,
                    supersedes_record_id: recordId,
                    change_reason: 'Revisão clínica via módulo de antropometria',
                    created_by_user_id: user?.id || null,
                    results: {
                        ...(data.results || {}),
                        audit: {
                            type: 'revision_copy',
                            source_record_id: recordId,
                            created_at: new Date().toISOString()
                        }
                    }
                });
            } else {
                // Criar novo registro
                result = await createAnthropometryRecord(data);
            }

            if (result.error) throw result.error;

            toast({
                title: 'Sucesso',
                description: recordId
                    ? 'Nova versão criada com sucesso (registro anterior preservado)'
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

    const handleViewRecord = (record) => {
        setSelectedRecord(record);
        const currentIndex = orderedRecords.findIndex((r) => r.id === record.id);
        const previousRecord = currentIndex >= 0 ? orderedRecords[currentIndex + 1] : null;
        setCompareRecordId(previousRecord ? String(previousRecord.id) : '');
        setRecordDetailOpen(true);
    };

    const handleEditFromModal = () => {
        if (!selectedRecord) return;
        setRecordDetailOpen(false);
        handleEdit(selectedRecord);
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

    const orderedRecords = useMemo(
        () =>
            [...records].sort((a, b) => {
                const dateA = new Date(a.record_date || 0).getTime();
                const dateB = new Date(b.record_date || 0).getTime();
                if (dateA !== dateB) return dateB - dateA;
                const revA = Number(a.revision_number || 1);
                const revB = Number(b.revision_number || 1);
                return revB - revA;
            }),
        [records]
    );

    const compareRecord = compareRecordId
        ? orderedRecords.find((r) => String(r.id) === String(compareRecordId))
        : null;
    const comparison = getRecordComparison(selectedRecord, compareRecord);
    const clinicalIndicator = useMemo(
        () => getClinicalIndicator(selectedRecord, compareRecord, patientObjective),
        [selectedRecord, compareRecord, patientObjective]
    );
    const fieldLevelComparison = useMemo(() => {
        if (!selectedRecord || !compareRecord) return null;
        return {
            circumferences: compareObjectFields(selectedRecord.circumferences, compareRecord.circumferences),
            skinfolds: compareObjectFields(selectedRecord.skinfolds, compareRecord.skinfolds),
            bone_diameters: compareObjectFields(selectedRecord.bone_diameters, compareRecord.bone_diameters),
            bioimpedance: compareObjectFields(selectedRecord.bioimpedance, compareRecord.bioimpedance)
        };
    }, [selectedRecord, compareRecord]);
    const versionTimeline = useMemo(() => getVersionTimeline(selectedRecord), [selectedRecord, orderedRecords]);
    const formatDelta = (value, unit = '') => {
        if (value === null || value === undefined) return 'N/A';
        const n = Number(value);
        const prefix = n > 0 ? '+' : '';
        return `${prefix}${n.toFixed(2)}${unit ? ` ${unit}` : ''}`;
    };
    const formatObjectiveLabel = (objective) => {
        if (objective === 'weight_loss') return 'Perda de peso';
        if (objective === 'weight_gain') return 'Ganho de peso';
        return 'Manutenção/Recomposição';
    };
    const statusLabel = (status) => {
        if (status === 'improved') return 'Favorável';
        if (status === 'worsened') return 'Desfavorável';
        return 'Estável';
    };
    const statusClass = (status) => {
        if (status === 'improved') return 'bg-green-100 text-green-700';
        if (status === 'worsened') return 'bg-red-100 text-red-700';
        return 'bg-amber-100 text-amber-700';
    };
    const toggleSectionHighlight = (sectionKey) => {
        setSectionHighlights((prev) =>
            prev.includes(sectionKey)
                ? prev.filter((item) => item !== sectionKey)
                : [...prev, sectionKey]
        );
    };
    const handleExportComparisonPdf = () => {
        if (!selectedRecord || !compareRecord || !comparison) return;

        const doc = new jsPDF();
        const title = 'Comparativo Antropométrico';
        const patientLabel = patientName || `Paciente ${patientId}`;
        let y = 16;
        doc.setFontSize(16);
        doc.text(title, 14, y);
        y += 8;
        doc.setFontSize(11);
        doc.text(`Paciente: ${patientLabel}`, 14, y);
        y += 6;
        doc.text(`Registro atual: ${selectedRecord.record_date}`, 14, y);
        y += 6;
        doc.text(`Registro comparado: ${compareRecord.record_date}`, 14, y);
        y += 8;
        doc.text(`Objetivo clínico: ${formatObjectiveLabel(patientObjective)}`, 14, y);
        y += 8;

        const lines = [
            `Peso: ${formatDelta(comparison.weight, 'kg')}`,
            `Altura: ${formatDelta(comparison.height, 'cm')}`,
            `IMC: ${formatDelta(comparison.bmi)}`,
            `Fotos: ${comparison.photoFields > 0 ? `+${comparison.photoFields}` : comparison.photoFields}`,
            `Circunferências (campos): ${comparison.circumferenceFields > 0 ? `+${comparison.circumferenceFields}` : comparison.circumferenceFields}`,
            `Dobras (campos): ${comparison.skinfoldFields > 0 ? `+${comparison.skinfoldFields}` : comparison.skinfoldFields}`,
            `Diâmetros (campos): ${comparison.diameterFields > 0 ? `+${comparison.diameterFields}` : comparison.diameterFields}`
        ];

        if (clinicalIndicator) {
            y += 2;
            doc.text(`Indicador clínico: ${clinicalIndicator.status === 'improved' ? 'Melhora' : clinicalIndicator.status === 'worsened' ? 'Piora' : 'Estável'}`, 14, y);
            y += 6;
        }

        lines.forEach((line) => {
            doc.text(line, 14, y);
            y += 6;
        });

        if (clinicalIndicator?.reasons?.length) {
            y += 2;
            doc.text('Notas clínicas:', 14, y);
            y += 6;
            clinicalIndicator.reasons.forEach((reason) => {
                doc.text(`- ${reason}`, 14, y);
                y += 6;
            });
        }

        const fileName = `comparativo_antropometria_${patientLabel.replace(/\s+/g, '_')}_${selectedRecord.record_date}.pdf`;
        doc.save(fileName);
    };

    const filteredRecords = useMemo(() => {
        if (historyFilter === 'all') return orderedRecords;
        if (historyFilter === 'complete') {
            return orderedRecords.filter((r) => getRecordSectionCount(r) === 5);
        }
        if (historyFilter === 'partial') {
            return orderedRecords.filter((r) => getRecordSectionCount(r) > 0 && getRecordSectionCount(r) < 5);
        }
        if (historyFilter === 'versioned') {
            return orderedRecords.filter((r) => r?.supersedes_record_id || r?.results?.audit?.source_record_id);
        }
        return orderedRecords;
    }, [orderedRecords, historyFilter]);

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
                        <span className="break-words">Avaliação Antropométrica</span>
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">
                            Acompanhamento de peso, altura e IMC
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                        <div className="rounded-md border bg-muted/30 px-3 py-2 shadow-sm">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Objetivo clínico</p>
                            <p className="text-sm font-semibold text-foreground">{formatObjectiveLabel(patientObjective)}</p>
                        </div>
                        {latestRecord && latestRecord.weight && (
                            <div className="rounded-md border bg-card px-3 py-2 shadow-sm">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Peso atual</p>
                                <p className="text-sm font-semibold text-foreground">{latestRecord.weight} kg</p>
                            </div>
                        )}
                        {idealWeightRange && (
                            <div className="rounded-md border bg-primary/5 border-primary/20 px-3 py-2 shadow-sm">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Faixa de peso ideal</p>
                                <p className="text-sm font-semibold text-[#5f6f52]">
                                    {idealWeightRange.min.toFixed(1)} - {idealWeightRange.max.toFixed(1)} kg
                                </p>
                            </div>
                        )}
                        {idealWeightRange?.current && (
                            <div className="rounded-md border bg-card px-3 py-2 shadow-sm">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status atual</p>
                                <Badge className={`text-xs ${
                                    idealWeightRange.current < idealWeightRange.min
                                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                                        : idealWeightRange.current > idealWeightRange.max
                                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100'
                                        : 'bg-green-100 text-green-700 hover:bg-green-100'
                                }`}>
                                    {idealWeightRange.current < idealWeightRange.min
                                        ? 'Abaixo do ideal'
                                        : idealWeightRange.current > idealWeightRange.max
                                        ? 'Acima do ideal'
                                        : 'Na faixa ideal'}
                                </Badge>
                            </div>
                        )}
                    </div>

                    {longitudinalScore?.has_data && (
                        <div className="mt-3 rounded-md border bg-card p-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                                Score longitudinal (30/60/90 dias)
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {[30, 60, 90].map((days) => {
                                    const item = longitudinalScore?.[`d${days}`];
                                    if (!item?.has_data) {
                                        return (
                                            <div key={days} className="rounded-md border bg-muted/30 p-2">
                                                <p className="text-xs text-muted-foreground">{days} dias</p>
                                                <p className="text-sm font-medium text-muted-foreground">Sem base</p>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={days} className="rounded-md border p-2">
                                            <p className="text-xs text-muted-foreground">{days} dias</p>
                                            <div className="mt-1 flex items-center justify-between gap-2">
                                                <Badge className={`text-xs ${statusClass(item.status)}`}>
                                                    {statusLabel(item.status)}
                                                </Badge>
                                                <span className="text-xs font-semibold">
                                                    Score {item.score}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground mt-1">
                                                Delta peso: {item.weight_delta ?? 'N/A'} kg
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {(syncFlags?.needs_energy_recalc || syncFlags?.needs_meal_plan_review) && (
                        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                            <p className="text-xs font-semibold text-amber-800">
                                Sincronização clínica pendente
                            </p>
                            <p className="text-xs text-amber-700 mt-0.5">
                                Há atualização antropométrica pendente de revisão em GET/Plano alimentar.
                            </p>
                        </div>
                    )}
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
                <h2 className="text-2xl font-bold">Histórico de Registros</h2>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                    Consulte a evolução por data, compare resultados e abra os detalhes completos de cada avaliação.
                </p>
                <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                    <div className="hidden sm:flex flex-wrap gap-2">
                        <Button variant={historyFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setHistoryFilter('all')}>
                            Todos
                        </Button>
                        <Button variant={historyFilter === 'complete' ? 'default' : 'outline'} size="sm" onClick={() => setHistoryFilter('complete')}>
                            Completos
                        </Button>
                        <Button variant={historyFilter === 'partial' ? 'default' : 'outline'} size="sm" onClick={() => setHistoryFilter('partial')}>
                            Parciais
                        </Button>
                        <Button variant={historyFilter === 'versioned' ? 'default' : 'outline'} size="sm" onClick={() => setHistoryFilter('versioned')}>
                            Versões
                        </Button>
                    </div>
                    <div className="sm:hidden">
                        <Select value={historyFilter} onValueChange={setHistoryFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filtrar histórico" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                <SelectItem value="complete">Completos</SelectItem>
                                <SelectItem value="partial">Parciais</SelectItem>
                                <SelectItem value="versioned">Versões auditáveis</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {filteredRecords.length} registro(s)
                    </p>
                </div>
                <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-2">Destaque de seções no histórico</p>
                    <div className="flex flex-wrap gap-2">
                        {[
                            ['basico', 'Básico'],
                            ['circunferencias', 'Circunferências'],
                            ['dobras', 'Dobras'],
                            ['diametros', 'Diâmetros'],
                            ['fotos', 'Fotos']
                        ].map(([key, label]) => {
                            const selected = sectionHighlights.includes(key);
                            return (
                                <Button
                                    key={key}
                                    type="button"
                                    size="sm"
                                    variant={selected ? 'default' : 'outline'}
                                    className={selected ? 'bg-[#5f6f52] hover:bg-[#4c5a41]' : ''}
                                    onClick={() => toggleSectionHighlight(key)}
                                >
                                    {label}
                                </Button>
                            );
                        })}
                    </div>
                </div>
                <AnthropometryTable
                    records={filteredRecords}
                    onEdit={handleEdit}
                    onView={handleViewRecord}
                    onDelete={handleDelete}
                    highlightSections={sectionHighlights}
                    loading={loading}
                />
            </div>

            <Dialog open={recordDetailOpen} onOpenChange={setRecordDetailOpen}>
                <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Detalhes do Registro</DialogTitle>
                        <DialogDescription>
                            Visualize todos os dados da avaliação, compare com outra data e gere nova versão editada.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedRecord && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">
                                    Data: {selectedRecord.record_date}
                                </Badge>
                                {(selectedRecord?.supersedes_record_id || selectedRecord?.results?.audit?.source_record_id) && (
                                    <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">
                                        Versão auditável
                                    </Badge>
                                )}
                            </div>

                            {versionTimeline.length > 1 && (
                                <div className="rounded-md border p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                        Timeline de versões
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {versionTimeline.map((item, idx) => (
                                            <React.Fragment key={item.id}>
                                                <Badge
                                                    variant={item.id === selectedRecord.id ? 'default' : 'outline'}
                                                    className={item.id === selectedRecord.id ? 'bg-[#5f6f52] hover:bg-[#5f6f52]' : ''}
                                                >
                                                    {idx === 0 ? 'Original' : `V${idx}`} • {item.record_date}
                                                </Badge>
                                                {idx < versionTimeline.length - 1 && (
                                                    <span className="text-xs text-muted-foreground">→</span>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                    Seções preenchidas
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(getRecordSections(selectedRecord)).map(([key, enabled]) => (
                                        <Badge
                                            key={key}
                                            variant={enabled ? 'default' : 'outline'}
                                            className={enabled ? 'bg-[#5f6f52] hover:bg-[#5f6f52]' : ''}
                                        >
                                            {key === 'basico' && 'Básico'}
                                            {key === 'circunferencias' && 'Circunferências'}
                                            {key === 'dobras' && 'Dobras/Composição'}
                                            {key === 'diametros' && 'Diâmetros'}
                                            {key === 'fotos' && 'Fotos'}
                                        </Badge>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <div className="rounded-md border p-2">
                                    <p className="text-[11px] uppercase text-muted-foreground">Peso</p>
                                    <p className="font-semibold">{selectedRecord.weight ?? 'N/A'} {selectedRecord.weight ? 'kg' : ''}</p>
                                </div>
                                <div className="rounded-md border p-2">
                                    <p className="text-[11px] uppercase text-muted-foreground">Altura</p>
                                    <p className="font-semibold">{selectedRecord.height ?? 'N/A'} {selectedRecord.height ? 'cm' : ''}</p>
                                </div>
                                <div className="rounded-md border p-2">
                                    <p className="text-[11px] uppercase text-muted-foreground">Circ.</p>
                                    <p className="font-semibold">{getFilledCount(selectedRecord.circumferences)} campos</p>
                                </div>
                                <div className="rounded-md border p-2">
                                    <p className="text-[11px] uppercase text-muted-foreground">Dobras</p>
                                    <p className="font-semibold">{getFilledCount(selectedRecord.skinfolds)} campos</p>
                                </div>
                            </div>

                            {selectedRecord.notes && (
                                <div className="rounded-md border p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Observações</p>
                                    <p className="text-sm text-foreground whitespace-pre-wrap">{selectedRecord.notes}</p>
                                </div>
                            )}

                            <div className="rounded-md border p-3 space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Comparar com outro registro
                                </p>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            const previous = getPreviousRecord(selectedRecord);
                                            setCompareRecordId(previous ? String(previous.id) : '');
                                        }}
                                    >
                                        Comparar com anterior automaticamente
                                    </Button>
                                    <Select value={compareRecordId} onValueChange={setCompareRecordId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione uma data para comparar" />
                                        </SelectTrigger>
                                        <SelectContent>
                                        {orderedRecords
                                                .filter((r) => r.id !== selectedRecord.id)
                                                .map((r) => (
                                                    <SelectItem key={r.id} value={String(r.id)}>
                                                        {r.record_date}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {comparison && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                        <div className="rounded-md bg-muted/40 p-2">
                                            <p className="text-muted-foreground">Peso</p>
                                            <p className={`font-semibold ${(comparison.weight ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                {formatDelta(comparison.weight, 'kg')}
                                            </p>
                                        </div>
                                        <div className="rounded-md bg-muted/40 p-2">
                                            <p className="text-muted-foreground">Altura</p>
                                            <p className="font-semibold">
                                                {formatDelta(comparison.height, 'cm')}
                                            </p>
                                        </div>
                                        <div className="rounded-md bg-muted/40 p-2">
                                            <p className="text-muted-foreground">IMC</p>
                                            <p className="font-semibold">
                                                {formatDelta(comparison.bmi)}
                                            </p>
                                        </div>
                                        <div className="rounded-md bg-muted/40 p-2">
                                            <p className="text-muted-foreground">Fotos</p>
                                            <p className="font-semibold">{comparison.photoFields > 0 ? `+${comparison.photoFields}` : comparison.photoFields}</p>
                                        </div>
                                        <div className="rounded-md bg-muted/40 p-2">
                                            <p className="text-muted-foreground">Circ. (campos)</p>
                                            <p className="font-semibold">{comparison.circumferenceFields > 0 ? `+${comparison.circumferenceFields}` : comparison.circumferenceFields}</p>
                                        </div>
                                        <div className="rounded-md bg-muted/40 p-2">
                                            <p className="text-muted-foreground">Dobras (campos)</p>
                                            <p className="font-semibold">{comparison.skinfoldFields > 0 ? `+${comparison.skinfoldFields}` : comparison.skinfoldFields}</p>
                                        </div>
                                        <div className="rounded-md bg-muted/40 p-2">
                                            <p className="text-muted-foreground">Diâmetros (campos)</p>
                                            <p className="font-semibold">{comparison.diameterFields > 0 ? `+${comparison.diameterFields}` : comparison.diameterFields}</p>
                                        </div>
                                    </div>
                                )}

                                {clinicalIndicator && (
                                    <div className="rounded-md border p-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                            Indicador clínico (baseado no objetivo do paciente)
                                        </p>
                                        <Badge
                                            className={
                                                clinicalIndicator.status === 'improved'
                                                    ? 'bg-green-100 text-green-700 hover:bg-green-100'
                                                    : clinicalIndicator.status === 'worsened'
                                                    ? 'bg-red-100 text-red-700 hover:bg-red-100'
                                                    : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                                            }
                                        >
                                            {clinicalIndicator.status === 'improved'
                                                ? 'Evolução favorável'
                                                : clinicalIndicator.status === 'worsened'
                                                ? 'Atenção: evolução desfavorável'
                                                : 'Evolução estável'}
                                        </Badge>
                                        {clinicalIndicator.reasons?.length > 0 && (
                                            <ul className="mt-2 space-y-1">
                                                {clinicalIndicator.reasons.map((reason, idx) => (
                                                    <li key={`${reason}-${idx}`} className="text-xs text-muted-foreground">
                                                        - {reason}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}

                                {fieldLevelComparison && (
                                    <div className="space-y-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Comparação campo a campo
                                        </p>

                                        {[
                                            ['Circunferências', fieldLevelComparison.circumferences],
                                            ['Dobras', fieldLevelComparison.skinfolds],
                                            ['Diâmetros', fieldLevelComparison.bone_diameters],
                                            ['Bioimpedância', fieldLevelComparison.bioimpedance]
                                        ].map(([label, changes]) => (
                                            <div key={label} className="rounded-md border p-2">
                                                <p className="text-xs font-medium text-foreground mb-1">{label}</p>
                                                {changes.length === 0 ? (
                                                    <p className="text-xs text-muted-foreground">Sem mudanças detectadas.</p>
                                                ) : (
                                                    <div className="space-y-1">
                                                        {changes.slice(0, 6).map((change) => {
                                                            const delta = change.delta;
                                                            const isPositive = delta !== null && delta > 0;
                                                            const isNegative = delta !== null && delta < 0;
                                                            return (
                                                                <div key={`${label}-${change.key}`} className="flex items-center justify-between gap-2 text-xs">
                                                                    <span className="text-muted-foreground">{change.key}</span>
                                                                    <span className="font-medium">{String(change.previousValue)} → {String(change.currentValue)}</span>
                                                                    {delta === null ? (
                                                                        <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                                                                    ) : isPositive ? (
                                                                        <TrendingUp className="w-3.5 h-3.5 text-red-600" />
                                                                    ) : isNegative ? (
                                                                        <TrendingDown className="w-3.5 h-3.5 text-green-600" />
                                                                    ) : (
                                                                        <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                        {changes.length > 6 && (
                                                            <p className="text-[11px] text-muted-foreground">
                                                                +{changes.length - 6} mudanças adicionais...
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRecordDetailOpen(false)}>
                            Fechar
                        </Button>
                        <Button variant="outline" onClick={handleExportComparisonPdf} disabled={!compareRecord || !comparison}>
                            Exportar comparativo (PDF)
                        </Button>
                        <Button onClick={handleEditFromModal}>
                            Editar criando nova versão
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AnthropometryPage;
