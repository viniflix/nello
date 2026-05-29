import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import jsPDF from 'jspdf';
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

export const useAnthropometryController = ({ patientId, user, resolveLoading, resolveError }) => {
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
    const [patientName, setPatientName] = useState('');
    const [patientObjective, setPatientObjective] = useState('maintenance');
    const [longitudinalScore, setLongitudinalScore] = useState(null);
    const [syncFlags, setSyncFlags] = useState(null);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [recordDetailOpen, setRecordDetailOpen] = useState(false);
    const [compareRecordId, setCompareRecordId] = useState('');
    const [historyFilter, setHistoryFilter] = useState('all');
    const [sectionHighlights, setSectionHighlights] = useState([]);
    const [formExpanded, setFormExpanded] = useState(false);

    const getFilledCount = (obj) => Object.values(obj || {}).filter((v) => v !== null && v !== undefined && v !== '').length;

    const formatLastRecordTime = (record) => {
        if (!record) return '';
        const dt = record.created_at ? new Date(record.created_at) : (record.record_date ? new Date(record.record_date + 'T12:00:00') : null);
        if (!dt || isNaN(dt.getTime())) return '';
        const now = new Date();
        const diffMs = now - dt;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffHours < 1) return 'há menos de 1 hora';
        if (diffHours < 24) return `há ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
        if (diffDays <= 5) return `há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
        return `dia ${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    };

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

    const loadData = useCallback(async () => {
        if (!patientId) {
            setLoading(false);
            setError(resolveError?.message || 'Paciente não identificado.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('name, gender, birth_date, ethnicity')
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

            if (recordsResult.error) {
                console.error('Erro ao buscar registros:', recordsResult.error);
                throw new Error('Erro ao buscar registros antropométricos');
            }
            if (chartResult.error) {
                console.error('Erro ao buscar dados de gráficos:', chartResult.error);
                throw new Error('Erro ao buscar dados de gráficos');
            }

            setRecords(recordsResult.data || []);
            setChartData(chartResult.data || []);
            setLongitudinalScore(longitudinalResult.data || null);
            setSyncFlags(syncFlagsResult.data || null);

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
    }, [patientId, toast, resolveError]);

    useEffect(() => {
        if (resolveLoading) return;
        loadData();
    }, [loadData, resolveLoading]);

    const handleSubmit = async (data, recordId = null) => {
        setSubmitting(true);

        try {
            let result;

            if (recordId) {
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

            setEditingRecord(null);
            setFormExpanded(false);
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

    const handleEdit = (record) => {
        setEditingRecord(record);
        setFormExpanded(true);
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

    const handleCancelEdit = () => {
        setEditingRecord(null);
    };

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

    return {
        loading,
        submitting,
        error,
        records,
        orderedRecords,
        filteredRecords,
        chartData,
        editingRecord,
        latestRecord,
        idealWeightRange,
        patientProfile,
        patientName,
        patientObjective,
        longitudinalScore,
        syncFlags,
        selectedRecord,
        recordDetailOpen,
        compareRecordId,
        compareRecord,
        comparison,
        clinicalIndicator,
        fieldLevelComparison,
        versionTimeline,
        historyFilter,
        sectionHighlights,
        formExpanded,
        
        setRecordDetailOpen,
        setCompareRecordId,
        setHistoryFilter,
        setFormExpanded,
        setEditingRecord,
        
        loadData,
        handleSubmit,
        handleEdit,
        handleViewRecord,
        handleEditFromModal,
        handleDelete,
        handleCancelEdit,
        handleExportComparisonPdf,
        toggleSectionHighlight,
        
        formatDelta,
        formatObjectiveLabel,
        statusLabel,
        statusClass,
        getRecordSections,
        getRecordSectionCount,
        formatLastRecordTime,
        getPreviousRecord,
        getFilledCount
    };
};
