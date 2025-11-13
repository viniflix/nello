import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClipboardList, Plus, Calendar, FileText, ChevronRight, Loader2, AlertCircle, Trash2, MoreVertical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getPatientAnamnesisList, getAnamnesisTemplates, deleteAnamnesis } from '@/lib/supabase/anamnesis-queries';
import { getPatientProfile } from '@/lib/supabase/patient-queries';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

/**
 * PatientAnamnesisList - Tela de Listagem de Anamneses
 *
 * Mostra histórico de todas as anamneses do paciente
 * Permite criar nova anamnese escolhendo template
 */
const PatientAnamnesisList = () => {
    const navigate = useNavigate();
    const { patientId } = useParams();
    const { user } = useAuth();

    const [patient, setPatient] = useState(null);
    const [anamnesisList, setAnamnesisList] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal de seleção de template
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);

    // Modal de confirmação de exclusão
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [anamnesisToDelete, setAnamnesisToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // Buscar dados iniciais
    useEffect(() => {
        const fetchData = async () => {
            if (!patientId || !user?.id) return;

            setLoading(true);
            setError(null);

            try {
                // Buscar paciente
                const { data: patientData, error: patientError } = await getPatientProfile(patientId, user.id);
                if (patientError) throw new Error('Erro ao buscar dados do paciente');
                setPatient(patientData);

                // Buscar lista de anamneses
                const { data: anamnesisData, error: anamnesisError } = await getPatientAnamnesisList(patientId);
                if (anamnesisError) throw new Error('Erro ao buscar anamneses');
                setAnamnesisList(anamnesisData || []);

                // Buscar templates disponíveis
                const { data: templatesData, error: templatesError } = await getAnamnesisTemplates(user.id);
                if (templatesError) throw new Error('Erro ao buscar templates');
                setTemplates(templatesData || []);
            } catch (err) {
                console.error('Erro ao carregar dados:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [patientId, user?.id]);

    // Handler para criar nova anamnese
    const handleCreateNew = () => {
        if (templates.length === 0) {
            setError('Nenhum template disponível. Entre em contato com o suporte.');
            return;
        }

        // Se houver apenas 1 template (o padrão), ir direto
        if (templates.length === 1) {
            navigate(`/nutritionist/patients/${patientId}/anamnesis/new?templateId=${templates[0].id}`);
            return;
        }

        // Se houver múltiplos templates, abrir modal
        setShowTemplateModal(true);
    };

    // Handler para selecionar template e navegar
    const handleTemplateSelect = () => {
        if (!selectedTemplate) return;
        setShowTemplateModal(false);
        navigate(`/nutritionist/patients/${patientId}/anamnesis/new?templateId=${selectedTemplate}`);
    };

    // Handler para editar anamnese existente
    const handleEditAnamnesis = (anamnesisId) => {
        navigate(`/nutritionist/patients/${patientId}/anamnesis/${anamnesisId}/edit`);
    };

    // Handler para abrir modal de confirmação de exclusão
    const handleDeleteClick = (anamnesis, e) => {
        e.stopPropagation(); // Evitar navegação ao clicar no botão de excluir
        setAnamnesisToDelete(anamnesis);
        setShowDeleteDialog(true);
    };

    // Handler para confirmar exclusão
    const handleConfirmDelete = async () => {
        if (!anamnesisToDelete) return;

        setDeleting(true);
        try {
            const { error } = await deleteAnamnesis(anamnesisToDelete.id);
            if (error) throw error;

            // Atualizar lista removendo o item excluído
            setAnamnesisList(prev => prev.filter(a => a.id !== anamnesisToDelete.id));
            setShowDeleteDialog(false);
            setAnamnesisToDelete(null);
        } catch (err) {
            console.error('Erro ao excluir anamnese:', err);
            setError('Erro ao excluir anamnese. Tente novamente.');
        } finally {
            setDeleting(false);
        }
    };

    // Renderizar loading
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background-page">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#5f6f52] mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">Carregando anamneses...</p>
                </div>
            </div>
        );
    }

    // ============================================================
    // ESTADO VAZIO - Nenhuma Anamnese Registrada
    // ============================================================
    const EmptyState = () => (
        <Card className="border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-[#fefae0] flex items-center justify-center mb-6">
                    <ClipboardList className="w-10 h-10 text-[#5f6f52]" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">
                    Nenhuma Anamnese Registrada
                </h3>
                <p className="text-sm text-muted-foreground mb-8 max-w-md">
                    Aqui fica o histórico clínico do paciente. Inicie a primeira investigação agora.
                </p>
                <Button
                    onClick={handleCreateNew}
                    size="lg"
                    className="gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Registrar Primeira Anamnese
                </Button>
            </CardContent>
        </Card>
    );

    // ============================================================
    // CARD DE ANAMNESE (Item da Lista)
    // ============================================================
    const AnamnesisCard = ({ anamnesis }) => {
        const statusConfig = {
            draft: {
                label: 'Rascunho',
                color: 'bg-yellow-100 text-yellow-800 border-yellow-300'
            },
            completed: {
                label: 'Completa',
                color: 'bg-green-100 text-green-800 border-green-300'
            }
        };

        const config = statusConfig[anamnesis.status] || statusConfig.draft;

        return (
            <Card className="hover:shadow-md transition-all hover:border-[#5f6f52]">
                <CardContent className="p-0">
                    <div className="flex items-start gap-4 p-6 group">
                        {/* Ícone */}
                        <div className="flex-shrink-0">
                            <div className="w-12 h-12 rounded-lg bg-[#5f6f52]/10 flex items-center justify-center">
                                <FileText className="w-6 h-6 text-[#5f6f52]" />
                            </div>
                        </div>

                        {/* Conteúdo - Clicável */}
                        <button
                            onClick={() => handleEditAnamnesis(anamnesis.id)}
                            className="flex-1 min-w-0 text-left hover:bg-[#fefae0]/30 -mx-4 -my-6 px-4 py-6 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-semibold text-base text-foreground">
                                        {anamnesis.template?.title || 'Anamnese'}
                                    </h4>
                                    <Badge variant="outline" className={cn("text-xs", config.color)}>
                                        {config.label}
                                    </Badge>
                                </div>
                                <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>

                            {/* Data e última modificação */}
                            <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Calendar className="w-4 h-4" />
                                    {new Date(anamnesis.date).toLocaleDateString('pt-BR', {
                                        day: '2-digit',
                                        month: 'long',
                                        year: 'numeric'
                                    })}
                                </div>
                                {anamnesis.updated_at && (
                                    <p className="text-xs text-muted-foreground">
                                        Última modificação: {new Date(anamnesis.updated_at).toLocaleDateString('pt-BR')} às{' '}
                                        {new Date(anamnesis.updated_at).toLocaleTimeString('pt-BR', {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </p>
                                )}
                            </div>

                            {/* Notas (preview) */}
                            {anamnesis.notes && (
                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                    {anamnesis.notes}
                                </p>
                            )}
                        </button>

                        {/* Menu de ações */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onClick={(e) => handleDeleteClick(anamnesis, e)}
                                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Excluir
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </CardContent>
            </Card>
        );
    };

    // ============================================================
    // MODAL DE SELEÇÃO DE TEMPLATE
    // ============================================================
    const TemplateSelectionModal = () => (
        <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Escolher Modelo de Anamnese</DialogTitle>
                    <DialogDescription>
                        Selecione o template que deseja utilizar para esta anamnese
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2 py-4">
                    {templates.map((template) => (
                        <button
                            key={template.id}
                            onClick={() => setSelectedTemplate(template.id)}
                            className={cn(
                                "w-full text-left p-4 rounded-lg border-2 transition-all",
                                selectedTemplate === template.id
                                    ? "border-[#5f6f52] bg-[#5f6f52]/5"
                                    : "border-gray-200 hover:border-[#5f6f52]/50"
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <div className={cn(
                                    "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                                    selectedTemplate === template.id
                                        ? "border-[#5f6f52] bg-[#5f6f52]"
                                        : "border-gray-300"
                                )}>
                                    {selectedTemplate === template.id && (
                                        <div className="w-2 h-2 rounded-full bg-white" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-semibold text-sm">{template.title}</h4>
                                        {template.is_system_default && (
                                            <Badge variant="outline" className="text-xs bg-[#5f6f52]/10 text-[#5f6f52] border-[#5f6f52]">
                                                Padrão
                                            </Badge>
                                        )}
                                    </div>
                                    {template.description && (
                                        <p className="text-xs text-muted-foreground">
                                            {template.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setShowTemplateModal(false)}
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleTemplateSelect}
                        disabled={!selectedTemplate}
                    >
                        Continuar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );

    // ============================================================
    // RENDER PRINCIPAL
    // ============================================================
    return (
        <div className="min-h-screen bg-background-page">
            <div className="max-w-5xl mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/nutritionist/patients/${patientId}/hub`)}
                            >
                                ← Voltar ao Prontuário
                            </Button>
                        </div>
                        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                            <ClipboardList className="w-8 h-8 text-[#5f6f52]" />
                            Histórico de Anamneses
                        </h1>
                        {patient && (
                            <p className="text-sm text-muted-foreground mt-1">
                                Paciente: <span className="font-medium text-foreground">{patient.full_name}</span>
                            </p>
                        )}
                    </div>

                    {/* Botão Criar Nova (só aparece se já houver anamneses) */}
                    {anamnesisList.length > 0 && (
                        <Button
                            onClick={handleCreateNew}
                            size="lg"
                            className="gap-2"
                        >
                            <Plus className="w-5 h-5" />
                            Nova Anamnese
                        </Button>
                    )}
                </div>

                {/* Erro */}
                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {/* Lista de Anamneses */}
                {anamnesisList.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="space-y-4">
                        {anamnesisList.map((anamnesis) => (
                            <AnamnesisCard key={anamnesis.id} anamnesis={anamnesis} />
                        ))}
                    </div>
                )}
            </div>

            {/* Modal de Seleção de Template */}
            <TemplateSelectionModal />

            {/* Modal de Confirmação de Exclusão */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir esta anamnese? Esta ação não pode ser desfeita.
                            {anamnesisToDelete && (
                                <div className="mt-3 p-3 bg-[#fefae0] rounded-lg border border-[#a9b388]">
                                    <p className="text-sm font-medium text-foreground">
                                        {anamnesisToDelete.template?.title || 'Anamnese'}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Data: {new Date(anamnesisToDelete.date).toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={deleting}
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                        >
                            {deleting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Excluindo...
                                </>
                            ) : (
                                'Excluir'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default PatientAnamnesisList;
