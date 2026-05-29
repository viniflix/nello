import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { patientHubRoute } from '@/lib/utils/patientRoutes';
import { ArrowLeft, RefreshCw, AlertCircle, BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AnthropometryForm from '@/components/anthropometry/AnthropometryForm';
import AnthropometryTable from '@/components/anthropometry/AnthropometryTable';
import WeightChart from '@/components/anthropometry/WeightChart';
import IMCChart from '@/components/anthropometry/IMCChart';
import CompositionCharts from '@/components/anthropometry/CompositionCharts';
import SomatotypeChart from '@/components/anthropometry/SomatotypeChart';
import { useAuth } from '@/contexts/AuthContext';
import { useAnthropometryController } from '@/hooks/useAnthropometryController';

const AnthropometryPage = () => {
    const { patientId, paramValue, loading: resolveLoading, error: resolveError } = useResolvedPatientId();
    const navigate = useNavigate();
    const { user } = useAuth();

    const {
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
    } = useAnthropometryController({ patientId, user, resolveLoading, resolveError });

    const historySectionRef = useRef(null);

    if (resolveLoading || resolveError || !patientId) {
        if (resolveLoading) {
            return (
                <div className="container mx-auto p-4 max-w-7xl">
                    <div className="animate-pulse space-y-4">
                        <div className="h-8 bg-muted rounded w-48" />
                        <div className="h-64 bg-muted rounded" />
                    </div>
                </div>
            );
        }
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
                <Alert variant="destructive" className="max-w-md mb-6">
                    <AlertDescription>Paciente não encontrado.</AlertDescription>
                </Alert>
                <Button variant="outline" onClick={() => navigate('/nutritionist/patients')} className="gap-2">
                    <ArrowLeft className="w-4 h-4 shrink-0" />
                    Voltar
                </Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 sm:p-6 max-w-7xl space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(patientHubRoute({ id: patientId, slug: paramValue }, 'body'))}
                        className="gap-2 -ml-2 shrink-0 text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10"
                    >
                        <ArrowLeft className="w-4 h-4 shrink-0" />
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
                        {idealWeightRange?.min !== undefined && idealWeightRange?.max !== undefined && (
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

            {/* Formulário - colapsado quando há registro recente e não está editando */}
            {(formExpanded || editingRecord || !latestRecord) ? (
                <AnthropometryForm
                    patientId={patientId}
                    initialData={editingRecord}
                    onSubmit={handleSubmit}
                    onCancel={() => { handleCancelEdit(); setFormExpanded(false); }}
                    loading={submitting}
                    patientGender={patientProfile?.gender}
                    patientBirthDate={patientProfile?.birth_date}
                    patientEthnicity={patientProfile?.ethnicity}
                />
            ) : (
                <div className="rounded-lg border-2 border-dashed border-[#a9b388] bg-[#fefae0]/30 p-6">
                    <p className="text-base font-medium text-foreground mb-1">
                        Último registro {formatLastRecordTime(latestRecord)}
                    </p>
                    <p className="text-sm text-muted-foreground mb-4">
                        {latestRecord?.weight && `${latestRecord.weight} kg`}
                        {latestRecord?.height && ` • ${latestRecord.height} cm`}
                        {latestRecord?.weight && latestRecord?.height && (
                            <span> • IMC {((latestRecord.weight / Math.pow(latestRecord.height / 100, 2))).toFixed(1)}</span>
                        )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={() => setFormExpanded(true)} className="gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Deseja registrar novas medidas?
                        </Button>
                        <Button variant="outline" onClick={() => historySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                            Ver histórico
                        </Button>
                    </div>
                </div>
            )}

            {/* Gráficos */}
            <div className="space-y-6">
                {/* Composição Corporal (se houver dados) */}
                {records.some(r => r.results || r.bioimpedance) && (
                    <CompositionCharts data={records} />
                )}
                
                {/* Somatotipo Chart (se houver dados do último registro) */}
                {latestRecord?.results?.somatotype && typeof latestRecord.results.somatotype === 'object' && (
                    <SomatotypeChart somatotype={latestRecord.results.somatotype} />
                )}
                
                {/* Gráficos tradicionais */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <WeightChart data={chartData} />
                    <IMCChart
                        data={chartData}
                        patientAge={patientProfile?.birth_date ? Math.floor((Date.now() - new Date(patientProfile.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null}
                        patientSex={patientProfile?.gender}
                        patientEthnicity={patientProfile?.ethnicity}
                    />
                </div>
            </div>

            {/* Tabela de Registros */}
            <div ref={historySectionRef}>
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
