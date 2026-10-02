import {useLabResultsPageController} from './useLabResultsPageController';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { ArrowLeft, Droplet, Plus, Edit, Trash2, Calendar, Activity, AlertCircle, Search, Filter, Loader2, Save, X, FileText, Upload, Eye, Download, TrendingUp, TrendingDown, Minus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { cn } from '@/lib/utils';
import { getTodayIsoDate } from '@/lib/utils/date';
import {
    getPatientLabResults,
    getLabRiskRules,
    classifyLabResultsRiskBatch,
    createLabResult,
    updateLabResult,
    deleteLabResult,
    confirmLabResultInterpretation,
    getLabResultPDFUrl,
    uploadLabResultPDF,
    calculateStatus
} from '@/lib/supabase/lab-results-queries';
import ConductSuggestionsCard from '@/components/lab-results/ConductSuggestionsCard';
import { patientHubRoute } from '@/lib/utils/patientRoutes';
import { PageHeaderSkeleton, CardSkeleton } from '@/components/ui/custom-skeletons';

const LabResultsPage = () => {
const {resolveLoading,patientId,resolveError,navigate,loading,paramValue,patientName,handleOpenModal,searchTerm,setSearchTerm,statusFilter,setStatusFilter,labResults,getRiskBadge,riskSummary,markerOptions,selectedMarkerKey,setSelectedMarkerKey,selectedTrend,getTrendMeta,selectedTimeline,filteredResults,getStatusBadge,setLabToConfirm,handleViewPdf,setLabToDelete,setDeleteConfirmOpen,modalOpen,setModalOpen,editingLab,formData,handleInputChange,pdfFile,fileInputRef,handleFileChange,setPdfFile,handleCloseModal,saving,uploading,handleSave,labToConfirm,confirmationReason,setConfirmationReason,handleConfirmInterpretation,confirming,deleteConfirmOpen,labToDelete,handleDelete,pdfViewerOpen,setPdfViewerOpen,viewingPdfUrl}=useLabResultsPageController();
if (resolveLoading || !patientId) {
        return (
            <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-8 space-y-6">
                <PageHeaderSkeleton />
                <CardSkeleton />
                <CardSkeleton />
            </div>
        );
    }
    if (resolveError) {
        return (
            <div className="flex flex-col min-h-screen bg-background items-center justify-center p-8">
                <AlertCircle className="w-10 h-10 text-destructive" />
                <p className="mt-4 text-sm text-foreground">Paciente não encontrado.</p>
                <Button variant="outline" className="mt-4 gap-2" onClick={() => navigate(-1)}>
                    <ArrowLeft className="w-4 h-4 shrink-0" />
                    Voltar
                </Button>
            </div>
        );
    }

    return loading ? (
        <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-8 space-y-6">
            <PageHeaderSkeleton />
            <CardSkeleton />
            <CardSkeleton />
        </div>
    ) : (
        <div className="flex flex-col min-h-screen bg-background overflow-x-hidden">
            <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-4 md:py-8 min-w-0">
                {/* Header */}
                <div className="flex flex-col gap-4 mb-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(patientHubRoute({ id: patientId, slug: paramValue }, 'clinical'))}
                        className="gap-2 -ml-2 w-fit shrink-0 text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10"
                    >
                        <ArrowLeft className="w-4 h-4 shrink-0" />
                        Voltar
                    </Button>
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
                                <Droplet className="w-6 h-6 md:w-8 md:h-8 text-[#b99470]" />
                                <span className="truncate">Exames Laboratoriais</span>
                            </h1>
                            <p className="text-sm text-muted-foreground mt-1 truncate">
                                Paciente: <span className="font-medium text-foreground">{patientName}</span>
                            </p>
                        </div>
                        <Button onClick={() => handleOpenModal()} className="gap-2 w-full sm:w-auto">
                            <Plus className="w-4 h-4" />
                            Adicionar Exame
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <Card className="mb-6">
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <Label htmlFor="search">Buscar exame</Label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        id="search"
                                        placeholder="Digite o nome do exame..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="status-filter">Filtrar por status</Label>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger id="status-filter">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="normal">Normal</SelectItem>
                                        <SelectItem value="low">Baixo</SelectItem>
                                        <SelectItem value="high">Alto</SelectItem>
                                        <SelectItem value="pending">Pendente</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Risco + Timeline por marcador */}
                {labResults.length > 0 && (
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle className="text-lg">Risco Laboratorial e Tendência</CardTitle>
                            <CardDescription>
                                Semáforo de risco por regra e evolução temporal por marcador.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                                {getRiskBadge('high')} <span className="text-sm text-muted-foreground">{riskSummary.high}</span>
                                {getRiskBadge('medium')} <span className="text-sm text-muted-foreground">{riskSummary.medium}</span>
                                {getRiskBadge('low')} <span className="text-sm text-muted-foreground">{riskSummary.low}</span>
                                {getRiskBadge('none')} <span className="text-sm text-muted-foreground">
                                    {Math.max(0, (riskSummary.total || 0) - (riskSummary.high || 0) - (riskSummary.medium || 0) - (riskSummary.low || 0))}
                                </span>
                            </div>

                            {markerOptions.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="marker-select">Marcador</Label>
                                        <Select value={selectedMarkerKey} onValueChange={setSelectedMarkerKey}>
                                            <SelectTrigger id="marker-select">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {markerOptions.map((option) => (
                                                    <SelectItem key={option.markerKey} value={option.markerKey}>
                                                        {option.label} ({option.count})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="md:col-span-2 rounded-lg border p-3">
                                        {selectedTrend ? (
                                            (() => {
                                                const trendMeta = getTrendMeta(selectedTrend.direction);
                                                const TrendIcon = trendMeta.icon;
                                                return (
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <p className="text-xs text-muted-foreground">Último valor</p>
                                                            <p className="text-lg font-semibold">
                                                                {selectedTrend.latest?.test_value ?? '--'} {selectedTrend.latest?.test_unit || ''}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {selectedTrend.latest?.test_date ? new Date(selectedTrend.latest.test_date).toLocaleDateString('pt-BR') : 'sem data'}
                                                            </p>
                                                        </div>
                                                        <div className={cn('flex items-center gap-1 text-sm font-medium', trendMeta.className)}>
                                                            <TrendIcon className="w-4 h-4" />
                                                            {trendMeta.label}
                                                            {selectedTrend.delta != null ? ` (${selectedTrend.delta > 0 ? '+' : ''}${selectedTrend.delta.toFixed(2)})` : ''}
                                                        </div>
                                                    </div>
                                                );
                                            })()
                                        ) : (
                                            <p className="text-sm text-muted-foreground">Sem dados para tendência.</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {selectedTimeline.length > 0 && (
                                <div className="space-y-2 rounded-lg border p-3">
                                    <p className="text-sm font-medium">Linha do tempo</p>
                                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                        {[...selectedTimeline].reverse().slice(0, 8).map((item) => (
                                            <div key={item.id} className="flex items-center justify-between rounded-md border p-2">
                                                <div>
                                                    <p className="text-sm font-medium">
                                                        {item.test_value ?? '--'} {item.test_unit || ''}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {item.test_date ? new Date(item.test_date).toLocaleDateString('pt-BR') : 'sem data'}
                                                    </p>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    {getRiskBadge(item.risk_level || 'none')}
                                                    {item.risk_reason ? (
                                                        <span className="text-[11px] text-muted-foreground">{item.risk_reason}</span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Sugestões de Conduta (exames + meta) */}
                {labResults.length > 0 && (
                    <div className="mb-6">
                        <ConductSuggestionsCard patientId={patientId} />
                    </div>
                )}

                {/* Results */}
                {filteredResults.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="py-12 text-center">
                            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                                <Droplet className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">
                                {labResults.length === 0 ? 'Nenhum exame registrado' : 'Nenhum resultado encontrado'}
                            </h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                {labResults.length === 0
                                    ? 'Adicione o primeiro exame laboratorial do paciente'
                                    : 'Tente ajustar os filtros de busca'}
                            </p>
                            {labResults.length === 0 && (
                                <Button onClick={() => handleOpenModal()} className="gap-2">
                                    <Plus className="w-4 h-4" />
                                    Adicionar Primeiro Exame
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {filteredResults.map((lab) => (
                            <Card key={lab.id} className="hover:shadow-md transition-all">
                                <CardContent className="py-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                <h3 className="text-lg font-semibold truncate">{lab.test_name}</h3>
                                                {lab.pdf_url && (
                                                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">
                                                        <FileText className="w-3 h-3 mr-1" />
                                                        PDF
                                                    </Badge>
                                                )}
                                                {(lab.test_value !== null && lab.test_value !== undefined && lab.test_value !== '') && lab.status && getStatusBadge(lab.status)}
                                                {(lab.test_value !== null && lab.test_value !== undefined && lab.test_value !== '') && getRiskBadge(lab.risk_level || 'none')}
                                                <Badge variant="outline" className={cn('text-xs', lab.interpretation_status === 'confirmed' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800')}>
                                                    {lab.interpretation_status === 'confirmed' ? 'INTERPRETAÇÃO VALIDADA' : 'AGUARDA VALIDAÇÃO PROFISSIONAL'}
                                                </Badge>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                                                {/* Valores manuais */}
                                                {lab.test_value && (
                                                    <>
                                                        <div>
                                                            <span className="text-muted-foreground">Valor:</span>{' '}
                                                            <span className="font-medium">{lab.test_value} {lab.test_unit || ''}</span>
                                                        </div>
                                                        {lab.reference_min != null && lab.reference_max != null && (
                                                            <div>
                                                                <span className="text-muted-foreground">Referência:</span>{' '}
                                                                <span className="font-medium">{lab.reference_min} - {lab.reference_max}</span>
                                                            </div>
                                                        )}
                                                    </>
                                                )}

                                                {/* PDF */}
                                                {lab.pdf_url && !lab.test_value && (
                                                    <div className="flex items-center gap-1">
                                                        <FileText className="w-3 h-3 text-muted-foreground" />
                                                        <span className="text-muted-foreground truncate">
                                                            {lab.pdf_filename || 'Arquivo PDF'}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Data */}
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3 text-muted-foreground" />
                                                    <span className="text-muted-foreground">
                                                        {new Date(lab.test_date).toLocaleDateString('pt-BR')}
                                                    </span>
                                                </div>
                                            </div>

                                            {lab.notes && (
                                                <p className="text-xs text-muted-foreground mt-2 italic">
                                                    Obs: {lab.notes}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            {lab.interpretation_status !== 'confirmed' && (
                                                <Button variant="outline" size="icon" onClick={() => setLabToConfirm(lab)} title="Validar interpretação profissional">
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                                                </Button>
                                            )}
                                            {lab.pdf_url && (
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    onClick={() => handleViewPdf(lab.pdf_url)}
                                                    title="Visualizar PDF"
                                                >
                                                    <Eye className="w-4 h-4 text-blue-600" />
                                                </Button>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => handleOpenModal(lab)}
                                                title="Editar"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => {
                                                    setLabToDelete(lab);
                                                    setDeleteConfirmOpen(true);
                                                }}
                                                title="Invalidar registro"
                                            >
                                                <Trash2 className="w-4 h-4 text-destructive" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Summary */}
                {labResults.length > 0 && (
                    <Card className="mt-6">
                        <CardContent className="py-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">
                                    Total de exames: <strong>{labResults.length}</strong>
                                </span>
                                {filteredResults.length !== labResults.length && (
                                    <span className="text-muted-foreground">
                                        Exibindo: <strong>{filteredResults.length}</strong>
                                    </span>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Add/Edit Modal */}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Droplet className="w-5 h-5 text-primary" />
                            {editingLab ? 'Editar Exame' : 'Adicionar Novo Exame'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingLab ? 'Atualize as informações do exame' : 'Preencha valores e/ou anexe PDF'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Nome do Exame */}
                        <div className="space-y-2">
                            <Label htmlFor="test_name">Nome do Exame *</Label>
                            <Input
                                id="test_name"
                                placeholder="Ex: Hemograma, Glicemia, Colesterol Total"
                                value={formData.test_name}
                                onChange={(e) => handleInputChange('test_name', e.target.value)}
                            />
                        </div>

                        {/* Valores Manuais */}
                        <div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-muted">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Edit className="w-4 h-4" />
                                Valores Manuais (opcional)
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="test_value">Valor do Resultado</Label>
                                    <Input
                                        id="test_value"
                                        placeholder="Ex: 95"
                                        value={formData.test_value}
                                        onChange={(e) => handleInputChange('test_value', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="test_unit">Unidade</Label>
                                    <Input
                                        id="test_unit"
                                        placeholder="Ex: mg/dL, ng/mL"
                                        value={formData.test_unit}
                                        onChange={(e) => handleInputChange('test_unit', e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="reference_min">Referência Mínima</Label>
                                    <Input
                                        id="reference_min"
                                        type="number"
                                        step="0.01"
                                        placeholder="Ex: 70"
                                        value={formData.reference_min}
                                        onChange={(e) => handleInputChange('reference_min', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="reference_max">Referência Máxima</Label>
                                    <Input
                                        id="reference_max"
                                        type="number"
                                        step="0.01"
                                        placeholder="Ex: 100"
                                        value={formData.reference_max}
                                        onChange={(e) => handleInputChange('reference_max', e.target.value)}
                                    />
                                </div>
                            </div>

                            {formData.test_value && formData.reference_min && formData.reference_max && (
                                <div className="p-3 bg-background rounded-lg border">
                                    <div className="text-xs font-medium text-muted-foreground mb-1">Status calculado:</div>
                                    <div>
                                        {getStatusBadge(calculateStatus(formData.test_value, formData.reference_min, formData.reference_max))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Upload de PDF */}
                        <div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-muted">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <FileText className="w-4 h-4" />
                                Anexar PDF (opcional)
                            </div>

                            {editingLab?.pdf_url && !pdfFile && (
                                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-green-600" />
                                            <div>
                                                <div className="text-sm font-medium text-green-900">
                                                    PDF anexado
                                                </div>
                                                <div className="text-xs text-green-700">
                                                    {editingLab.pdf_filename}
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleViewPdf(editingLab.pdf_url)}
                                        >
                                            <Eye className="w-4 h-4 mr-1" />
                                            Ver PDF
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="pdf-upload">
                                    {pdfFile || editingLab?.pdf_url ? 'Substituir PDF' : 'Anexar PDF do Exame'}
                                </Label>
                                <input
                                    ref={fileInputRef}
                                    id="pdf-upload"
                                    type="file"
                                    accept="application/pdf"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {pdfFile ? `Arquivo selecionado: ${pdfFile.name}` : 'Escolher arquivo PDF'}
                                </Button>
                                <p className="text-xs text-muted-foreground">
                                    Formato: PDF • Tamanho máximo: 10MB
                                </p>
                            </div>

                            {pdfFile && (
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-blue-600" />
                                            <div>
                                                <div className="text-sm font-medium text-blue-900">
                                                    Novo arquivo selecionado
                                                </div>
                                                <div className="text-xs text-blue-700">
                                                    {pdfFile.name} • {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setPdfFile(null)}
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Data do Exame */}
                        <div className="space-y-2">
                            <Label htmlFor="test_date">Data do Exame *</Label>
                            <DateInputWithCalendar
                                id="test_date"
                                value={formData.test_date}
                                onChange={(value) => handleInputChange('test_date', value)}
                                max={getTodayIsoDate()}
                            />
                        </div>

                        {/* Observações */}
                        <div className="space-y-2">
                            <Label htmlFor="notes">Observações</Label>
                            <textarea
                                id="notes"
                                className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background resize-none"
                                placeholder="Notas adicionais sobre o exame..."
                                value={formData.notes}
                                onChange={(e) => handleInputChange('notes', e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={handleCloseModal} disabled={saving || uploading}>
                            <X className="w-4 h-4 mr-2" />
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={saving || uploading}>
                            {(saving || uploading) ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {uploading ? 'Enviando...' : 'Salvando...'}
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    {editingLab ? 'Atualizar' : 'Adicionar'}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(labToConfirm)} onOpenChange={(open) => !open && setLabToConfirm(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>VALIDAR INTERPRETAÇÃO LABORATORIAL</DialogTitle>
                        <DialogDescription>O Nello apenas sinaliza a faixa informada. Confirme unidade, referência do laudo e contexto clínico antes de validar.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="confirmation-reason">JUSTIFICATIVA PROFISSIONAL</Label>
                        <textarea id="confirmation-reason" className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={confirmationReason} onChange={(event) => setConfirmationReason(event.target.value)} maxLength={1000} />
                        <p className="text-xs text-muted-foreground">MÍNIMO DE 10 CARACTERES · {confirmationReason.length}/1000</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLabToConfirm(null)}>CANCELAR</Button>
                        <Button onClick={() => void handleConfirmInterpretation()} disabled={confirming || confirmationReason.trim().length < 10}>
                            {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}VALIDAR INTERPRETAÇÃO
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Modal */}
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-destructive" />
                            INVALIDAR REGISTRO
                        </DialogTitle>
                        <DialogDescription>
                            O exame <strong>{labToDelete?.test_name}</strong> deixará de ser usado nas análises, mas será preservado no histórico e na auditoria.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Invalidar registro
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* PDF Viewer Modal */}
            <Dialog open={pdfViewerOpen} onOpenChange={setPdfViewerOpen}>
                <DialogContent className="sm:max-w-[90vw] max-h-[90vh] p-0">
                    <DialogHeader className="p-6 pb-0">
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-primary" />
                            Visualizar Exame (PDF)
                        </DialogTitle>
                    </DialogHeader>
                    <div className="h-[75vh] p-6 pt-4">
                        {viewingPdfUrl ? (
                            <iframe
                                src={viewingPdfUrl}
                                className="w-full h-full rounded-lg border border-border"
                                title="Visualizador de PDF"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                            </div>
                        )}
                    </div>
                    <DialogFooter className="p-6 pt-0">
                        <Button variant="outline" onClick={() => setPdfViewerOpen(false)}>
                            Fechar
                        </Button>
                        {viewingPdfUrl && (
                            <Button onClick={() => window.open(viewingPdfUrl, '_blank')}>
                                <Download className="w-4 h-4 mr-2" />
                                Abrir em nova aba
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default LabResultsPage;
