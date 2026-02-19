// src/pages/PatientAnamnesePage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
    ClipboardList, Plus, Calendar, FileText, ChevronRight, Loader2, AlertCircle,
    Trash2, MoreVertical, Settings, Edit2, ArrowLeft, FolderCog
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
    getPatientAnamnesisList,
    getAnamnesisTemplates,
    deleteAnamnesis,
    getCustomTemplates,
    createCustomFormTemplate,
    updateCustomFormTemplate,
    deleteCustomFormTemplate,
    getAnamneseFields,
    createAnamneseField,
    updateAnamneseField,
    deleteAnamneseField,
    addFieldToTemplate,
    removeFieldFromTemplate,
    getFieldOptions,
    createFieldOptions,
    updateFieldOptions
} from '@/lib/supabase/anamnesis-queries';
import { supabase } from '@/lib/customSupabaseClient';

const PatientAnamnesePage = () => {
    const navigate = useNavigate();
    const { patientId } = useParams();
    const { user } = useAuth();
    const { toast } = useToast();

    // Estados
    const [patient, setPatient] = useState(null);
    const [anamnesisList, setAnamnesisList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Templates
    const [standardTemplates, setStandardTemplates] = useState([]);
    const [customTemplates, setCustomTemplates] = useState([]);

    // Modals
    const [showTypeSelectionModal, setShowTypeSelectionModal] = useState(false);
    const [showTemplateSelectionModal, setShowTemplateSelectionModal] = useState(false);
    const [selectedTemplateType, setSelectedTemplateType] = useState(null);
    const [selectedTemplate, setSelectedTemplate] = useState(null);

    // Modal de criação de formulário personalizado
    const [showCreateCustomModal, setShowCreateCustomModal] = useState(false);
    const [newCustomTemplate, setNewCustomTemplate] = useState({
        title: '',
        description: ''
    });
    const [creating, setCreating] = useState(false);

    // Modal de gerenciamento de formulários personalizados
    const [showManageCustomModal, setShowManageCustomModal] = useState(false);
    const [editingCustomTemplate, setEditingCustomTemplate] = useState(null);
    const [customTemplateFields, setCustomTemplateFields] = useState([]);
    const [loadingFields, setLoadingFields] = useState(false);

    // Modal de edição de campo
    const [showFieldModal, setShowFieldModal] = useState(false);
    const [editingField, setEditingField] = useState(null);
    const [fieldForm, setFieldForm] = useState({
        fieldLabel: '',
        fieldType: 'texto_curto',
        category: 'geral',
        isRequired: false,
        optionsArray: ''
    });

    // Modal de confirmação de exclusão
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [anamnesisToDelete, setAnamnesisToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // Modal de exclusão de template customizado
    const [showDeleteTemplateDialog, setShowDeleteTemplateDialog] = useState(false);
    const [templateToDelete, setTemplateToDelete] = useState(null);
    const [deletingTemplate, setDeletingTemplate] = useState(false);

    // Modal de exclusão de campo
    const [showDeleteFieldDialog, setShowDeleteFieldDialog] = useState(false);
    const [fieldToDelete, setFieldToDelete] = useState(null);
    const [deletingField, setDeletingField] = useState(false);

    // Carregar dados iniciais
    const loadData = useCallback(async () => {
        if (!patientId || !user?.id) return;

        setLoading(true);
        setError(null);

        try {
            // Buscar paciente
            const { data: patientData, error: patientError } = await supabase
                .from('user_profiles')
                .select('id, name')
                .eq('id', patientId)
                .single();

            if (patientError) throw patientError;
            setPatient(patientData);

            // Buscar lista de anamneses
            const { data: anamnesisData, error: anamnesisError } = await getPatientAnamnesisList(patientId);
            if (anamnesisError) throw anamnesisError;
            setAnamnesisList(anamnesisData || []);

            // Buscar templates padrão (apenas templates do sistema)
            const { data: templatesData, error: templatesError } = await getAnamnesisTemplates(user.id);
            if (templatesError) throw templatesError;
            const standard = (templatesData || []).filter(t => t.is_system_default === true);
            setStandardTemplates(standard);

            // Buscar templates personalizados (templates criados pelo nutricionista)
            await loadCustomTemplates();

        } catch (err) {
            console.error('Erro ao carregar dados:', err);
            setError(err.message || 'Erro ao carregar dados');
        } finally {
            setLoading(false);
        }
    }, [patientId, user?.id]);

    const loadCustomTemplates = async () => {
        if (!user?.id) return;

        try {
            const { data: customData, error: customError } = await getCustomTemplates(user.id);
            if (customError) throw customError;
            setCustomTemplates(customData || []);
        } catch (err) {
            console.error('Erro ao carregar templates personalizados:', err);
        }
    };

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Handler para criar nova anamnese
    const handleCreateNew = () => {
        setShowTypeSelectionModal(true);
    };

    // Handler para selecionar tipo (padrão ou personalizado)
    const handleSelectType = (type) => {
        setSelectedTemplateType(type);
        setShowTypeSelectionModal(false);

        if (type === 'standard') {
            if (standardTemplates.length === 0) {
                toast({
                    title: 'Atenção',
                    description: 'Nenhum template padrão disponível.',
                    variant: 'destructive',
                });
                return;
            }

            if (standardTemplates.length === 1) {
                navigate(`/nutritionist/patients/${patientId}/anamnesis/new?templateId=${standardTemplates[0].id}`);
                return;
            }

            setShowTemplateSelectionModal(true);

        } else if (type === 'custom') {
            if (customTemplates.length === 0) {
                setShowCreateCustomModal(true);
                return;
            }

            setShowTemplateSelectionModal(true);
        }
    };

    // Handler para selecionar template e navegar
    const handleTemplateSelect = () => {
        if (!selectedTemplate) return;

        setShowTemplateSelectionModal(false);

        if (selectedTemplateType === 'standard') {
            navigate(`/nutritionist/patients/${patientId}/anamnesis/new?templateId=${selectedTemplate}`);
        } else if (selectedTemplateType === 'custom') {
            navigate(`/nutritionist/patients/${patientId}/anamnesis/new?customTemplateId=${selectedTemplate}`);
        }
    };

    // Handler para criar formulário personalizado
    const handleCreateCustomTemplate = async () => {
        if (!newCustomTemplate.title.trim()) {
            toast({
                title: 'Atenção',
                description: 'Digite um nome para o formulário personalizado.',
                variant: 'destructive',
            });
            return;
        }

        setCreating(true);
        try {
            const { data, error } = await createCustomFormTemplate({
                nutritionistId: user.id,
                title: newCustomTemplate.title,
                description: newCustomTemplate.description
            });

            if (error) throw error;

            toast({
                title: 'Sucesso!',
                description: 'Formulário personalizado criado. Agora adicione suas perguntas.',
            });

            setShowCreateCustomModal(false);
            setNewCustomTemplate({ title: '', description: '' });

            // Recarregar templates
            await loadCustomTemplates();

            // Abrir modal de edição do template criado
            handleEditCustomTemplate(data);

        } catch (err) {
            console.error('Erro ao criar formulário personalizado:', err);
            toast({
                title: 'Erro ao criar formulário',
                description: err.message,
                variant: 'destructive',
            });
        } finally {
            setCreating(false);
        }
    };

    // Handler para editar template customizado
    const handleEditCustomTemplate = useCallback(async (template) => {
        setEditingCustomTemplate(template);
        setLoadingFields(true);

        try {
            const { data: fields, error } = await getAnamneseFields(user.id, template.id);
            if (error) throw error;
            setCustomTemplateFields(fields || []);
        } catch (err) {
            console.error('Erro ao carregar campos:', err);
            toast({
                title: 'Erro',
                description: 'Erro ao carregar campos do formulário.',
                variant: 'destructive',
            });
        } finally {
            setLoadingFields(false);
        }
    }, [user?.id, toast]);

    // Handler para adicionar novo campo
    const handleAddField = useCallback(() => {
        setEditingField(null);
        setFieldForm({
            fieldLabel: '',
            fieldType: 'texto_curto',
            category: 'geral',
            isRequired: false,
            optionsArray: ''
        });
        setShowFieldModal(true);
    }, []);

    // Handler para editar campo existente
    const handleEditField = useCallback((field) => {
        setEditingField(field);
        setFieldForm({
            fieldLabel: field.field_label,
            fieldType: field.field_type,
            category: field.category || 'geral',
            isRequired: field.is_required || false,
            optionsArray: ''
        });
        setShowFieldModal(true);
    }, []);

    // Handler para deletar campo
    const handleDeleteField = async () => {
        if (!fieldToDelete) return;

        setDeletingField(true);
        try {
            const { error } = await deleteAnamneseField(fieldToDelete.id);
            if (error) throw error;

            setCustomTemplateFields(prev => prev.filter(f => f.id !== fieldToDelete.id));
            setShowDeleteFieldDialog(false);
            setFieldToDelete(null);

            toast({
                title: 'Sucesso!',
                description: 'Pergunta excluída com sucesso.',
            });
        } catch (err) {
            console.error('Erro ao excluir campo:', err);
            toast({
                title: 'Erro',
                description: 'Erro ao excluir pergunta.',
                variant: 'destructive',
            });
        } finally {
            setDeletingField(false);
        }
    };

    // Handler para deletar template customizado
    const handleDeleteCustomTemplate = async () => {
        if (!templateToDelete) return;

        setDeletingTemplate(true);
        try {
            const { error } = await deleteCustomFormTemplate(templateToDelete.id);
            if (error) throw error;

            await loadCustomTemplates();
            setShowDeleteTemplateDialog(false);
            setTemplateToDelete(null);
            setEditingCustomTemplate(null);

            toast({
                title: 'Sucesso!',
                description: 'Formulário excluído com sucesso.',
            });
        } catch (err) {
            console.error('Erro ao excluir formulário:', err);
            toast({
                title: 'Erro',
                description: 'Erro ao excluir formulário.',
                variant: 'destructive',
            });
        } finally {
            setDeletingTemplate(false);
        }
    };

    // Handler para editar anamnese existente
    const handleEditAnamnesis = (anamnesisId) => {
        navigate(`/nutritionist/patients/${patientId}/anamnesis/${anamnesisId}/edit`);
    };

    // Handler para abrir modal de confirmação de exclusão de anamnese
    const handleDeleteClick = (anamnesis, e) => {
        e.stopPropagation();
        setAnamnesisToDelete(anamnesis);
        setShowDeleteDialog(true);
    };

    // Handler para confirmar exclusão de anamnese
    const handleConfirmDelete = async () => {
        if (!anamnesisToDelete) return;

        setDeleting(true);
        try {
            const { error } = await deleteAnamnesis(anamnesisToDelete.id);
            if (error) throw error;

            setAnamnesisList(prev => prev.filter(a => a.id !== anamnesisToDelete.id));
            setShowDeleteDialog(false);
            setAnamnesisToDelete(null);

            toast({
                title: 'Sucesso!',
                description: 'Anamnese excluída com sucesso.',
            });

        } catch (err) {
            console.error('Erro ao excluir anamnese:', err);
            toast({
                title: 'Erro ao excluir anamnese',
                description: err.message,
                variant: 'destructive',
            });
        } finally {
            setDeleting(false);
        }
    };

    // ============================================================
    // COMPONENTES DE UI
    // ============================================================

    // Estado Vazio
    const EmptyState = () => (
        <Card className="border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-[#fefae0] flex items-center justify-center mb-6">
                    <ClipboardList className="w-10 h-10 text-[#5f6f52]" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">
                    Nenhuma Anamnese Preenchida
                </h3>
                <p className="text-sm text-muted-foreground mb-8 max-w-md">
                    Inicie a primeira anamnese usando um formulário padrão ou crie seu próprio formulário personalizado.
                </p>
                <Button
                    onClick={handleCreateNew}
                    size="lg"
                    className="gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Iniciar Anamnese
                </Button>
            </CardContent>
        </Card>
    );

    // Card de Anamnese
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
                        <div className="flex-shrink-0">
                            <div className="w-12 h-12 rounded-lg bg-[#5f6f52]/10 flex items-center justify-center">
                                <FileText className="w-6 h-6 text-[#5f6f52]" />
                            </div>
                        </div>

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

                            {anamnesis.notes && (
                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                    {anamnesis.notes}
                                </p>
                            )}
                        </button>

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
    // MODALS
    // ============================================================

    // Modal de Seleção de Tipo
    const TypeSelectionModal = () => (
        <Dialog open={showTypeSelectionModal} onOpenChange={setShowTypeSelectionModal}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Como deseja preencher a anamnese?</DialogTitle>
                    <DialogDescription>
                        Escolha entre um formulário padrão ou crie seu próprio formulário personalizado
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                    <button
                        onClick={() => handleSelectType('standard')}
                        className="p-6 rounded-lg border-2 border-gray-200 hover:border-[#5f6f52] hover:bg-[#fefae0]/30 transition-all text-left group"
                    >
                        <div className="w-12 h-12 rounded-lg bg-[#5f6f52]/10 flex items-center justify-center mb-4 group-hover:bg-[#5f6f52]/20 transition-colors">
                            <FileText className="w-6 h-6 text-[#5f6f52]" />
                        </div>
                        <h3 className="font-semibold text-base mb-2">Formulário Padrão</h3>
                        <p className="text-sm text-muted-foreground">
                            Use o template completo de anamnese nutricional com perguntas pré-definidas.
                        </p>
                    </button>

                    <button
                        onClick={() => handleSelectType('custom')}
                        className="p-6 rounded-lg border-2 border-gray-200 hover:border-[#5f6f52] hover:bg-[#fefae0]/30 transition-all text-left group"
                    >
                        <div className="w-12 h-12 rounded-lg bg-[#a9b388]/10 flex items-center justify-center mb-4 group-hover:bg-[#a9b388]/20 transition-colors">
                            <Settings className="w-6 h-6 text-[#5f6f52]" />
                        </div>
                        <h3 className="font-semibold text-base mb-2">
                            Formulários Personalizados
                            {customTemplates.length > 0 && (
                                <Badge className="ml-2 bg-[#5f6f52]">{customTemplates.length}</Badge>
                            )}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            {customTemplates.length > 0
                                ? 'Escolha um dos seus formulários personalizados ou crie um novo.'
                                : 'Crie seu primeiro formulário personalizado com perguntas sob medida.'}
                        </p>
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );

    // Modal de Seleção de Template
    const TemplateSelectionModal = () => {
        const templates = selectedTemplateType === 'standard' ? standardTemplates : customTemplates;

        return (
            <Dialog open={showTemplateSelectionModal} onOpenChange={setShowTemplateSelectionModal}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {selectedTemplateType === 'standard' ? 'Escolher Formulário Padrão' : 'Escolher Formulário Personalizado'}
                        </DialogTitle>
                        <DialogDescription>
                            Selecione o formulário que deseja utilizar
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2 py-4 max-h-[400px] overflow-y-auto">
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

                        {selectedTemplateType === 'custom' && (
                            <button
                                onClick={() => {
                                    setShowTemplateSelectionModal(false);
                                    setShowCreateCustomModal(true);
                                }}
                                className="w-full text-left p-4 rounded-lg border-2 border-dashed border-gray-300 hover:border-[#5f6f52] hover:bg-[#fefae0]/30 transition-all"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-[#fefae0] flex items-center justify-center">
                                        <Plus className="w-5 h-5 text-[#5f6f52]" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-sm">Criar Novo Formulário</h4>
                                        <p className="text-xs text-muted-foreground">
                                            Monte um formulário personalizado do zero
                                        </p>
                                    </div>
                                </div>
                            </button>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowTemplateSelectionModal(false)}
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
    };

    // Modal de Criação de Formulário Personalizado
    const CreateCustomModal = () => {
        const [localTitle, setLocalTitle] = useState('');
        const [localDescription, setLocalDescription] = useState('');

        return (
            <Dialog open={showCreateCustomModal} onOpenChange={setShowCreateCustomModal}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Criar Formulário Personalizado</DialogTitle>
                        <DialogDescription>
                            Dê um nome ao seu formulário. Você poderá adicionar perguntas na próxima etapa.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div>
                            <Label htmlFor="custom-title">Nome do Formulário *</Label>
                            <Input
                                id="custom-title"
                                value={localTitle}
                                onChange={(e) => setLocalTitle(e.target.value)}
                                placeholder="Ex: Anamnese para Emagrecimento"
                                maxLength={100}
                            />
                        </div>

                        <div>
                            <Label htmlFor="custom-description">Descrição (opcional)</Label>
                            <Textarea
                                id="custom-description"
                                value={localDescription}
                                onChange={(e) => setLocalDescription(e.target.value)}
                                placeholder="Descreva o objetivo deste formulário..."
                                rows={3}
                                maxLength={500}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowCreateCustomModal(false);
                                setLocalTitle('');
                                setLocalDescription('');
                            }}
                            disabled={creating}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={async () => {
                                if (!localTitle.trim()) {
                                    toast({
                                        title: 'Atenção',
                                        description: 'Digite um nome para o formulário personalizado.',
                                        variant: 'destructive',
                                    });
                                    return;
                                }

                                setCreating(true);
                                try {
                                    const { data, error } = await createCustomFormTemplate({
                                        nutritionistId: user.id,
                                        title: localTitle,
                                        description: localDescription
                                    });

                                    if (error) throw error;

                                    toast({
                                        title: 'Sucesso!',
                                        description: 'Formulário personalizado criado. Agora adicione suas perguntas.',
                                    });

                                    setShowCreateCustomModal(false);
                                    setLocalTitle('');
                                    setLocalDescription('');

                                    await loadCustomTemplates();
                                    handleEditCustomTemplate(data);

                                } catch (err) {
                                    console.error('Erro ao criar formulário personalizado:', err);
                                    toast({
                                        title: 'Erro ao criar formulário',
                                        description: err.message,
                                        variant: 'destructive',
                                    });
                                } finally {
                                    setCreating(false);
                                }
                            }}
                            disabled={creating || !localTitle.trim()}
                        >
                            {creating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Criando...
                                </>
                            ) : (
                                'Criar e Adicionar Perguntas'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    };

    // Modal de Edição de Template Customizado (Gerenciar Campos)
    const EditCustomTemplateModal = React.memo(() => {
        if (!editingCustomTemplate) return null;

        return (
            <Dialog open={!!editingCustomTemplate} onOpenChange={() => setEditingCustomTemplate(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle>Editar Formulário: {editingCustomTemplate?.title}</DialogTitle>
                                <DialogDescription>
                                    Adicione, edite ou remova perguntas do formulário
                                </DialogDescription>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setTemplateToDelete(editingCustomTemplate);
                                    setShowDeleteTemplateDialog(true);
                                }}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Excluir Formulário
                            </Button>
                        </div>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold">Perguntas ({customTemplateFields.length})</h3>
                            <Button onClick={handleAddField} size="sm">
                                <Plus className="w-4 h-4 mr-2" />
                                Adicionar Pergunta
                            </Button>
                        </div>

                        {loadingFields ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-[#5f6f52]" />
                            </div>
                        ) : customTemplateFields.length === 0 ? (
                            <div className="text-center py-8 border-2 border-dashed rounded-lg">
                                <p className="text-muted-foreground">Nenhuma pergunta adicionada ainda.</p>
                                <Button onClick={handleAddField} size="sm" className="mt-4">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Adicionar Primeira Pergunta
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {customTemplateFields.map((field, index) => (
                                    <div key={field.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-muted-foreground">#{index + 1}</span>
                                                <p className="font-medium">{field.field_label}</p>
                                            </div>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                Tipo: {field.field_type.replace('_', ' ')}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEditField(field)}
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setFieldToDelete(field);
                                                    setShowDeleteFieldDialog(true);
                                                }}
                                            >
                                                <Trash2 className="w-4 h-4 text-destructive" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button onClick={() => setEditingCustomTemplate(null)}>
                            Concluir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    });

    // Modal de Campo (Adicionar/Editar Pergunta)
    const FieldModal = React.memo(() => {
        const [localFieldLabel, setLocalFieldLabel] = useState('');
        const [localFieldType, setLocalFieldType] = useState('texto_curto');
        const [localCategory, setLocalCategory] = useState('geral');
        const [localIsRequired, setLocalIsRequired] = useState(false);
        const [localOptions, setLocalOptions] = useState([]);
        const [newOption, setNewOption] = useState('');
        const [loadingOptions, setLoadingOptions] = useState(false);

        const loadOptions = React.useCallback(async () => {
            if (!editingField) return;

            setLoadingOptions(true);
            try {
                const { data, error } = await getFieldOptions(editingField.id);
                if (error) throw error;
                setLocalOptions((data || []).map(opt => opt.option_text));
            } catch (err) {
                console.error('Erro ao carregar opções:', err);
            } finally {
                setLoadingOptions(false);
            }
        }, [editingField?.id]);

        // Atualizar valores locais apenas quando o modal abrir
        React.useEffect(() => {
            if (showFieldModal) {
                setLocalFieldLabel(fieldForm.fieldLabel);
                setLocalFieldType(fieldForm.fieldType);
                setLocalCategory(fieldForm.category);
                setLocalIsRequired(fieldForm.isRequired);

                // Carregar opções se estiver editando campo de seleção
                if (editingField && (editingField.field_type === 'selecao_unica' || editingField.field_type === 'selecao_multipla')) {
                    loadOptions();
                } else {
                    setLocalOptions([]);
                }
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [showFieldModal]);

        const handleAddOption = () => {
            if (!newOption.trim()) return;
            setLocalOptions(prev => [...prev, newOption.trim()]);
            setNewOption('');
        };

        const handleRemoveOption = (index) => {
            setLocalOptions(prev => prev.filter((_, i) => i !== index));
        };

        const handleSave = async () => {
            if (!localFieldLabel.trim()) {
                toast({
                    title: 'Atenção',
                    description: 'Digite o nome da pergunta.',
                    variant: 'destructive',
                });
                return;
            }

            // Validar opções para campos de seleção
            if ((localFieldType === 'selecao_unica' || localFieldType === 'selecao_multipla') && localOptions.length === 0) {
                toast({
                    title: 'Atenção',
                    description: 'Adicione pelo menos uma opção para campos de seleção.',
                    variant: 'destructive',
                });
                return;
            }

            try {
                if (editingField) {
                    // Atualizar campo
                    const { data, error } = await updateAnamneseField(editingField.id, {
                        fieldLabel: localFieldLabel,
                        fieldType: localFieldType,
                        category: localCategory,
                        isRequired: localIsRequired
                    });

                    if (error) throw error;

                    // Atualizar opções se for campo de seleção
                    if (localFieldType === 'selecao_unica' || localFieldType === 'selecao_multipla') {
                        await updateFieldOptions(editingField.id, localOptions);
                    }

                    setCustomTemplateFields(prev => prev.map(f => f.id === data.id ? data : f));
                    toast({
                        title: 'Sucesso!',
                        description: 'Pergunta atualizada com sucesso.',
                    });
                } else {
                    // Criar novo campo
                    const { data, error } = await createAnamneseField({
                        nutritionistId: user.id,
                        fieldLabel: localFieldLabel,
                        fieldType: localFieldType,
                        category: localCategory,
                        isRequired: localIsRequired
                    });

                    if (error) throw error;

                    // Criar opções se for campo de seleção
                    if (localFieldType === 'selecao_unica' || localFieldType === 'selecao_multipla') {
                        await createFieldOptions(data.id, localOptions);
                    }

                    // Associar campo ao template
                    if (editingCustomTemplate) {
                        await addFieldToTemplate(editingCustomTemplate.id, data.id, customTemplateFields.length);
                    }

                    setCustomTemplateFields(prev => [...prev, data]);
                    toast({
                        title: 'Sucesso!',
                        description: 'Pergunta adicionada com sucesso.',
                    });
                }

                setShowFieldModal(false);
                setEditingField(null);
                setFieldForm({
                    fieldLabel: '',
                    fieldType: 'texto_curto',
                    category: 'geral',
                    isRequired: false,
                    optionsArray: ''
                });
                setLocalOptions([]);

            } catch (err) {
                console.error('Erro ao salvar campo:', err);
                toast({
                    title: 'Erro ao salvar pergunta',
                    description: err.message,
                    variant: 'destructive',
                });
            }
        };

        const isSelectionType = localFieldType === 'selecao_unica' || localFieldType === 'selecao_multipla';

        return (
            <Dialog open={showFieldModal} onOpenChange={setShowFieldModal}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingField ? 'Editar Pergunta' : 'Nova Pergunta'}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="field-label">Nome da Pergunta</Label>
                            <Input
                                id="field-label"
                                value={localFieldLabel}
                                onChange={(e) => setLocalFieldLabel(e.target.value)}
                                placeholder="Ex: Qual seu objetivo com a consulta?"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="field-type">Tipo de Campo</Label>
                                <Select
                                    value={localFieldType}
                                    onValueChange={(val) => {
                                        setLocalFieldType(val);
                                        if (val !== 'selecao_unica' && val !== 'selecao_multipla') {
                                            setLocalOptions([]);
                                        }
                                    }}
                                >
                                    <SelectTrigger id="field-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="texto_curto">Texto Curto</SelectItem>
                                        <SelectItem value="texto_longo">Texto Longo</SelectItem>
                                        <SelectItem value="selecao_unica">Seleção Única</SelectItem>
                                        <SelectItem value="selecao_multipla">Seleção Múltipla</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label htmlFor="field-category">Categoria</Label>
                                <Select
                                    value={localCategory}
                                    onValueChange={setLocalCategory}
                                >
                                    <SelectTrigger id="field-category">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="geral">Geral</SelectItem>
                                        <SelectItem value="identificacao">Identificação</SelectItem>
                                        <SelectItem value="historico_clinico">Histórico Clínico</SelectItem>
                                        <SelectItem value="historico_familiar">Histórico Familiar</SelectItem>
                                        <SelectItem value="habitos_vida">Hábitos de Vida</SelectItem>
                                        <SelectItem value="objetivos">Objetivos</SelectItem>
                                        <SelectItem value="habitos_alimentares">Hábitos Alimentares</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="field-required"
                                checked={localIsRequired}
                                onCheckedChange={setLocalIsRequired}
                            />
                            <Label
                                htmlFor="field-required"
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                                Campo obrigatório
                            </Label>
                        </div>

                        {/* Campo de opções para seleção */}
                        {isSelectionType && (
                            <div className="space-y-3">
                                <Label>Opções de Resposta</Label>

                                {loadingOptions ? (
                                    <div className="flex items-center justify-center py-4">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    </div>
                                ) : (
                                    <>
                                        {/* Lista de opções */}
                                        {localOptions.length > 0 && (
                                            <div className="space-y-2 mb-3">
                                                {localOptions.map((option, index) => (
                                                    <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                                        <span className="flex-1 text-sm">{option}</span>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleRemoveOption(index)}
                                                        >
                                                            <Trash2 className="w-4 h-4 text-red-500" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Adicionar nova opção */}
                                        <div className="flex gap-2">
                                            <Input
                                                value={newOption}
                                                onChange={(e) => setNewOption(e.target.value)}
                                                placeholder="Digite uma opção..."
                                                onKeyPress={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAddOption();
                                                    }
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                onClick={handleAddOption}
                                                variant="outline"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </Button>
                                        </div>

                                        {localOptions.length === 0 && (
                                            <p className="text-sm text-muted-foreground italic">
                                                Adicione pelo menos uma opção de resposta
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setShowFieldModal(false);
                            setLocalOptions([]);
                        }}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave}>
                            {editingField ? 'Salvar' : 'Adicionar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    });

    // Dialogs de Confirmação
    const DeleteDialog = () => (
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
    );

    const DeleteTemplateDialog = () => (
        <AlertDialog open={showDeleteTemplateDialog} onOpenChange={setShowDeleteTemplateDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Exclusão do Formulário</AlertDialogTitle>
                    <AlertDialogDescription>
                        Tem certeza que deseja excluir o formulário "{templateToDelete?.title}"?
                        Todas as perguntas associadas serão excluídas permanentemente.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={deletingTemplate}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDeleteCustomTemplate}
                        disabled={deletingTemplate}
                        className="bg-red-600 hover:bg-red-700"
                    >
                        {deletingTemplate ? (
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
    );

    const DeleteFieldDialog = () => (
        <AlertDialog open={showDeleteFieldDialog} onOpenChange={setShowDeleteFieldDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Exclusão da Pergunta</AlertDialogTitle>
                    <AlertDialogDescription>
                        Tem certeza que deseja excluir a pergunta "{fieldToDelete?.field_label}"?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={deletingField}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDeleteField}
                        disabled={deletingField}
                        className="bg-red-600 hover:bg-red-700"
                    >
                        {deletingField ? (
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
    );

    // ============================================================
    // RENDER PRINCIPAL
    // ============================================================

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#5f6f52] mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">Carregando...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background overflow-x-hidden">
            <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6 min-w-0">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/hub`)}
                            className="mb-3 -ml-2 text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10"
                        >
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            Voltar
                        </Button>
                        <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2 sm:gap-3">
                            <ClipboardList className="w-6 h-6 sm:w-8 sm:h-8 text-[#5f6f52]" />
                            <span className="truncate">Anamnese</span>
                        </h1>
                        {patient && (
                            <p className="text-sm text-muted-foreground mt-1 truncate">
                                Paciente: <span className="font-medium text-foreground">{patient.name}</span>
                            </p>
                        )}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        {/* Botão Gerenciar Formulários */}
                        {customTemplates.length > 0 && (
                            <Button
                                variant="outline"
                                onClick={() => setShowManageCustomModal(true)}
                                className="flex-1 sm:flex-none"
                            >
                                <FolderCog className="w-4 h-4 mr-2" />
                                <span className="hidden sm:inline">Gerenciar Formulários</span>
                                <span className="sm:hidden">Gerenciar</span>
                            </Button>
                        )}

                        {/* Botão Nova Anamnese */}
                        {anamnesisList.length > 0 && (
                            <Button
                                onClick={handleCreateNew}
                                size="lg"
                                className="gap-2 flex-1 sm:flex-none"
                            >
                                <Plus className="w-5 h-5" />
                                Nova Anamnese
                            </Button>
                        )}
                    </div>
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

            {/* Modals */}
            <TypeSelectionModal />
            <TemplateSelectionModal />
            <CreateCustomModal />
            <EditCustomTemplateModal />
            <FieldModal />
            <DeleteDialog />
            <DeleteTemplateDialog />
            <DeleteFieldDialog />

            {/* Modal de Gerenciamento de Formulários Personalizados */}
            <Dialog open={showManageCustomModal} onOpenChange={setShowManageCustomModal}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Meus Formulários Personalizados</DialogTitle>
                        <DialogDescription>
                            Gerencie seus formulários de anamnese personalizados
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                        {customTemplates.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">
                                Nenhum formulário personalizado criado ainda.
                            </p>
                        ) : (
                            customTemplates.map((template) => (
                                <div key={template.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                                    <div>
                                        <h4 className="font-semibold">{template.title}</h4>
                                        {template.description && (
                                            <p className="text-sm text-muted-foreground">{template.description}</p>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setShowManageCustomModal(false);
                                                handleEditCustomTemplate(template);
                                            }}
                                        >
                                            <Edit2 className="w-4 h-4 mr-2" />
                                            Editar Campos
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setTemplateToDelete(template);
                                                setShowDeleteTemplateDialog(true);
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowManageCustomModal(false)}
                        >
                            Fechar
                        </Button>
                        <Button onClick={() => {
                            setShowManageCustomModal(false);
                            setShowCreateCustomModal(true);
                        }}>
                            <Plus className="w-4 h-4 mr-2" />
                            Novo Formulário
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default PatientAnamnesePage;
