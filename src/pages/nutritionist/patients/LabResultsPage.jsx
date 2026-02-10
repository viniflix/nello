import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Droplet, Plus, Edit, Trash2, Calendar, Activity, AlertCircle, Search, Filter, Loader2, Save, X, FileText, Upload, Eye, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { cn } from '@/lib/utils';
import {
    getPatientLabResults,
    createLabResult,
    updateLabResult,
    deleteLabResult,
    deleteLabResultPDF,
    uploadLabResultPDF,
    calculateStatus
} from '@/lib/supabase/lab-results-queries';

const LabResultsPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [patientName, setPatientName] = useState('');
    const [labResults, setLabResults] = useState([]);
    const [filteredResults, setFilteredResults] = useState([]);

    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [editingLab, setEditingLab] = useState(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [labToDelete, setLabToDelete] = useState(null);
    const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
    const [viewingPdfUrl, setViewingPdfUrl] = useState(null);

    // Form data
    const [pdfFile, setPdfFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const [formData, setFormData] = useState({
        test_name: '',
        test_value: '',
        test_unit: '',
        reference_min: '',
        reference_max: '',
        test_date: new Date().toISOString().split('T')[0],
        notes: ''
    });

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => {
        loadPatientData();
        loadLabResults();
    }, [patientId]);

    useEffect(() => {
        applyFilters();
    }, [labResults, searchTerm, statusFilter]);

    const loadPatientData = async () => {
        try {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('name')
                .eq('id', patientId)
                .single();

            if (profile) {
                setPatientName(profile.name);
            }
        } catch (error) {
            console.error('Erro ao carregar dados do paciente:', error);
        }
    };

    const loadLabResults = async () => {
        setLoading(true);
        try {
            const { data, error } = await getPatientLabResults(patientId);

            if (error) throw error;

            setLabResults(data || []);
        } catch (error) {
            console.error('Erro ao carregar exames:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível carregar os exames.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const applyFilters = () => {
        let filtered = [...labResults];

        // Filtro por busca (nome do exame)
        if (searchTerm) {
            filtered = filtered.filter(lab =>
                lab.test_name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Filtro por status
        if (statusFilter !== 'all') {
            filtered = filtered.filter(lab => lab.status === statusFilter);
        }

        setFilteredResults(filtered);
    };

    const handleOpenModal = (lab = null) => {
        if (lab) {
            // Editar
            setEditingLab(lab);
            setFormData({
                test_name: lab.test_name,
                test_value: lab.test_value || '',
                test_unit: lab.test_unit || '',
                reference_min: lab.reference_min?.toString() || '',
                reference_max: lab.reference_max?.toString() || '',
                test_date: lab.test_date,
                notes: lab.notes || ''
            });
            setPdfFile(null);
        } else {
            // Novo
            setEditingLab(null);
            setFormData({
                test_name: '',
                test_value: '',
                test_unit: '',
                reference_min: '',
                reference_max: '',
                test_date: new Date().toISOString().split('T')[0],
                notes: ''
            });
            setPdfFile(null);
        }
        setModalOpen(true);
    };

    const handleCloseModal = () => {
        setModalOpen(false);
        setEditingLab(null);
        setPdfFile(null);
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.type !== 'application/pdf') {
                toast({
                    title: 'Tipo de arquivo inválido',
                    description: 'Apenas arquivos PDF são permitidos.',
                    variant: 'destructive'
                });
                return;
            }
            if (file.size > 10 * 1024 * 1024) { // 10MB
                toast({
                    title: 'Arquivo muito grande',
                    description: 'O arquivo deve ter no máximo 10MB.',
                    variant: 'destructive'
                });
                return;
            }
            setPdfFile(file);
        }
    };

    const handleViewPdf = (pdfUrl) => {
        setViewingPdfUrl(pdfUrl);
        setPdfViewerOpen(true);
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        // Validação: nome e data são obrigatórios
        if (!formData.test_name || !formData.test_date) {
            toast({
                title: 'Campos obrigatórios',
                description: 'Preencha nome do exame e data.',
                variant: 'destructive'
            });
            return;
        }

        // Validação: pelo menos valores OU PDF
        const hasManualValues = formData.test_value && formData.test_value.trim() !== '';
        const hasPdf = pdfFile || editingLab?.pdf_url;

        if (!hasManualValues && !hasPdf) {
            toast({
                title: 'Dados obrigatórios',
                description: 'Preencha os valores do exame OU anexe um PDF (ou ambos).',
                variant: 'destructive'
            });
            return;
        }

        setSaving(true);
        setUploading(true);
        try {
            let pdfUrl = editingLab?.pdf_url || null;
            let pdfFilename = editingLab?.pdf_filename || null;

            // Upload de PDF se houver arquivo novo
            if (pdfFile) {
                const uploadResult = await uploadLabResultPDF(patientId, pdfFile);
                if (uploadResult.error) {
                    throw new Error(uploadResult.error.message || 'Erro ao fazer upload do PDF');
                }
                pdfUrl = uploadResult.url;
                pdfFilename = uploadResult.filename;

                // Se estava editando e havia PDF antigo, deletar
                if (editingLab?.pdf_url) {
                    await deleteLabResultPDF(editingLab.pdf_url);
                }
            }

            const labData = {
                patient_id: patientId,
                test_name: formData.test_name,
                test_date: formData.test_date,
                notes: formData.notes || null,
                // Valores manuais (opcionais)
                test_value: formData.test_value || null,
                test_unit: formData.test_unit || null,
                reference_min: formData.reference_min ? parseFloat(formData.reference_min) : null,
                reference_max: formData.reference_max ? parseFloat(formData.reference_max) : null,
                // PDF (opcional)
                pdf_url: pdfUrl,
                pdf_filename: pdfFilename
            };

            if (editingLab) {
                // Atualizar
                const { error } = await updateLabResult(editingLab.id, labData);
                if (error) throw error;

                toast({
                    title: 'Atualizado!',
                    description: 'Exame atualizado com sucesso.'
                });
            } else {
                // Criar
                const { error } = await createLabResult(labData);
                if (error) throw error;

                toast({
                    title: 'Adicionado!',
                    description: 'Exame adicionado com sucesso.'
                });
            }

            handleCloseModal();
            loadLabResults();
        } catch (error) {
            console.error('Erro ao salvar exame:', error);
            toast({
                title: 'Erro',
                description: error.message || 'Não foi possível salvar o exame.',
                variant: 'destructive'
            });
        } finally {
            setSaving(false);
            setUploading(false);
        }
    };

    const handleDelete = async () => {
        if (!labToDelete) return;

        try {
            const { error } = await deleteLabResult(labToDelete.id);
            if (error) throw error;

            toast({
                title: 'Excluído!',
                description: 'Exame excluído com sucesso.'
            });

            setDeleteConfirmOpen(false);
            setLabToDelete(null);
            loadLabResults();
        } catch (error) {
            console.error('Erro ao excluir exame:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível excluir o exame.',
                variant: 'destructive'
            });
        }
    };

    const getStatusBadge = (status) => {
        const configs = {
            normal: { label: 'Normal', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
            low: { label: 'Baixo', className: 'bg-amber-100 text-amber-800 border-amber-300' },
            high: { label: 'Alto', className: 'bg-red-100 text-red-800 border-red-300' },
            pending: { label: 'Pendente', className: 'bg-gray-100 text-gray-800 border-gray-300' }
        };
        const config = configs[status] || configs.pending;
        return <Badge variant="outline" className={cn('text-xs', config.className)}>{config.label}</Badge>;
    };

    return loading ? null : (
        <div className="flex flex-col min-h-screen bg-background">
            <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-6 md:py-8">
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
                                                {lab.test_value && lab.status && getStatusBadge(lab.status)}
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
                                                title="Excluir"
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
                                max={new Date().toISOString().split('T')[0]}
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

            {/* Delete Confirmation Modal */}
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-destructive" />
                            Confirmar Exclusão
                        </DialogTitle>
                        <DialogDescription>
                            Tem certeza que deseja excluir o exame <strong>{labToDelete?.test_name}</strong>?
                            Esta ação não pode ser desfeita.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
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
