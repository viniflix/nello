import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Save, FileCheck, Loader2, AlertCircle, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    getTemplateById,
    getAnamnesisById,
    createAnamnesis,
    updateAnamnesis
} from '@/lib/supabase/anamnesis-queries';
import { getPatientProfile } from '@/lib/supabase/patient-queries';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

/**
 * PatientAnamnesisForm - Formulário de Anamnese com Accordion
 *
 * Renderiza dinamicamente campos baseado no template
 * Suporta modo criação e edição
 */
const PatientAnamnesisForm = () => {
    const navigate = useNavigate();
    const { patientId, anamnesisId } = useParams();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();

    const templateId = searchParams.get('templateId');
    const isEditMode = !!anamnesisId;

    const [patient, setPatient] = useState(null);
    const [template, setTemplate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // Form data: content é um objeto { sectionId: { fieldId: value } }
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        notes: '',
        content: {},
        conditionalFields: {} // Armazena valores de campos condicionais (quantidade, frequência)
    });

    // Estado de validação
    const [validationErrors, setValidationErrors] = useState({});
    const [showValidation, setShowValidation] = useState(false);

    // Accordion: primeira seção aberta por padrão
    const [openSections, setOpenSections] = useState(['section-0']);

    // ============================================================
    // CARREGAR DADOS INICIAIS
    // ============================================================
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

                if (isEditMode) {
                    // MODO EDIÇÃO: Buscar anamnese existente
                    const { data: anamnesisData, error: anamnesisError } = await getAnamnesisById(anamnesisId);
                    if (anamnesisError) throw new Error('Erro ao buscar anamnese');

                    setTemplate(anamnesisData.template);

                    // Separar campos condicionais do content
                    const { _conditionalFields, ...regularContent } = anamnesisData.content || {};

                    setFormData({
                        date: anamnesisData.date,
                        notes: anamnesisData.notes || '',
                        content: regularContent,
                        conditionalFields: _conditionalFields || {}
                    });
                } else {
                    // MODO CRIAÇÃO: Buscar template
                    if (!templateId) throw new Error('Template não especificado');

                    const { data: templateData, error: templateError } = await getTemplateById(templateId);
                    if (templateError) throw new Error('Erro ao buscar template');
                    setTemplate(templateData);

                    // Inicializar content vazio baseado no template
                    const initialContent = {};
                    if (templateData.sections?.sections) {
                        templateData.sections.sections.forEach((section, sectionIdx) => {
                            const sectionKey = `section_${sectionIdx}`;
                            initialContent[sectionKey] = {};
                            section.fields.forEach((field, fieldIdx) => {
                                const fieldKey = `field_${fieldIdx}`;
                                initialContent[sectionKey][fieldKey] = getDefaultValue(field);
                            });
                        });
                    }
                    setFormData(prev => ({ ...prev, content: initialContent }));
                }
            } catch (err) {
                console.error('Erro ao carregar dados:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [patientId, anamnesisId, templateId, user?.id, isEditMode]);

    // ============================================================
    // HELPERS
    // ============================================================
    const getDefaultValue = (field) => {
        switch (field.type) {
            case 'checkbox':
                return false;
            case 'multiselect':
            case 'checkboxGroup':
                return [];
            case 'radio':
                return '';
            default:
                return '';
        }
    };

    const handleFieldChange = (sectionIdx, fieldIdx, value) => {
        const sectionKey = `section_${sectionIdx}`;
        const fieldKey = `field_${fieldIdx}`;

        setFormData(prev => ({
            ...prev,
            content: {
                ...prev.content,
                [sectionKey]: {
                    ...prev.content[sectionKey],
                    [fieldKey]: value
                }
            }
        }));
    };

    const getFieldValue = (sectionIdx, fieldIdx) => {
        const sectionKey = `section_${sectionIdx}`;
        const fieldKey = `field_${fieldIdx}`;
        return formData.content[sectionKey]?.[fieldKey] ?? '';
    };

    // Handler para campos condicionais (quantidade/frequência)
    const handleConditionalFieldChange = (sectionIdx, fieldIdx, value) => {
        const fieldKey = `${sectionIdx}_${fieldIdx}`;
        setFormData(prev => ({
            ...prev,
            conditionalFields: {
                ...prev.conditionalFields,
                [fieldKey]: value
            }
        }));
    };

    const getConditionalFieldValue = (sectionIdx, fieldIdx) => {
        const fieldKey = `${sectionIdx}_${fieldIdx}`;
        return formData.conditionalFields[fieldKey] || '';
    };

    // Verificar se campo é obrigatório
    const isFieldRequired = (field) => {
        return field.required === true || field.required === 'true';
    };

    // Validar formulário
    const validateForm = () => {
        const errors = {};
        let hasErrors = false;

        if (!template?.sections?.sections) return { hasErrors: false, errors };

        template.sections.sections.forEach((section, sectionIdx) => {
            section.fields.forEach((field, fieldIdx) => {
                if (isFieldRequired(field)) {
                    const value = getFieldValue(sectionIdx, fieldIdx);
                    const fieldKey = `${sectionIdx}_${fieldIdx}`;

                    // Validar campo vazio
                    if (value === '' || value === null || value === undefined) {
                        errors[fieldKey] = 'Este campo é obrigatório';
                        hasErrors = true;
                    } else if (Array.isArray(value) && value.length === 0) {
                        errors[fieldKey] = 'Selecione pelo menos uma opção';
                        hasErrors = true;
                    }
                }
            });
        });

        setValidationErrors(errors);
        return { hasErrors, errors };
    };

    // Limpar erro de um campo específico
    const clearFieldError = (sectionIdx, fieldIdx) => {
        const fieldKey = `${sectionIdx}_${fieldIdx}`;
        if (validationErrors[fieldKey]) {
            setValidationErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[fieldKey];
                return newErrors;
            });
        }
    };

    // ============================================================
    // SUBMIT HANDLERS
    // ============================================================
    const handleSave = async (status = 'draft') => {
        if (!patientId || !user?.id) return;

        // Validar apenas quando concluir (não validar rascunhos)
        if (status === 'completed') {
            setShowValidation(true);
            const validation = validateForm();

            if (validation.hasErrors) {
                setError('Por favor, preencha todos os campos obrigatórios antes de concluir.');

                // Abrir as seções que contêm erros
                const sectionsWithErrors = new Set();
                Object.keys(validation.errors).forEach(key => {
                    const [sectionIdx] = key.split('_');
                    sectionsWithErrors.add(`section-${sectionIdx}`);
                });
                setOpenSections(Array.from(sectionsWithErrors));

                setSaving(false);
                return;
            }
        }

        setSaving(true);
        setError(null);

        try {
            // Mesclar campos condicionais no content
            const contentWithConditionals = {
                ...formData.content,
                _conditionalFields: formData.conditionalFields
            };

            const submitData = {
                patientId,
                nutritionistId: user.id,
                templateId: template.id,
                date: formData.date,
                notes: formData.notes,
                content: contentWithConditionals,
                status
            };

            if (isEditMode) {
                // Atualizar existente
                const { error: updateError } = await updateAnamnesis(anamnesisId, submitData);
                if (updateError) throw updateError;
            } else {
                // Criar nova
                const { error: createError } = await createAnamnesis(submitData);
                if (createError) throw createError;
            }

            // Sucesso - voltar para listagem
            navigate(`/nutritionist/patients/${patientId}/anamnesis`);
        } catch (err) {
            console.error('Erro ao salvar anamnese:', err);
            setError('Erro ao salvar anamnese. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    // ============================================================
    // RENDERIZADORES DE CAMPO POR TIPO
    // ============================================================
    const renderField = (field, sectionIdx, fieldIdx) => {
        const fieldId = `field-${sectionIdx}-${fieldIdx}`;
        const value = getFieldValue(sectionIdx, fieldIdx);
        const fieldKey = `${sectionIdx}_${fieldIdx}`;
        const hasError = showValidation && validationErrors[fieldKey];
        const isRequired = isFieldRequired(field);

        switch (field.type) {
            case 'text':
            case 'email':
            case 'phone':
                return (
                    <div key={fieldId} className="space-y-2">
                        <Label htmlFor={fieldId}>
                            {field.label}
                            {isRequired && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        <Input
                            id={fieldId}
                            type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                            value={value}
                            onChange={(e) => {
                                handleFieldChange(sectionIdx, fieldIdx, e.target.value);
                                clearFieldError(sectionIdx, fieldIdx);
                            }}
                            placeholder={field.placeholder || ''}
                            className={cn(hasError && "border-red-500 focus-visible:ring-red-500")}
                        />
                        {hasError && (
                            <p className="text-sm text-red-500">{validationErrors[fieldKey]}</p>
                        )}
                    </div>
                );

            case 'number':
                return (
                    <div key={fieldId} className="space-y-2">
                        <Label htmlFor={fieldId}>
                            {field.label}
                            {isRequired && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        <Input
                            id={fieldId}
                            type="number"
                            value={value}
                            onChange={(e) => {
                                handleFieldChange(sectionIdx, fieldIdx, e.target.value);
                                clearFieldError(sectionIdx, fieldIdx);
                            }}
                            placeholder={field.placeholder || ''}
                            className={cn(hasError && "border-red-500 focus-visible:ring-red-500")}
                        />
                        {hasError && (
                            <p className="text-sm text-red-500">{validationErrors[fieldKey]}</p>
                        )}
                    </div>
                );

            case 'date':
                return (
                    <div key={fieldId} className="space-y-2">
                        <Label htmlFor={fieldId}>
                            {field.label}
                            {isRequired && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        <Input
                            id={fieldId}
                            type="date"
                            value={value}
                            onChange={(e) => {
                                handleFieldChange(sectionIdx, fieldIdx, e.target.value);
                                clearFieldError(sectionIdx, fieldIdx);
                            }}
                            className={cn(hasError && "border-red-500 focus-visible:ring-red-500")}
                        />
                        {hasError && (
                            <p className="text-sm text-red-500">{validationErrors[fieldKey]}</p>
                        )}
                    </div>
                );

            case 'textarea':
                return (
                    <div key={fieldId} className="space-y-2">
                        <Label htmlFor={fieldId}>
                            {field.label}
                            {isRequired && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        <Textarea
                            id={fieldId}
                            value={value}
                            onChange={(e) => {
                                handleFieldChange(sectionIdx, fieldIdx, e.target.value);
                                clearFieldError(sectionIdx, fieldIdx);
                            }}
                            placeholder={field.placeholder || ''}
                            rows={field.rows || 3}
                            className={cn(hasError && "border-red-500 focus-visible:ring-red-500")}
                        />
                        {hasError && (
                            <p className="text-sm text-red-500">{validationErrors[fieldKey]}</p>
                        )}
                    </div>
                );

            case 'select':
                return (
                    <div key={fieldId} className="space-y-2">
                        <Label htmlFor={fieldId}>
                            {field.label}
                            {isRequired && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        <Select
                            value={value}
                            onValueChange={(val) => {
                                handleFieldChange(sectionIdx, fieldIdx, val);
                                clearFieldError(sectionIdx, fieldIdx);
                            }}
                        >
                            <SelectTrigger className={cn(hasError && "border-red-500 focus:ring-red-500")}>
                                <SelectValue placeholder={field.placeholder || 'Selecione...'} />
                            </SelectTrigger>
                            <SelectContent>
                                {field.options?.map((option, idx) => (
                                    <SelectItem key={idx} value={option.value || option}>
                                        {option.label || option}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {hasError && (
                            <p className="text-sm text-red-500">{validationErrors[fieldKey]}</p>
                        )}
                    </div>
                );

            case 'checkbox':
                return (
                    <div key={fieldId} className="space-y-2">
                        <div className="flex items-center space-x-2 py-2">
                            <Checkbox
                                id={fieldId}
                                checked={value === true}
                                onCheckedChange={(checked) => {
                                    handleFieldChange(sectionIdx, fieldIdx, checked);
                                    clearFieldError(sectionIdx, fieldIdx);
                                }}
                            />
                            <Label htmlFor={fieldId} className="cursor-pointer">
                                {field.label}
                                {isRequired && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                        </div>
                        {hasError && (
                            <p className="text-sm text-red-500">{validationErrors[fieldKey]}</p>
                        )}
                    </div>
                );

            case 'multiselect':
            case 'checkboxGroup':
                return (
                    <div key={fieldId} className="space-y-2">
                        <Label>
                            {field.label}
                            {isRequired && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pl-2">
                            {field.options?.map((option, idx) => {
                                const optionValue = option.value || option;
                                const isChecked = Array.isArray(value) && value.includes(optionValue);
                                return (
                                    <div key={idx} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`${fieldId}-${idx}`}
                                            checked={isChecked}
                                            onCheckedChange={(checked) => {
                                                const currentValues = Array.isArray(value) ? value : [];
                                                const newValues = checked
                                                    ? [...currentValues, optionValue]
                                                    : currentValues.filter(v => v !== optionValue);
                                                handleFieldChange(sectionIdx, fieldIdx, newValues);
                                                clearFieldError(sectionIdx, fieldIdx);
                                            }}
                                        />
                                        <Label htmlFor={`${fieldId}-${idx}`} className="cursor-pointer text-sm">
                                            {option.label || option}
                                        </Label>
                                    </div>
                                );
                            })}
                        </div>
                        {hasError && (
                            <p className="text-sm text-red-500 mt-2">{validationErrors[fieldKey]}</p>
                        )}
                    </div>
                );

            case 'radio':
                // Verificar se tem campo condicional (quantidade)
                const hasConditionalInput = field.conditionalField ||
                    (field.label && (
                        field.label.includes('Fumante') ||
                        field.label.includes('Bebida') ||
                        field.label.includes('álcool') ||
                        field.label.includes('Atividade física')
                    ));

                const showConditionalInput = hasConditionalInput && value &&
                    value !== 'Não' && value !== 'não' && value !== 'Nunca';

                const conditionalValue = getConditionalFieldValue(sectionIdx, fieldIdx);

                return (
                    <div key={fieldId} className="space-y-3">
                        <div>
                            <Label>
                                {field.label}
                                {isRequired && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            <div className="flex flex-wrap gap-4 pl-2 mt-2">
                                {field.options?.map((option, idx) => {
                                    const optionValue = option.value || option;
                                    const optionLabel = option.label || option;
                                    const isSelected = value === optionValue;
                                    return (
                                        <div key={idx} className="flex items-center space-x-2">
                                            <input
                                                type="radio"
                                                id={`${fieldId}-${idx}`}
                                                name={fieldId}
                                                checked={isSelected}
                                                onChange={() => {
                                                    handleFieldChange(sectionIdx, fieldIdx, optionValue);
                                                    clearFieldError(sectionIdx, fieldIdx);
                                                }}
                                                className="w-4 h-4 text-[#5f6f52] border-gray-300 focus:ring-[#5f6f52]"
                                            />
                                            <Label htmlFor={`${fieldId}-${idx}`} className="cursor-pointer text-sm">
                                                {optionLabel}
                                            </Label>
                                        </div>
                                    );
                                })}
                            </div>
                            {hasError && (
                                <p className="text-sm text-red-500 mt-2">{validationErrors[fieldKey]}</p>
                            )}
                        </div>

                        {/* Campo condicional de quantidade */}
                        {showConditionalInput && (
                            <div className="pl-2 pt-2 border-l-2 border-[#a9b388]">
                                <Label htmlFor={`${fieldId}-quantity`} className="text-sm text-muted-foreground">
                                    Quantidade/Frequência
                                </Label>
                                <Input
                                    id={`${fieldId}-quantity`}
                                    type="text"
                                    value={conditionalValue}
                                    onChange={(e) => handleConditionalFieldChange(sectionIdx, fieldIdx, e.target.value)}
                                    placeholder="Ex: 5 cigarros/dia, 2x por semana, etc."
                                    className="mt-1"
                                />
                            </div>
                        )}
                    </div>
                );

            default:
                return (
                    <div key={fieldId} className="text-sm text-muted-foreground">
                        Tipo de campo não suportado: {field.type}
                    </div>
                );
        }
    };

    // ============================================================
    // LOADING STATE
    // ============================================================
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#5f6f52] mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">Carregando formulário...</p>
                </div>
            </div>
        );
    }

    // ============================================================
    // RENDER PRINCIPAL
    // ============================================================
    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-4xl mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between">
                    <div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/hub`)}
                            className="mb-3"
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            Voltar ao Prontuário
                        </Button>
                        <h1 className="text-3xl font-bold text-foreground">
                            {isEditMode ? 'Editar Anamnese' : 'Nova Anamnese'}
                        </h1>
                        {patient && (
                            <p className="text-sm text-muted-foreground mt-1">
                                Paciente: <span className="font-medium text-foreground">{patient.full_name || patient.name || 'Nome não disponível'}</span>
                            </p>
                        )}
                        {template && (
                            <p className="text-sm text-muted-foreground">
                                Documento: <span className="font-medium">{template.title}</span>
                            </p>
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

                {/* Formulário */}
                <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
                    {/* Metadados da Anamnese */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Informações da Anamnese</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="date">Data da Anamnese</Label>
                                    <Input
                                        id="date"
                                        type="date"
                                        value={formData.date}
                                        onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="notes">Observações Gerais (opcional)</Label>
                                <Textarea
                                    id="notes"
                                    value={formData.notes}
                                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                    placeholder="Anotações adicionais sobre esta anamnese..."
                                    rows={3}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Accordion de Seções */}
                    {template?.sections?.sections && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Questionário</CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    Preencha as seções abaixo. Você pode expandir/recolher cada seção clicando nela.
                                </p>
                            </CardHeader>
                            <CardContent>
                                <Accordion
                                    type="multiple"
                                    value={openSections}
                                    onValueChange={setOpenSections}
                                    className="w-full"
                                >
                                    {template.sections.sections.map((section, sectionIdx) => (
                                        <AccordionItem
                                            key={`section-${sectionIdx}`}
                                            value={`section-${sectionIdx}`}
                                            className="border-b"
                                        >
                                            <AccordionTrigger className="hover:no-underline">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                                        openSections.includes(`section-${sectionIdx}`)
                                                            ? "bg-[#5f6f52] text-white"
                                                            : "bg-[#5f6f52]/10 text-[#5f6f52]"
                                                    )}>
                                                        {sectionIdx + 1}
                                                    </div>
                                                    <span className="font-semibold text-left">{section.title}</span>
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent className="pt-4 pb-6">
                                                <div className="space-y-4 pl-11">
                                                    {section.fields.map((field, fieldIdx) => (
                                                        renderField(field, sectionIdx, fieldIdx)
                                                    ))}
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            </CardContent>
                        </Card>
                    )}

                    {/* Botões de Ação */}
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => navigate(`/nutritionist/patients/${patientId}/anamnesis`)}
                                    disabled={saving}
                                >
                                    Cancelar
                                </Button>
                                <div className="flex gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => handleSave('draft')}
                                        disabled={saving}
                                        className="gap-2"
                                    >
                                        {saving ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Save className="w-4 h-4" />
                                        )}
                                        Salvar Rascunho
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => handleSave('completed')}
                                        disabled={saving}
                                        className="gap-2"
                                    >
                                        {saving ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <FileCheck className="w-4 h-4" />
                                        )}
                                        Concluir e Salvar
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </form>
            </div>
        </div>
    );
};

export default PatientAnamnesisForm;
