import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';





import { Badge } from '@/components/ui/badge';


import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { cn } from '@/lib/utils';
import { getTodayIsoDate } from '@/lib/utils/date';
import { getPatientLabResults, getLabRiskRules, classifyLabResultsRiskBatch, createLabResult, updateLabResult, deleteLabResult, confirmLabResultInterpretation, getLabResultPDFUrl, uploadLabResultPDF } from '@/lib/supabase/lab-results-queries';



export function useLabResultsPageController() {

    const { patientId, paramValue, loading: resolveLoading, error: resolveError } = useResolvedPatientId();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [patientName, setPatientName] = useState('');
    const [labResults, setLabResults] = useState([]);
    const [filteredResults, setFilteredResults] = useState([]);
    const [riskSummary, setRiskSummary] = useState({ total: 0, high: 0, medium: 0, low: 0, highest_risk: 'none' });
    const [selectedMarkerKey, setSelectedMarkerKey] = useState('');

    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [editingLab, setEditingLab] = useState(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [labToDelete, setLabToDelete] = useState(null);
    const [labToConfirm, setLabToConfirm] = useState(null);
    const [confirmationReason, setConfirmationReason] = useState('Valores, unidade e referência conferidos no laudo apresentado.');
    const [confirming, setConfirming] = useState(false);
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
        test_date: getTodayIsoDate(),
        notes: ''
    });

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => {
        if (!patientId) return;
        loadPatientData();
        loadLabResults();
    }, [patientId, user?.id]);

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
            logDiagnostic('error', 'pages/nutritionist/patients/LabResultsPage.jsx:101', 'Erro ao carregar dados do paciente:', error);
        }
    };

    const loadLabResults = async () => {
        setLoading(true);
        try {
            const { data, error } = await getPatientLabResults(patientId);
            const { data: riskRules } = await getLabRiskRules(user?.id || null);

            if (error) throw error;

            const classified = classifyLabResultsRiskBatch(data || [], riskRules || []);
            setLabResults(classified.data || []);
            setRiskSummary(classified.summary || { total: 0, high: 0, medium: 0, low: 0, highest_risk: 'none' });
        } catch (error) {
            logDiagnostic('error', 'pages/nutritionist/patients/LabResultsPage.jsx:117', 'Erro ao carregar exames:', error);
            toast({
                title: 'Erro',
                description: toPortugueseError(error, 'Não foi possível carregar os exames.'),
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

    const timelineByMarker = useMemo(() => {
        const grouped = {};
        (labResults || []).forEach((item) => {
            const markerKey = item.marker_key || item.test_name || 'marcador_desconhecido';
            if (!grouped[markerKey]) grouped[markerKey] = [];
            grouped[markerKey].push(item);
        });

        Object.keys(grouped).forEach((markerKey) => {
            grouped[markerKey].sort((a, b) => new Date(a.test_date) - new Date(b.test_date));
        });

        return grouped;
    }, [labResults]);

    const markerOptions = useMemo(() => (
        Object.keys(timelineByMarker).map((markerKey) => {
            const items = timelineByMarker[markerKey] || [];
            const last = items[items.length - 1];
            return {
                markerKey,
                label: last?.test_name || markerKey,
                count: items.length
            };
        })
    ), [timelineByMarker]);

    useEffect(() => {
        if (!markerOptions.length) {
            setSelectedMarkerKey('');
            return;
        }
        if (!selectedMarkerKey || !markerOptions.some((item) => item.markerKey === selectedMarkerKey)) {
            setSelectedMarkerKey(markerOptions[0].markerKey);
        }
    }, [markerOptions, selectedMarkerKey]);

    const selectedTimeline = useMemo(() => timelineByMarker[selectedMarkerKey] || [], [timelineByMarker, selectedMarkerKey]);

    const selectedTrend = useMemo(() => {
        if (!selectedTimeline.length) return null;
        const latest = selectedTimeline[selectedTimeline.length - 1];
        const previous = selectedTimeline.length > 1 ? selectedTimeline[selectedTimeline.length - 2] : null;
        const latestValue = Number(latest?.test_value);
        const previousValue = Number(previous?.test_value);

        if (!Number.isFinite(latestValue) || !Number.isFinite(previousValue)) {
            return {
                latest,
                previous,
                direction: 'stable',
                delta: null
            };
        }

        const delta = latestValue - previousValue;
        const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable';
        return { latest, previous, direction, delta };
    }, [selectedTimeline]);

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
                test_date: getTodayIsoDate(),
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

    const handleViewPdf = async (pdfPath) => {
        const { url, error } = await getLabResultPDFUrl(pdfPath, 300);
        if (error || !url) {
            toast({ title: 'PDF indisponível', description: 'Não foi possível autorizar o acesso temporário.', variant: 'destructive' });
            return;
        }
        setViewingPdfUrl(url);
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

                // A versão anterior permanece preservada para auditoria clínica.
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
            logDiagnostic('error', 'pages/nutritionist/patients/LabResultsPage.jsx:360', 'Erro ao salvar exame:', error);
            toast({
                title: 'Erro',
                description: toPortugueseError(error, 'Não foi possível salvar o exame.'),
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
            logDiagnostic('error', 'pages/nutritionist/patients/LabResultsPage.jsx:388', 'Erro ao excluir exame:', error);
            toast({
                title: 'Erro',
                description: toPortugueseError(error, 'Não foi possível excluir o exame.'),
                variant: 'destructive'
            });
        }
    };

    const handleConfirmInterpretation = async () => {
        if (!labToConfirm || confirmationReason.trim().length < 10) return;
        setConfirming(true);
        try {
            const { error } = await confirmLabResultInterpretation(labToConfirm.id, confirmationReason.trim());
            if (error) throw error;
            toast({ title: 'INTERPRETAÇÃO VALIDADA', description: 'A confirmação profissional foi registrada na auditoria.' });
            setLabToConfirm(null);
            await loadLabResults();
        } catch (error) {
            toast({ title: 'VALIDAÇÃO NÃO REGISTRADA', description: toPortugueseError(error, 'Tente novamente.'), variant: 'destructive' });
        } finally {
            setConfirming(false);
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

    const getRiskBadge = (riskLevel) => {
        const configs = {
            none: { label: 'Risco baixo', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
            low: { label: 'Risco leve', className: 'bg-sky-100 text-sky-800 border-sky-300' },
            medium: { label: 'Risco moderado', className: 'bg-amber-100 text-amber-800 border-amber-300' },
            high: { label: 'Risco alto', className: 'bg-red-100 text-red-800 border-red-300' }
        };
        const config = configs[riskLevel] || configs.none;
        return <Badge variant="outline" className={cn('text-xs', config.className)}>{config.label}</Badge>;
    };

    const getTrendMeta = (direction) => {
        if (direction === 'up') return { icon: TrendingUp, label: 'Em alta', className: 'text-red-600' };
        if (direction === 'down') return { icon: TrendingDown, label: 'Em queda', className: 'text-emerald-600' };
        return { icon: Minus, label: 'Estável', className: 'text-muted-foreground' };
    };

    
return {resolveLoading,patientId,resolveError,navigate,loading,paramValue,patientName,handleOpenModal,searchTerm,setSearchTerm,statusFilter,setStatusFilter,labResults,getRiskBadge,riskSummary,markerOptions,selectedMarkerKey,setSelectedMarkerKey,selectedTrend,getTrendMeta,selectedTimeline,filteredResults,getStatusBadge,setLabToConfirm,handleViewPdf,setLabToDelete,setDeleteConfirmOpen,modalOpen,setModalOpen,editingLab,formData,handleInputChange,pdfFile,fileInputRef,handleFileChange,setPdfFile,handleCloseModal,saving,uploading,handleSave,labToConfirm,confirmationReason,setConfirmationReason,handleConfirmInterpretation,confirming,deleteConfirmOpen,labToDelete,handleDelete,pdfViewerOpen,setPdfViewerOpen,viewingPdfUrl};
}
