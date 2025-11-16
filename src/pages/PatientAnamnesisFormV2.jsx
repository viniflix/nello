import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, FileCheck, Loader2, AlertCircle, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    getAnamnesisById,
    createAnamnesis,
    updateAnamnesis,
    getAnamneseFields,
    getAnamneseAnswers,
    upsertAnamneseAnswers,
    getFieldOptions
} from '@/lib/supabase/anamnesis-queries';
import { getPatientProfile } from '@/lib/supabase/patient-queries';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { anamnesisFormSchema } from '@/lib/validations/anamnesis-schema';
import { useToast } from '@/hooks/use-toast';

/**
 * PatientAnamnesisFormV2 - Formulário de Anamnese Melhorado
 * ETAPA 1: Validação + Campos Condicionais + Listas Dinâmicas
 *
 * Melhorias implementadas:
 * - Validação Zod completa com React Hook Form
 * - Campos obrigatórios com asterisco vermelho
 * - Campos condicionais (fumo, bebida, exercício)
 * - Listas dinâmicas (doenças, medicamentos, alergias)
 * - Mensagens de erro específicas
 * - Scroll automático para erros
 * - Salvamento estruturado no JSONB
 */
const PatientAnamnesisFormV2 = () => {
    const navigate = useNavigate();
    const { patientId, anamnesisId } = useParams();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const { toast } = useToast();

    // Check if this is a custom form
    const customTemplateId = searchParams.get('customTemplateId');
    const isCustomForm = !!customTemplateId;
    const isEditMode = !!anamnesisId;

    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [openSections, setOpenSections] = useState(['section-0']);

    // Custom form fields and answers
    const [customFields, setCustomFields] = useState([]);
    const [customAnswers, setCustomAnswers] = useState({});
    const [fieldOptions, setFieldOptions] = useState({}); // { fieldId: [options] }

    // Referências para scroll automático
    const formRef = useRef(null);
    const errorRefs = useRef({});

    // ============================================================
    // REACT HOOK FORM COM ZOD
    // ============================================================
    const {
        register,
        control,
        handleSubmit,
        watch,
        setValue,
        formState: { errors, isSubmitting },
        trigger,
        reset
    } = useForm({
        resolver: zodResolver(anamnesisFormSchema),
        defaultValues: {
            date: new Date().toISOString().split('T')[0],
            notes: '',
            identificacao: {
                data_nascimento: '',
                idade: '',
                profissao: '',
                estado_civil: ''
            },
            historico_clinico: {
                tem_doenca: '',
                doencas: [],
                toma_medicamento: '',
                medicamentos: [],
                tem_alergia: '',
                alergias: [],
                historico_cirurgias: '',
                outras_condicoes: ''
            },
            historico_familiar: {
                diabetes: '',
                hipertensao: '',
                obesidade: '',
                cancer: '',
                doencas_cardiovasculares: '',
                outras_doencas_familiares: ''
            },
            habitos_vida: {
                pratica_exercicio: '',
                fuma: '',
                bebe: '',
                horas_sono: '',
                qualidade_sono: '',
                nivel_estresse: '',
                consumo_agua_litros: ''
            },
            objetivos: {
                objetivo_principal: '',
                peso_atual: '',
                peso_desejado: '',
                prazo_objetivo: '',
                tentativas_anteriores: ''
            },
            habitos_alimentares: {
                refeicoes_por_dia: '',
                local_refeicoes: [],
                quem_prepara_comida: '',
                preferencias_alimentares: [],
                alimentos_nao_gosta: '',
                suplementos: ''
            }
        },
        mode: 'onBlur' // Validação ao sair do campo
    });

    // ============================================================
    // FIELD ARRAYS PARA LISTAS DINÂMICAS
    // ============================================================
    const { fields: doencasFields, append: appendDoenca, remove: removeDoenca } = useFieldArray({
        control,
        name: 'historico_clinico.doencas'
    });

    const { fields: medicamentosFields, append: appendMedicamento, remove: removeMedicamento } = useFieldArray({
        control,
        name: 'historico_clinico.medicamentos'
    });

    const { fields: alergiasFields, append: appendAlergia, remove: removeAlergia } = useFieldArray({
        control,
        name: 'historico_clinico.alergias'
    });

    // ============================================================
    // WATCH PARA CAMPOS CONDICIONAIS
    // ============================================================
    const temDoenca = watch('historico_clinico.tem_doenca');
    const tomaMedicamento = watch('historico_clinico.toma_medicamento');
    const temAlergia = watch('historico_clinico.tem_alergia');
    const praticaExercicio = watch('habitos_vida.pratica_exercicio');
    const fuma = watch('habitos_vida.fuma');
    const bebe = watch('habitos_vida.bebe');

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

                // Se for formulário personalizado, carregar campos e respostas
                if (isCustomForm) {
                    const { data: fieldsData, error: fieldsError } = await getAnamneseFields(user.id, customTemplateId);
                    if (fieldsError) throw new Error('Erro ao buscar campos personalizados');
                    setCustomFields(fieldsData || []);

                    // Carregar opções para campos de seleção
                    const optionsMap = {};
                    for (const field of fieldsData || []) {
                        if (field.field_type === 'selecao_unica' || field.field_type === 'selecao_multipla') {
                            const { data: options, error: optionsError } = await getFieldOptions(field.id);
                            if (!optionsError && options) {
                                optionsMap[field.id] = options;
                            }
                        }
                    }
                    setFieldOptions(optionsMap);

                    // Carregar respostas existentes (se houver)
                    const { data: answersData, error: answersError } = await getAnamneseAnswers(patientId);
                    if (answersError) throw new Error('Erro ao buscar respostas');

                    // Converter array de respostas para objeto {fieldId: valor}
                    const answersMap = {};
                    (answersData || []).forEach(answer => {
                        // Parse JSON para seleção múltipla
                        try {
                            const parsedValue = JSON.parse(answer.answer_value);
                            answersMap[answer.field_id] = parsedValue;
                        } catch {
                            answersMap[answer.field_id] = answer.answer_value;
                        }
                    });
                    setCustomAnswers(answersMap);

                } else if (isEditMode) {
                    // MODO EDIÇÃO: Buscar anamnese existente (formulário padrão)
                    const { data: anamnesisData, error: anamnesisError } = await getAnamnesisById(anamnesisId);
                    if (anamnesisError) throw new Error('Erro ao buscar anamnese');

                    // Resetar formulário com dados existentes
                    reset({
                        date: anamnesisData.date,
                        notes: anamnesisData.notes || '',
                        ...anamnesisData.content
                    });
                }
            } catch (err) {
                console.error('Erro ao carregar dados:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [patientId, anamnesisId, user?.id, isEditMode, isCustomForm, reset]);

    // ============================================================
    // LIMPAR CAMPOS CONDICIONAIS QUANDO MUDAREM
    // ============================================================
    useEffect(() => {
        if (temDoenca === 'nao') {
            setValue('historico_clinico.doencas', []);
        }
    }, [temDoenca, setValue]);

    useEffect(() => {
        if (tomaMedicamento === 'nao') {
            setValue('historico_clinico.medicamentos', []);
        }
    }, [tomaMedicamento, setValue]);

    useEffect(() => {
        if (temAlergia === 'nao') {
            setValue('historico_clinico.alergias', []);
        }
    }, [temAlergia, setValue]);

    useEffect(() => {
        if (praticaExercicio === 'nao') {
            setValue('habitos_vida.exercicio_detalhes', undefined);
        }
    }, [praticaExercicio, setValue]);

    useEffect(() => {
        if (fuma === 'nao') {
            setValue('habitos_vida.fuma_detalhes', undefined);
        }
    }, [fuma, setValue]);

    useEffect(() => {
        if (bebe === 'nao') {
            setValue('habitos_vida.bebida_detalhes', undefined);
        }
    }, [bebe, setValue]);

    // ============================================================
    // SCROLL AUTOMÁTICO PARA PRIMEIRO ERRO
    // ============================================================
    useEffect(() => {
        if (Object.keys(errors).length > 0) {
            // Encontrar primeiro campo com erro
            const firstErrorKey = Object.keys(errors)[0];
            const firstErrorRef = errorRefs.current[firstErrorKey];

            if (firstErrorRef) {
                firstErrorRef.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }

            // Abrir seções que contêm erros
            const sectionsWithErrors = new Set();
            if (errors.identificacao) sectionsWithErrors.add('section-0');
            if (errors.historico_clinico) sectionsWithErrors.add('section-1');
            if (errors.historico_familiar) sectionsWithErrors.add('section-2');
            if (errors.habitos_vida) sectionsWithErrors.add('section-3');
            if (errors.objetivos) sectionsWithErrors.add('section-4');
            if (errors.habitos_alimentares) sectionsWithErrors.add('section-5');

            if (sectionsWithErrors.size > 0) {
                setOpenSections(Array.from(sectionsWithErrors));
            }
        }
    }, [errors]);

    // ============================================================
    // SUBMIT HANDLERS
    // ============================================================
    const onSubmit = async (data, status = 'completed') => {
        if (!patientId || !user?.id) return;

        setSaving(true);
        setError(null);

        try {
            // Se for formulário personalizado, salvar respostas na tabela anamnese_answers
            if (isCustomForm) {
                // Validar campos obrigatórios apenas se não for rascunho
                if (status === 'completed') {
                    const missingRequired = customFields.filter(field =>
                        field.is_required && (!customAnswers[field.id] ||
                        (Array.isArray(customAnswers[field.id]) && customAnswers[field.id].length === 0) ||
                        (typeof customAnswers[field.id] === 'string' && customAnswers[field.id].trim() === ''))
                    );

                    if (missingRequired.length > 0) {
                        toast({
                            variant: 'destructive',
                            title: 'Campos obrigatórios não preenchidos',
                            description: `Preencha todos os campos obrigatórios: ${missingRequired.map(f => f.field_label).join(', ')}`,
                        });
                        setSaving(false);
                        return;
                    }
                }

                // IMPORTANTE: Criar registro na tabela anamnesis_records primeiro
                // para que o formulário apareça na lista de anamneses
                if (isEditMode) {
                    // Se está editando, atualizar o registro existente
                    const updateData = {
                        status,
                        updated_at: new Date().toISOString()
                    };
                    const { error: updateError } = await updateAnamnesis(anamnesisId, updateData);
                    if (updateError) throw updateError;
                } else {
                    // Se é novo, criar registro na anamnesis_records
                    const recordData = {
                        patientId,
                        nutritionistId: user.id,
                        templateId: customTemplateId, // ID do template personalizado
                        date: new Date().toISOString().split('T')[0],
                        notes: '',
                        content: {}, // Formulário personalizado usa anamnese_answers, não content
                        status
                    };
                    const { error: createError } = await createAnamnesis(recordData);
                    if (createError) throw createError;
                }

                // Agora salvar as respostas dos campos personalizados
                const answersToSave = customFields.map(field => {
                    let answerValue = customAnswers[field.id] || '';

                    // Se for seleção múltipla, converter array para JSON
                    if (field.field_type === 'selecao_multipla' && Array.isArray(answerValue)) {
                        answerValue = JSON.stringify(answerValue);
                    }

                    return {
                        patient_id: patientId,
                        field_id: field.id,
                        answer_value: typeof answerValue === 'string' ? answerValue : String(answerValue)
                    };
                });

                const { error: saveError } = await upsertAnamneseAnswers(answersToSave);
                if (saveError) throw saveError;

                toast({
                    title: status === 'draft' ? 'Rascunho salvo!' : 'Anamnese salva!',
                    description: status === 'draft'
                        ? 'Rascunho salvo com sucesso. Você pode continuar depois.'
                        : 'As respostas do formulário personalizado foram salvas com sucesso.',
                });

                // Voltar para a página de anamnese do paciente
                navigate(`/nutritionist/patients/${patientId}/anamnese`);
                return;
            }

            // Formulário padrão - salvar na tabela anamnesis_records
            const submitData = {
                patientId,
                nutritionistId: user.id,
                templateId: null, // Formulário fixo não usa template
                date: data.date,
                notes: data.notes,
                content: {
                    identificacao: data.identificacao,
                    historico_clinico: data.historico_clinico,
                    historico_familiar: data.historico_familiar,
                    habitos_vida: data.habitos_vida,
                    objetivos: data.objetivos,
                    habitos_alimentares: data.habitos_alimentares
                },
                status
            };

            if (isEditMode) {
                // Atualizar existente
                const { error: updateError } = await updateAnamnesis(anamnesisId, submitData);
                if (updateError) throw updateError;

                toast({
                    title: 'Anamnese atualizada!',
                    description: 'As alterações foram salvas com sucesso.',
                });
            } else {
                // Criar nova
                const { error: createError } = await createAnamnesis(submitData);
                if (createError) throw createError;

                toast({
                    title: 'Anamnese criada!',
                    description: 'A anamnese foi salva com sucesso.',
                });
            }

            // Sucesso - voltar para a página de anamnese do paciente
            navigate(`/nutritionist/patients/${patientId}/anamnese`);
        } catch (err) {
            console.error('Erro ao salvar anamnese:', err);
            setError('Erro ao salvar anamnese. Tente novamente.');
            toast({
                variant: 'destructive',
                title: 'Erro ao salvar',
                description: 'Ocorreu um erro ao salvar a anamnese. Tente novamente.',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveDraft = async () => {
        // Salvar rascunho sem validação
        const data = watch();
        await onSubmit(data, 'draft');
    };

    const handleSaveCompleted = handleSubmit((data) => onSubmit(data, 'completed'));

    // ============================================================
    // HELPER COMPONENTS
    // ============================================================
    const FieldError = ({ error }) => {
        if (!error) return null;
        return <p className="text-sm text-red-500 mt-1">{error.message}</p>;
    };

    const RequiredAsterisk = () => (
        <span className="text-red-500 ml-1">*</span>
    );

    // ============================================================
    // LOADING STATE
    // ============================================================
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background-page">
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
        <div className="min-h-screen bg-background-page" ref={formRef}>
            <div className="max-w-4xl mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between">
                    <div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(isCustomForm ? `/nutritionist/patients/${patientId}/anamnese` : `/nutritionist/patients/${patientId}/hub`)}
                            className="mb-3"
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            {isCustomForm ? 'Voltar para Anamneses' : 'Voltar ao Prontuário'}
                        </Button>
                        <h1 className="text-3xl font-bold text-foreground">
                            {isCustomForm ? 'Formulário Personalizado' : (isEditMode ? 'Editar Anamnese' : 'Nova Anamnese')}
                        </h1>
                        {patient && (
                            <p className="text-sm text-muted-foreground mt-1">
                                Paciente: <span className="font-medium text-foreground">{patient.name || 'Nome não disponível'}</span>
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

                {/* Erros de validação gerais */}
                {Object.keys(errors).length > 0 && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                            Por favor, corrija os erros no formulário antes de salvar.
                        </AlertDescription>
                    </Alert>
                )}

                {/* Formulário */}
                <form className="space-y-6">
                    {/* CUSTOM FORM: Render custom fields */}
                    {isCustomForm ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>Formulário Personalizado</CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    Preencha os campos abaixo. Campos com <span className="text-red-500">*</span> são obrigatórios.
                                </p>
                            </CardHeader>
                            <CardContent>
                                {customFields.length === 0 ? (
                                    <Alert>
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertDescription>
                                            Este formulário ainda não possui campos. Volte para a página de gerenciamento e adicione perguntas.
                                        </AlertDescription>
                                    </Alert>
                                ) : (
                                    <Accordion type="multiple" defaultValue={['geral', 'identificacao', 'historico_clinico', 'historico_familiar', 'habitos_vida', 'objetivos', 'habitos_alimentares']} className="w-full">
                                        {/* Agrupar campos por categoria */}
                                        {Object.entries(
                                            customFields.reduce((acc, field) => {
                                                const category = field.category || 'geral';
                                                if (!acc[category]) acc[category] = [];
                                                acc[category].push(field);
                                                return acc;
                                            }, {})
                                        ).map(([category, fields], categoryIndex) => {
                                            const categoryNames = {
                                                geral: 'Geral',
                                                identificacao: 'Identificação',
                                                historico_clinico: 'Histórico Clínico',
                                                historico_familiar: 'Histórico Familiar',
                                                habitos_vida: 'Hábitos de Vida',
                                                objetivos: 'Objetivos',
                                                habitos_alimentares: 'Hábitos Alimentares'
                                            };

                                            return (
                                                <AccordionItem key={category} value={category} className="border-b">
                                                    <AccordionTrigger className="hover:no-underline">
                                                        <div className="flex items-center gap-3">
                                                            <div className={cn(
                                                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-[#5f6f52]/10 text-[#5f6f52]"
                                                            )}>
                                                                {categoryIndex + 1}
                                                            </div>
                                                            <span className="font-semibold text-left">{categoryNames[category] || category}</span>
                                                        </div>
                                                    </AccordionTrigger>
                                                    <AccordionContent className="pt-4 pb-6">
                                                        <div className="space-y-6 pl-11">
                                                            {fields.map((field, index) => (
                                                                <div key={field.id} className="space-y-2">
                                                                    <Label htmlFor={`field-${field.id}`} className="text-base">
                                                                        {field.field_label}
                                                                        {field.is_required && <span className="text-red-500 ml-1">*</span>}
                                                                    </Label>

                                            {field.field_type === 'texto_curto' && (
                                                <Input
                                                    id={`field-${field.id}`}
                                                    value={customAnswers[field.id] || ''}
                                                    onChange={(e) => setCustomAnswers({
                                                        ...customAnswers,
                                                        [field.id]: e.target.value
                                                    })}
                                                    placeholder="Digite sua resposta..."
                                                    className="max-w-2xl"
                                                />
                                            )}

                                            {field.field_type === 'texto_longo' && (
                                                <Textarea
                                                    id={`field-${field.id}`}
                                                    value={customAnswers[field.id] || ''}
                                                    onChange={(e) => setCustomAnswers({
                                                        ...customAnswers,
                                                        [field.id]: e.target.value
                                                    })}
                                                    placeholder="Digite sua resposta..."
                                                    rows={4}
                                                    className="max-w-2xl"
                                                />
                                            )}

                                            {field.field_type === 'selecao_unica' && fieldOptions[field.id] && (
                                                <Controller
                                                    name={`field-${field.id}`}
                                                    control={control}
                                                    defaultValue={customAnswers[field.id] || ''}
                                                    render={({ field: controllerField }) => (
                                                        <Select
                                                            value={customAnswers[field.id] || ''}
                                                            onValueChange={(value) => {
                                                                setCustomAnswers({
                                                                    ...customAnswers,
                                                                    [field.id]: value
                                                                });
                                                                controllerField.onChange(value);
                                                            }}
                                                        >
                                                            <SelectTrigger className="max-w-2xl">
                                                                <SelectValue placeholder="Selecione uma opção..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {fieldOptions[field.id].map((option) => (
                                                                    <SelectItem key={option.id} value={option.option_text}>
                                                                        {option.option_text}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                            )}

                                            {field.field_type === 'selecao_multipla' && fieldOptions[field.id] && (
                                                <div className="space-y-2 max-w-2xl">
                                                    {fieldOptions[field.id].map((option) => {
                                                        const selectedValues = Array.isArray(customAnswers[field.id])
                                                            ? customAnswers[field.id]
                                                            : [];
                                                        const isChecked = selectedValues.includes(option.option_text);

                                                        return (
                                                            <div key={option.id} className="flex items-center space-x-2">
                                                                <Checkbox
                                                                    id={`${field.id}-${option.id}`}
                                                                    checked={isChecked}
                                                                    onCheckedChange={(checked) => {
                                                                        let newValues = [...selectedValues];
                                                                        if (checked) {
                                                                            newValues.push(option.option_text);
                                                                        } else {
                                                                            newValues = newValues.filter(v => v !== option.option_text);
                                                                        }
                                                                        setCustomAnswers({
                                                                            ...customAnswers,
                                                                            [field.id]: newValues
                                                                        });
                                                                    }}
                                                                />
                                                                <Label
                                                                    htmlFor={`${field.id}-${option.id}`}
                                                                    className="text-sm font-normal cursor-pointer"
                                                                >
                                                                    {option.option_text}
                                                                </Label>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </AccordionContent>
                                                </AccordionItem>
                                            );
                                        })}
                                    </Accordion>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            {/* STANDARD FORM: Original hardcoded form */}
                            {/* Metadados da Anamnese */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Informações da Anamnese</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="date">Data da Anamnese<RequiredAsterisk /></Label>
                                            <Input
                                                id="date"
                                                type="date"
                                                {...register('date')}
                                                className={cn(errors.date && "border-red-500")}
                                            />
                                            <FieldError error={errors.date} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="notes">Observações Gerais (opcional)</Label>
                                        <Textarea
                                            id="notes"
                                            {...register('notes')}
                                            placeholder="Anotações adicionais sobre esta anamnese..."
                                            rows={3}
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                    {/* Accordion de Seções */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Questionário de Anamnese</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Preencha as seções abaixo. Campos com <RequiredAsterisk /> são obrigatórios.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <Accordion
                                type="multiple"
                                value={openSections}
                                onValueChange={setOpenSections}
                                className="w-full"
                            >
                                {/* SEÇÃO 1: IDENTIFICAÇÃO */}
                                <AccordionItem value="section-0" className="border-b">
                                    <AccordionTrigger className="hover:no-underline">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                                openSections.includes('section-0')
                                                    ? "bg-[#5f6f52] text-white"
                                                    : "bg-[#5f6f52]/10 text-[#5f6f52]"
                                            )}>
                                                1
                                            </div>
                                            <span className="font-semibold text-left">Identificação</span>
                                            {errors.identificacao && (
                                                <AlertCircle className="w-4 h-4 text-red-500" />
                                            )}
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-4 pb-6">
                                        <div className="space-y-4 pl-11">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="data_nascimento">Data de Nascimento</Label>
                                                    <Input
                                                        id="data_nascimento"
                                                        type="date"
                                                        {...register('identificacao.data_nascimento')}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="idade">Idade</Label>
                                                    <Input
                                                        id="idade"
                                                        type="text"
                                                        {...register('identificacao.idade')}
                                                        placeholder="Ex: 35 anos"
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="profissao">Profissão</Label>
                                                    <Input
                                                        id="profissao"
                                                        type="text"
                                                        {...register('identificacao.profissao')}
                                                        placeholder="Ex: Engenheiro"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="estado_civil">Estado Civil</Label>
                                                    <Controller
                                                        name="identificacao.estado_civil"
                                                        control={control}
                                                        render={({ field }) => (
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Selecione..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                                                                    <SelectItem value="casado">Casado(a)</SelectItem>
                                                                    <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                                                                    <SelectItem value="viuvo">Viúvo(a)</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* SEÇÃO 2: HISTÓRICO CLÍNICO */}
                                <AccordionItem value="section-1" className="border-b">
                                    <AccordionTrigger className="hover:no-underline">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                                openSections.includes('section-1')
                                                    ? "bg-[#5f6f52] text-white"
                                                    : "bg-[#5f6f52]/10 text-[#5f6f52]"
                                            )}>
                                                2
                                            </div>
                                            <span className="font-semibold text-left">Histórico Clínico</span>
                                            {errors.historico_clinico && (
                                                <AlertCircle className="w-4 h-4 text-red-500" />
                                            )}
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-4 pb-6">
                                        <div className="space-y-6 pl-11">
                                            {/* Tem doença? */}
                                            <div className="space-y-2" ref={el => errorRefs.current['historico_clinico.tem_doenca'] = el}>
                                                <Label>
                                                    Possui alguma doença diagnosticada?<RequiredAsterisk />
                                                </Label>
                                                <Controller
                                                    name="historico_clinico.tem_doenca"
                                                    control={control}
                                                    render={({ field }) => (
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <SelectTrigger className={cn(errors.historico_clinico?.tem_doenca && "border-red-500")}>
                                                                <SelectValue placeholder="Selecione..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="sim">Sim</SelectItem>
                                                                <SelectItem value="nao">Não</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                                <FieldError error={errors.historico_clinico?.tem_doenca} />
                                            </div>

                                            {/* Lista de Doenças (condicional) */}
                                            {temDoenca === 'sim' && (
                                                <div className="space-y-4 pl-4 border-l-2 border-[#a9b388]">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="font-semibold">Doenças</Label>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => appendDoenca({
                                                                nome: '',
                                                                diagnostico_quando: '',
                                                                tratamento_atual: ''
                                                            })}
                                                        >
                                                            <Plus className="w-4 h-4 mr-1" />
                                                            Adicionar Doença
                                                        </Button>
                                                    </div>
                                                    {doencasFields.map((field, index) => (
                                                        <Card key={field.id} className="p-4 bg-muted/30">
                                                            <div className="space-y-3">
                                                                <div className="flex items-center justify-between">
                                                                    <h4 className="text-sm font-semibold">Doença {index + 1}</h4>
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => removeDoenca(index)}
                                                                    >
                                                                        <Trash2 className="w-4 h-4 text-red-500" />
                                                                    </Button>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Label htmlFor={`doenca_nome_${index}`}>Nome da doença<RequiredAsterisk /></Label>
                                                                    <Input
                                                                        id={`doenca_nome_${index}`}
                                                                        {...register(`historico_clinico.doencas.${index}.nome`)}
                                                                        placeholder="Ex: Diabetes tipo 2"
                                                                        className={cn(errors.historico_clinico?.doencas?.[index]?.nome && "border-red-500")}
                                                                    />
                                                                    <FieldError error={errors.historico_clinico?.doencas?.[index]?.nome} />
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Label htmlFor={`doenca_quando_${index}`}>Quando foi diagnosticado?<RequiredAsterisk /></Label>
                                                                    <Input
                                                                        id={`doenca_quando_${index}`}
                                                                        {...register(`historico_clinico.doencas.${index}.diagnostico_quando`)}
                                                                        placeholder="Ex: 2020"
                                                                        className={cn(errors.historico_clinico?.doencas?.[index]?.diagnostico_quando && "border-red-500")}
                                                                    />
                                                                    <FieldError error={errors.historico_clinico?.doencas?.[index]?.diagnostico_quando} />
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Label htmlFor={`doenca_tratamento_${index}`}>Tratamento atual<RequiredAsterisk /></Label>
                                                                    <Textarea
                                                                        id={`doenca_tratamento_${index}`}
                                                                        {...register(`historico_clinico.doencas.${index}.tratamento_atual`)}
                                                                        placeholder="Ex: Medicação + dieta"
                                                                        rows={2}
                                                                        className={cn(errors.historico_clinico?.doencas?.[index]?.tratamento_atual && "border-red-500")}
                                                                    />
                                                                    <FieldError error={errors.historico_clinico?.doencas?.[index]?.tratamento_atual} />
                                                                </div>
                                                            </div>
                                                        </Card>
                                                    ))}
                                                    {doencasFields.length === 0 && (
                                                        <p className="text-sm text-muted-foreground italic">
                                                            Clique em "Adicionar Doença" para informar as doenças.
                                                        </p>
                                                    )}
                                                    <FieldError error={errors.historico_clinico?.doencas} />
                                                </div>
                                            )}

                                            {/* Toma medicamento? */}
                                            <div className="space-y-2" ref={el => errorRefs.current['historico_clinico.toma_medicamento'] = el}>
                                                <Label>
                                                    Toma algum medicamento regularmente?<RequiredAsterisk />
                                                </Label>
                                                <Controller
                                                    name="historico_clinico.toma_medicamento"
                                                    control={control}
                                                    render={({ field }) => (
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <SelectTrigger className={cn(errors.historico_clinico?.toma_medicamento && "border-red-500")}>
                                                                <SelectValue placeholder="Selecione..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="sim">Sim</SelectItem>
                                                                <SelectItem value="nao">Não</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                                <FieldError error={errors.historico_clinico?.toma_medicamento} />
                                            </div>

                                            {/* Lista de Medicamentos (condicional) */}
                                            {tomaMedicamento === 'sim' && (
                                                <div className="space-y-4 pl-4 border-l-2 border-[#a9b388]">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="font-semibold">Medicamentos</Label>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => appendMedicamento({
                                                                nome: '',
                                                                dosagem: '',
                                                                frequencia: '',
                                                                motivo: ''
                                                            })}
                                                        >
                                                            <Plus className="w-4 h-4 mr-1" />
                                                            Adicionar Medicamento
                                                        </Button>
                                                    </div>
                                                    {medicamentosFields.map((field, index) => (
                                                        <Card key={field.id} className="p-4 bg-muted/30">
                                                            <div className="space-y-3">
                                                                <div className="flex items-center justify-between">
                                                                    <h4 className="text-sm font-semibold">Medicamento {index + 1}</h4>
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => removeMedicamento(index)}
                                                                    >
                                                                        <Trash2 className="w-4 h-4 text-red-500" />
                                                                    </Button>
                                                                </div>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                    <div className="space-y-2">
                                                                        <Label htmlFor={`med_nome_${index}`}>Nome<RequiredAsterisk /></Label>
                                                                        <Input
                                                                            id={`med_nome_${index}`}
                                                                            {...register(`historico_clinico.medicamentos.${index}.nome`)}
                                                                            placeholder="Ex: Metformina"
                                                                            className={cn(errors.historico_clinico?.medicamentos?.[index]?.nome && "border-red-500")}
                                                                        />
                                                                        <FieldError error={errors.historico_clinico?.medicamentos?.[index]?.nome} />
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <Label htmlFor={`med_dosagem_${index}`}>Dosagem<RequiredAsterisk /></Label>
                                                                        <Input
                                                                            id={`med_dosagem_${index}`}
                                                                            {...register(`historico_clinico.medicamentos.${index}.dosagem`)}
                                                                            placeholder="Ex: 850mg"
                                                                            className={cn(errors.historico_clinico?.medicamentos?.[index]?.dosagem && "border-red-500")}
                                                                        />
                                                                        <FieldError error={errors.historico_clinico?.medicamentos?.[index]?.dosagem} />
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Label htmlFor={`med_freq_${index}`}>Frequência<RequiredAsterisk /></Label>
                                                                    <Input
                                                                        id={`med_freq_${index}`}
                                                                        {...register(`historico_clinico.medicamentos.${index}.frequencia`)}
                                                                        placeholder="Ex: 2x ao dia"
                                                                        className={cn(errors.historico_clinico?.medicamentos?.[index]?.frequencia && "border-red-500")}
                                                                    />
                                                                    <FieldError error={errors.historico_clinico?.medicamentos?.[index]?.frequencia} />
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Label htmlFor={`med_motivo_${index}`}>Motivo/Indicação<RequiredAsterisk /></Label>
                                                                    <Input
                                                                        id={`med_motivo_${index}`}
                                                                        {...register(`historico_clinico.medicamentos.${index}.motivo`)}
                                                                        placeholder="Ex: Diabetes"
                                                                        className={cn(errors.historico_clinico?.medicamentos?.[index]?.motivo && "border-red-500")}
                                                                    />
                                                                    <FieldError error={errors.historico_clinico?.medicamentos?.[index]?.motivo} />
                                                                </div>
                                                            </div>
                                                        </Card>
                                                    ))}
                                                    {medicamentosFields.length === 0 && (
                                                        <p className="text-sm text-muted-foreground italic">
                                                            Clique em "Adicionar Medicamento" para informar os medicamentos.
                                                        </p>
                                                    )}
                                                    <FieldError error={errors.historico_clinico?.medicamentos} />
                                                </div>
                                            )}

                                            {/* Tem alergia? */}
                                            <div className="space-y-2" ref={el => errorRefs.current['historico_clinico.tem_alergia'] = el}>
                                                <Label>
                                                    Possui alguma alergia ou intolerância alimentar?<RequiredAsterisk />
                                                </Label>
                                                <Controller
                                                    name="historico_clinico.tem_alergia"
                                                    control={control}
                                                    render={({ field }) => (
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <SelectTrigger className={cn(errors.historico_clinico?.tem_alergia && "border-red-500")}>
                                                                <SelectValue placeholder="Selecione..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="sim">Sim</SelectItem>
                                                                <SelectItem value="nao">Não</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                                <FieldError error={errors.historico_clinico?.tem_alergia} />
                                            </div>

                                            {/* Lista de Alergias (condicional) */}
                                            {temAlergia === 'sim' && (
                                                <div className="space-y-4 pl-4 border-l-2 border-[#a9b388]">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="font-semibold">Alergias/Intolerâncias</Label>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => appendAlergia({
                                                                tipo: 'Alergia',
                                                                alimento: '',
                                                                severidade: 'leve',
                                                                sintomas: ''
                                                            })}
                                                        >
                                                            <Plus className="w-4 h-4 mr-1" />
                                                            Adicionar Alergia/Intolerância
                                                        </Button>
                                                    </div>
                                                    {alergiasFields.map((field, index) => (
                                                        <Card key={field.id} className="p-4 bg-muted/30">
                                                            <div className="space-y-3">
                                                                <div className="flex items-center justify-between">
                                                                    <h4 className="text-sm font-semibold">Item {index + 1}</h4>
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => removeAlergia(index)}
                                                                    >
                                                                        <Trash2 className="w-4 h-4 text-red-500" />
                                                                    </Button>
                                                                </div>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                    <div className="space-y-2">
                                                                        <Label htmlFor={`alergia_tipo_${index}`}>Tipo<RequiredAsterisk /></Label>
                                                                        <Controller
                                                                            name={`historico_clinico.alergias.${index}.tipo`}
                                                                            control={control}
                                                                            render={({ field }) => (
                                                                                <Select onValueChange={field.onChange} value={field.value}>
                                                                                    <SelectTrigger className={cn(errors.historico_clinico?.alergias?.[index]?.tipo && "border-red-500")}>
                                                                                        <SelectValue placeholder="Selecione..." />
                                                                                    </SelectTrigger>
                                                                                    <SelectContent>
                                                                                        <SelectItem value="Alergia">Alergia</SelectItem>
                                                                                        <SelectItem value="Intolerância">Intolerância</SelectItem>
                                                                                    </SelectContent>
                                                                                </Select>
                                                                            )}
                                                                        />
                                                                        <FieldError error={errors.historico_clinico?.alergias?.[index]?.tipo} />
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <Label htmlFor={`alergia_severidade_${index}`}>Severidade<RequiredAsterisk /></Label>
                                                                        <Controller
                                                                            name={`historico_clinico.alergias.${index}.severidade`}
                                                                            control={control}
                                                                            render={({ field }) => (
                                                                                <Select onValueChange={field.onChange} value={field.value}>
                                                                                    <SelectTrigger className={cn(errors.historico_clinico?.alergias?.[index]?.severidade && "border-red-500")}>
                                                                                        <SelectValue placeholder="Selecione..." />
                                                                                    </SelectTrigger>
                                                                                    <SelectContent>
                                                                                        <SelectItem value="leve">Leve</SelectItem>
                                                                                        <SelectItem value="moderada">Moderada</SelectItem>
                                                                                        <SelectItem value="grave">Grave</SelectItem>
                                                                                    </SelectContent>
                                                                                </Select>
                                                                            )}
                                                                        />
                                                                        <FieldError error={errors.historico_clinico?.alergias?.[index]?.severidade} />
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Label htmlFor={`alergia_alimento_${index}`}>Alimento<RequiredAsterisk /></Label>
                                                                    <Input
                                                                        id={`alergia_alimento_${index}`}
                                                                        {...register(`historico_clinico.alergias.${index}.alimento`)}
                                                                        placeholder="Ex: Lactose, Amendoim"
                                                                        className={cn(errors.historico_clinico?.alergias?.[index]?.alimento && "border-red-500")}
                                                                    />
                                                                    <FieldError error={errors.historico_clinico?.alergias?.[index]?.alimento} />
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Label htmlFor={`alergia_sintomas_${index}`}>Sintomas<RequiredAsterisk /></Label>
                                                                    <Textarea
                                                                        id={`alergia_sintomas_${index}`}
                                                                        {...register(`historico_clinico.alergias.${index}.sintomas`)}
                                                                        placeholder="Ex: Inchaço, gases, diarreia"
                                                                        rows={2}
                                                                        className={cn(errors.historico_clinico?.alergias?.[index]?.sintomas && "border-red-500")}
                                                                    />
                                                                    <FieldError error={errors.historico_clinico?.alergias?.[index]?.sintomas} />
                                                                </div>
                                                            </div>
                                                        </Card>
                                                    ))}
                                                    {alergiasFields.length === 0 && (
                                                        <p className="text-sm text-muted-foreground italic">
                                                            Clique em "Adicionar Alergia/Intolerância" para informar.
                                                        </p>
                                                    )}
                                                    <FieldError error={errors.historico_clinico?.alergias} />
                                                </div>
                                            )}

                                            {/* Outros campos opcionais */}
                                            <div className="space-y-2">
                                                <Label htmlFor="historico_cirurgias">Histórico de Cirurgias</Label>
                                                <Textarea
                                                    id="historico_cirurgias"
                                                    {...register('historico_clinico.historico_cirurgias')}
                                                    placeholder="Descreva cirurgias realizadas..."
                                                    rows={2}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="outras_condicoes">Outras Condições de Saúde</Label>
                                                <Textarea
                                                    id="outras_condicoes"
                                                    {...register('historico_clinico.outras_condicoes')}
                                                    placeholder="Outras informações relevantes..."
                                                    rows={2}
                                                />
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* SEÇÃO 3: HISTÓRICO FAMILIAR */}
                                <AccordionItem value="section-2" className="border-b">
                                    <AccordionTrigger className="hover:no-underline">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                                openSections.includes('section-2')
                                                    ? "bg-[#5f6f52] text-white"
                                                    : "bg-[#5f6f52]/10 text-[#5f6f52]"
                                            )}>
                                                3
                                            </div>
                                            <span className="font-semibold text-left">Histórico Familiar</span>
                                            {errors.historico_familiar && (
                                                <AlertCircle className="w-4 h-4 text-red-500" />
                                            )}
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-4 pb-6">
                                        <div className="space-y-4 pl-11">
                                            <p className="text-sm text-muted-foreground">
                                                Informe se há histórico de doenças na família (pais, avós, irmãos):
                                            </p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label>Diabetes</Label>
                                                    <Controller
                                                        name="historico_familiar.diabetes"
                                                        control={control}
                                                        render={({ field }) => (
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Selecione..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="sim">Sim</SelectItem>
                                                                    <SelectItem value="nao">Não</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Hipertensão</Label>
                                                    <Controller
                                                        name="historico_familiar.hipertensao"
                                                        control={control}
                                                        render={({ field }) => (
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Selecione..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="sim">Sim</SelectItem>
                                                                    <SelectItem value="nao">Não</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Obesidade</Label>
                                                    <Controller
                                                        name="historico_familiar.obesidade"
                                                        control={control}
                                                        render={({ field }) => (
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Selecione..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="sim">Sim</SelectItem>
                                                                    <SelectItem value="nao">Não</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Câncer</Label>
                                                    <Controller
                                                        name="historico_familiar.cancer"
                                                        control={control}
                                                        render={({ field }) => (
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Selecione..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="sim">Sim</SelectItem>
                                                                    <SelectItem value="nao">Não</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Doenças Cardiovasculares</Label>
                                                    <Controller
                                                        name="historico_familiar.doencas_cardiovasculares"
                                                        control={control}
                                                        render={({ field }) => (
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Selecione..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="sim">Sim</SelectItem>
                                                                    <SelectItem value="nao">Não</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="outras_doencas_familiares">Outras Doenças Familiares</Label>
                                                <Textarea
                                                    id="outras_doencas_familiares"
                                                    {...register('historico_familiar.outras_doencas_familiares')}
                                                    placeholder="Descreva outras doenças presentes na família..."
                                                    rows={2}
                                                />
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* SEÇÃO 4: HÁBITOS DE VIDA */}
                                <AccordionItem value="section-3" className="border-b">
                                    <AccordionTrigger className="hover:no-underline">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                                openSections.includes('section-3')
                                                    ? "bg-[#5f6f52] text-white"
                                                    : "bg-[#5f6f52]/10 text-[#5f6f52]"
                                            )}>
                                                4
                                            </div>
                                            <span className="font-semibold text-left">Hábitos de Vida</span>
                                            {errors.habitos_vida && (
                                                <AlertCircle className="w-4 h-4 text-red-500" />
                                            )}
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-4 pb-6">
                                        <div className="space-y-6 pl-11">
                                            {/* Pratica exercício? */}
                                            <div className="space-y-2" ref={el => errorRefs.current['habitos_vida.pratica_exercicio'] = el}>
                                                <Label>
                                                    Pratica exercício físico?<RequiredAsterisk />
                                                </Label>
                                                <Controller
                                                    name="habitos_vida.pratica_exercicio"
                                                    control={control}
                                                    render={({ field }) => (
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <SelectTrigger className={cn(errors.habitos_vida?.pratica_exercicio && "border-red-500")}>
                                                                <SelectValue placeholder="Selecione..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="sim">Sim</SelectItem>
                                                                <SelectItem value="nao">Não</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                                <FieldError error={errors.habitos_vida?.pratica_exercicio} />
                                            </div>

                                            {/* Detalhes de Exercício (condicional) */}
                                            {praticaExercicio === 'sim' && (
                                                <div className="space-y-4 pl-4 border-l-2 border-[#a9b388]">
                                                    <Label className="font-semibold">Detalhes do Exercício</Label>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="modalidade_exercicio">Modalidade(s)<RequiredAsterisk /></Label>
                                                        <p className="text-xs text-muted-foreground">Selecione uma ou mais opções:</p>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                            {['musculacao', 'corrida', 'natacao', 'ciclismo', 'yoga', 'pilates', 'caminhada', 'futebol', 'outro'].map((mod) => (
                                                                <Controller
                                                                    key={mod}
                                                                    name="habitos_vida.exercicio_detalhes.modalidade"
                                                                    control={control}
                                                                    render={({ field }) => (
                                                                        <div className="flex items-center space-x-2">
                                                                            <Checkbox
                                                                                id={`mod_${mod}`}
                                                                                checked={field.value?.includes(mod)}
                                                                                onCheckedChange={(checked) => {
                                                                                    const current = field.value || [];
                                                                                    if (checked) {
                                                                                        field.onChange([...current, mod]);
                                                                                    } else {
                                                                                        field.onChange(current.filter(v => v !== mod));
                                                                                    }
                                                                                }}
                                                                            />
                                                                            <Label htmlFor={`mod_${mod}`} className="text-sm cursor-pointer capitalize">
                                                                                {mod === 'musculacao' ? 'Musculação' : mod.charAt(0).toUpperCase() + mod.slice(1)}
                                                                            </Label>
                                                                        </div>
                                                                    )}
                                                                />
                                                            ))}
                                                        </div>
                                                        <FieldError error={errors.habitos_vida?.exercicio_detalhes?.modalidade} />
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="freq_semanal">Frequência Semanal<RequiredAsterisk /></Label>
                                                            <Input
                                                                id="freq_semanal"
                                                                {...register('habitos_vida.exercicio_detalhes.frequencia_semanal')}
                                                                placeholder="Ex: 3-4x por semana"
                                                                className={cn(errors.habitos_vida?.exercicio_detalhes?.frequencia_semanal && "border-red-500")}
                                                            />
                                                            <FieldError error={errors.habitos_vida?.exercicio_detalhes?.frequencia_semanal} />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label htmlFor="duracao_min">Duração (minutos)<RequiredAsterisk /></Label>
                                                            <Input
                                                                id="duracao_min"
                                                                {...register('habitos_vida.exercicio_detalhes.duracao_minutos')}
                                                                placeholder="Ex: 60"
                                                                className={cn(errors.habitos_vida?.exercicio_detalhes?.duracao_minutos && "border-red-500")}
                                                            />
                                                            <FieldError error={errors.habitos_vida?.exercicio_detalhes?.duracao_minutos} />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Fuma? */}
                                            <div className="space-y-2" ref={el => errorRefs.current['habitos_vida.fuma'] = el}>
                                                <Label>
                                                    Fuma?<RequiredAsterisk />
                                                </Label>
                                                <Controller
                                                    name="habitos_vida.fuma"
                                                    control={control}
                                                    render={({ field }) => (
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <SelectTrigger className={cn(errors.habitos_vida?.fuma && "border-red-500")}>
                                                                <SelectValue placeholder="Selecione..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="sim">Sim</SelectItem>
                                                                <SelectItem value="nao">Não</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                                <FieldError error={errors.habitos_vida?.fuma} />
                                            </div>

                                            {/* Detalhes de Fumo (condicional) */}
                                            {fuma === 'sim' && (
                                                <div className="space-y-4 pl-4 border-l-2 border-[#a9b388]">
                                                    <Label className="font-semibold">Detalhes do Tabagismo</Label>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="fuma_tempo">Há quanto tempo fuma?<RequiredAsterisk /></Label>
                                                            <Input
                                                                id="fuma_tempo"
                                                                {...register('habitos_vida.fuma_detalhes.ha_quanto_tempo')}
                                                                placeholder="Ex: 5 anos"
                                                                className={cn(errors.habitos_vida?.fuma_detalhes?.ha_quanto_tempo && "border-red-500")}
                                                            />
                                                            <FieldError error={errors.habitos_vida?.fuma_detalhes?.ha_quanto_tempo} />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label htmlFor="fuma_qtd">Quantidade por dia<RequiredAsterisk /></Label>
                                                            <Input
                                                                id="fuma_qtd"
                                                                {...register('habitos_vida.fuma_detalhes.quantidade_dia')}
                                                                placeholder="Ex: 10 cigarros"
                                                                className={cn(errors.habitos_vida?.fuma_detalhes?.quantidade_dia && "border-red-500")}
                                                            />
                                                            <FieldError error={errors.habitos_vida?.fuma_detalhes?.quantidade_dia} />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Já tentou parar?<RequiredAsterisk /></Label>
                                                        <Controller
                                                            name="habitos_vida.fuma_detalhes.tentou_parar"
                                                            control={control}
                                                            render={({ field }) => (
                                                                <Select onValueChange={field.onChange} value={field.value}>
                                                                    <SelectTrigger className={cn(errors.habitos_vida?.fuma_detalhes?.tentou_parar && "border-red-500")}>
                                                                        <SelectValue placeholder="Selecione..." />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="sim">Sim</SelectItem>
                                                                        <SelectItem value="nao">Não</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            )}
                                                        />
                                                        <FieldError error={errors.habitos_vida?.fuma_detalhes?.tentou_parar} />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Bebe? */}
                                            <div className="space-y-2" ref={el => errorRefs.current['habitos_vida.bebe'] = el}>
                                                <Label>
                                                    Consome bebida alcoólica?<RequiredAsterisk />
                                                </Label>
                                                <Controller
                                                    name="habitos_vida.bebe"
                                                    control={control}
                                                    render={({ field }) => (
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <SelectTrigger className={cn(errors.habitos_vida?.bebe && "border-red-500")}>
                                                                <SelectValue placeholder="Selecione..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="sim">Sim</SelectItem>
                                                                <SelectItem value="nao">Não</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                                <FieldError error={errors.habitos_vida?.bebe} />
                                            </div>

                                            {/* Detalhes de Bebida (condicional) */}
                                            {bebe === 'sim' && (
                                                <div className="space-y-4 pl-4 border-l-2 border-[#a9b388]">
                                                    <Label className="font-semibold">Detalhes do Consumo de Álcool</Label>
                                                    <div className="space-y-2">
                                                        <Label>Frequência<RequiredAsterisk /></Label>
                                                        <Controller
                                                            name="habitos_vida.bebida_detalhes.frequencia"
                                                            control={control}
                                                            render={({ field }) => (
                                                                <Select onValueChange={field.onChange} value={field.value}>
                                                                    <SelectTrigger className={cn(errors.habitos_vida?.bebida_detalhes?.frequencia && "border-red-500")}>
                                                                        <SelectValue placeholder="Selecione..." />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="diaria">Diária</SelectItem>
                                                                        <SelectItem value="semanal">Semanal</SelectItem>
                                                                        <SelectItem value="fins_semana">Fins de Semana</SelectItem>
                                                                        <SelectItem value="ocasional">Ocasional</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            )}
                                                        />
                                                        <FieldError error={errors.habitos_vida?.bebida_detalhes?.frequencia} />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Tipo de Bebida<RequiredAsterisk /></Label>
                                                        <p className="text-xs text-muted-foreground">Selecione uma ou mais opções:</p>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                            {['cerveja', 'vinho', 'destilados', 'drinks', 'outro'].map((tipo) => (
                                                                <Controller
                                                                    key={tipo}
                                                                    name="habitos_vida.bebida_detalhes.tipo_bebida"
                                                                    control={control}
                                                                    render={({ field }) => (
                                                                        <div className="flex items-center space-x-2">
                                                                            <Checkbox
                                                                                id={`tipo_${tipo}`}
                                                                                checked={field.value?.includes(tipo)}
                                                                                onCheckedChange={(checked) => {
                                                                                    const current = field.value || [];
                                                                                    if (checked) {
                                                                                        field.onChange([...current, tipo]);
                                                                                    } else {
                                                                                        field.onChange(current.filter(v => v !== tipo));
                                                                                    }
                                                                                }}
                                                                            />
                                                                            <Label htmlFor={`tipo_${tipo}`} className="text-sm cursor-pointer capitalize">
                                                                                {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                                                                            </Label>
                                                                        </div>
                                                                    )}
                                                                />
                                                            ))}
                                                        </div>
                                                        <FieldError error={errors.habitos_vida?.bebida_detalhes?.tipo_bebida} />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="qtd_dose">Quantidade por dose/ocasião<RequiredAsterisk /></Label>
                                                        <Input
                                                            id="qtd_dose"
                                                            {...register('habitos_vida.bebida_detalhes.quantidade_dose')}
                                                            placeholder="Ex: 2-3 copos"
                                                            className={cn(errors.habitos_vida?.bebida_detalhes?.quantidade_dose && "border-red-500")}
                                                        />
                                                        <FieldError error={errors.habitos_vida?.bebida_detalhes?.quantidade_dose} />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Outros hábitos de vida */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="horas_sono">Horas de Sono por Noite</Label>
                                                    <Input
                                                        id="horas_sono"
                                                        {...register('habitos_vida.horas_sono')}
                                                        placeholder="Ex: 7-8 horas"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Qualidade do Sono</Label>
                                                    <Controller
                                                        name="habitos_vida.qualidade_sono"
                                                        control={control}
                                                        render={({ field }) => (
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Selecione..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="boa">Boa</SelectItem>
                                                                    <SelectItem value="regular">Regular</SelectItem>
                                                                    <SelectItem value="ruim">Ruim</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label>Nível de Estresse</Label>
                                                    <Controller
                                                        name="habitos_vida.nivel_estresse"
                                                        control={control}
                                                        render={({ field }) => (
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Selecione..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="baixo">Baixo</SelectItem>
                                                                    <SelectItem value="moderado">Moderado</SelectItem>
                                                                    <SelectItem value="alto">Alto</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="consumo_agua">Consumo de Água (litros/dia)</Label>
                                                    <Input
                                                        id="consumo_agua"
                                                        {...register('habitos_vida.consumo_agua_litros')}
                                                        placeholder="Ex: 2"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* SEÇÃO 5: OBJETIVOS */}
                                <AccordionItem value="section-4" className="border-b">
                                    <AccordionTrigger className="hover:no-underline">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                                openSections.includes('section-4')
                                                    ? "bg-[#5f6f52] text-white"
                                                    : "bg-[#5f6f52]/10 text-[#5f6f52]"
                                            )}>
                                                5
                                            </div>
                                            <span className="font-semibold text-left">Objetivos</span>
                                            {errors.objetivos && (
                                                <AlertCircle className="w-4 h-4 text-red-500" />
                                            )}
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-4 pb-6">
                                        <div className="space-y-4 pl-11">
                                            <div className="space-y-2" ref={el => errorRefs.current['objetivos.objetivo_principal'] = el}>
                                                <Label htmlFor="objetivo_principal">
                                                    Objetivo Principal<RequiredAsterisk />
                                                </Label>
                                                <Textarea
                                                    id="objetivo_principal"
                                                    {...register('objetivos.objetivo_principal')}
                                                    placeholder="Descreva seu objetivo principal com o acompanhamento nutricional..."
                                                    rows={4}
                                                    className={cn(errors.objetivos?.objetivo_principal && "border-red-500")}
                                                />
                                                <FieldError error={errors.objetivos?.objetivo_principal} />
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="peso_atual">Peso Atual (kg)</Label>
                                                    <Input
                                                        id="peso_atual"
                                                        {...register('objetivos.peso_atual')}
                                                        placeholder="Ex: 75"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="peso_desejado">Peso Desejado (kg)</Label>
                                                    <Input
                                                        id="peso_desejado"
                                                        {...register('objetivos.peso_desejado')}
                                                        placeholder="Ex: 70"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="prazo_objetivo">Prazo</Label>
                                                    <Input
                                                        id="prazo_objetivo"
                                                        {...register('objetivos.prazo_objetivo')}
                                                        placeholder="Ex: 3 meses"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="tentativas_anteriores">Tentativas Anteriores de Emagrecimento/Dieta</Label>
                                                <Textarea
                                                    id="tentativas_anteriores"
                                                    {...register('objetivos.tentativas_anteriores')}
                                                    placeholder="Descreva se já tentou alguma dieta ou programa antes..."
                                                    rows={3}
                                                />
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* SEÇÃO 6: HÁBITOS ALIMENTARES */}
                                <AccordionItem value="section-5" className="border-b">
                                    <AccordionTrigger className="hover:no-underline">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                                openSections.includes('section-5')
                                                    ? "bg-[#5f6f52] text-white"
                                                    : "bg-[#5f6f52]/10 text-[#5f6f52]"
                                            )}>
                                                6
                                            </div>
                                            <span className="font-semibold text-left">Hábitos Alimentares</span>
                                            {errors.habitos_alimentares && (
                                                <AlertCircle className="w-4 h-4 text-red-500" />
                                            )}
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-4 pb-6">
                                        <div className="space-y-4 pl-11">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="refeicoes_dia">Número de Refeições por Dia</Label>
                                                    <Input
                                                        id="refeicoes_dia"
                                                        {...register('habitos_alimentares.refeicoes_por_dia')}
                                                        placeholder="Ex: 5"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="quem_prepara">Quem Prepara a Comida?</Label>
                                                    <Input
                                                        id="quem_prepara"
                                                        {...register('habitos_alimentares.quem_prepara_comida')}
                                                        placeholder="Ex: Eu mesmo(a)"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="alimentos_nao_gosta">Alimentos que Não Gosta</Label>
                                                <Textarea
                                                    id="alimentos_nao_gosta"
                                                    {...register('habitos_alimentares.alimentos_nao_gosta')}
                                                    placeholder="Liste os alimentos que você não gosta ou não consome..."
                                                    rows={2}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="suplementos">Suplementos que Utiliza</Label>
                                                <Textarea
                                                    id="suplementos"
                                                    {...register('habitos_alimentares.suplementos')}
                                                    placeholder="Liste os suplementos que você utiliza..."
                                                    rows={2}
                                                />
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </CardContent>
                    </Card>
                        </>
                    )}

                    {/* Botões de Ação */}
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => navigate(isCustomForm ? `/nutritionist/patients/${patientId}/anamnese` : `/nutritionist/patients/${patientId}/hub`)}
                                    disabled={saving}
                                >
                                    Cancelar
                                </Button>
                                <div className="flex gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={isCustomForm ? () => onSubmit({}, 'draft') : handleSaveDraft}
                                        disabled={saving || (isCustomForm && customFields.length === 0)}
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
                                        onClick={isCustomForm ? () => onSubmit({}, 'completed') : handleSaveCompleted}
                                        disabled={saving || (isCustomForm && customFields.length === 0)}
                                        className="gap-2"
                                    >
                                        {saving ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <FileCheck className="w-4 h-4" />
                                        )}
                                        {isCustomForm ? 'Salvar Respostas' : 'Concluir e Salvar'}
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

export default PatientAnamnesisFormV2;
