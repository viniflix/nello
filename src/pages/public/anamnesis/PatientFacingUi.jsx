import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import {
    CheckCircle, Loader2, Save, Send, AlertTriangle, Clock, Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/components/ui/use-toast';
import { FileUploadField } from '@/components/anamnesis/FileUploadField';
import { useAnamnesisAttachments } from '@/hooks/useAnamnesisAttachments';
import { AnamnesisWizard } from '@/components/anamnesis/AnamnesisWizard';
import { isFieldVisible } from '@/lib/utils/conditionalLogic';

// Tipos de erro mapeados da RPC — cada um com tela própria
const ERROR_SCREENS = {
    TOKEN_NOT_FOUND: {
        icon: AlertTriangle,
        iconClass: 'text-red-500',
        bgClass: 'bg-red-50',
        title: 'Link Inválido',
        message: 'Este link não existe ou foi removido. Solicite um novo link ao seu nutricionista.',
    },
    TOKEN_EXPIRED: {
        icon: Clock,
        iconClass: 'text-amber-500',
        bgClass: 'bg-amber-50',
        title: 'Link Expirado',
        message: 'Este link de questionário expirou. Entre em contato com seu nutricionista para receber um novo link.',
    },
    ALREADY_COMPLETED: {
        icon: CheckCircle,
        iconClass: 'text-green-600',
        bgClass: 'bg-green-50',
        title: 'Questionário Já Respondido',
        message: 'Este questionário já foi respondido anteriormente. Obrigado pela sua participação!',
    },
    GENERIC: {
        icon: AlertTriangle,
        iconClass: 'text-red-500',
        bgClass: 'bg-red-50',
        title: 'Algo deu errado',
        message: 'Ocorreu um erro inesperado. Tente novamente ou contate seu nutricionista.',
    },
};

function ErrorScreen({ errorCode, customMessage }) {
    const screen = ERROR_SCREENS[errorCode] || ERROR_SCREENS.GENERIC;
    const Icon = screen.icon;
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <Card className="max-w-md w-full shadow-xl">
                <CardContent className="pt-8 pb-8 text-center space-y-4">
                    <div className={`w-16 h-16 ${screen.bgClass} rounded-full flex items-center justify-center mx-auto`}>
                        <Icon className={`w-8 h-8 ${screen.iconClass}`} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">{screen.title}</h2>
                    <p className="text-slate-500 text-sm leading-relaxed">
                        {customMessage || screen.message}
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

export default function PatientFacingUi() {
    const { token } = useParams();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [record, setRecord] = useState(null);
    const [content, setContent] = useState({});
    const [lgpdConsented, setLgpdConsented] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorCode, setErrorCode] = useState(null);
    const [isCompleted, setIsCompleted] = useState(false);

    const { uploadAttachment, deleteAttachment, getSignedUrl } = useAnamnesisAttachments(
        record?.id,
        record?.patient_id
    );

    useEffect(() => {
        const fetchAnamnesis = async () => {
            try {
                const { data, error: rpcError } = await supabase.rpc('get_anamnesis_by_token', {
                    p_token: token,
                });
                if (rpcError) throw rpcError;
                if (!data) { setErrorCode('TOKEN_NOT_FOUND'); return; }

                // RPC retorna objeto de erro tipado
                if (data.error) {
                    setErrorCode(data.error);
                    return;
                }

                setRecord(data);
                setContent(data.content || {});
                setLgpdConsented(data.lgpd_consented || false);

                if (data.status === 'completed' || data.status === 'validated') {
                    setIsCompleted(true);
                }
            } catch (err) {
                console.error(err);
                setErrorCode('GENERIC');
            } finally {
                setLoading(false);
            }
        };

        if (token) fetchAnamnesis();
    }, [token]);

    // Auto-save draft a cada 10 segundos (só se não completado)
    useEffect(() => {
        if (!record || isCompleted) return;
        const timer = setTimeout(() => {
            if (JSON.stringify(content) !== JSON.stringify(record.content)) {
                handleSave('draft', true);
            }
        }, 10000);
        return () => clearTimeout(timer);
    }, [content, record, isCompleted]);

    const handleChange = useCallback((fieldId, value) => {
        setContent((prev) => ({ ...prev, [fieldId]: value }));
    }, []);

    const handleCheckboxChange = useCallback((fieldId, optionValue, checked) => {
        setContent((prev) => {
            const current = Array.isArray(prev[fieldId]) ? prev[fieldId] : [];
            return {
                ...prev,
                [fieldId]: checked
                    ? [...current, optionValue]
                    : current.filter((v) => v !== optionValue),
            };
        });
    }, []);

    // Validação agora é feita por seção dentro do AnamnesisWizard
    // A validação completa é mantida como fallback de segurança
    const validateFields = () => {
        const template = record?.template;
        if (!template) return true;
        for (const section of template.sections || []) {
            for (const field of section.fields || []) {
                if (field.required && isFieldVisible(field, content)) {
                    const val = content[field.id];
                    if (
                        val === undefined ||
                        val === null ||
                        val === '' ||
                        (Array.isArray(val) && val.length === 0)
                    ) {
                        toast({
                            title: 'Campo obrigatório',
                            description: `O campo "${field.label}" precisa ser preenchido.`,
                            variant: 'destructive',
                        });
                        return false;
                    }
                }
            }
        }
        if (!lgpdConsented) {
            toast({
                title: 'Autorização necessária',
                description: 'Você deve aceitar os termos de privacidade para enviar.',
                variant: 'destructive',
            });
            return false;
        }
        return true;
    };

    const handleSave = async (status = 'draft', isAutoSave = false) => {
        if (status === 'completed' && !validateFields()) return;
        if (status === 'completed') setIsSubmitting(true);
        else if (!isAutoSave) setIsSaving(true);

        try {
            // Sprint J/I: Automação das Flags Clínicas (Mobile)
            let p_clinical_flags = null;
            if (status === 'completed' && record?.template?.sections) {
                const flagUpdates = {};
                record.template.sections.forEach(section => {
                    section.fields?.forEach(field => {
                        if (field.clinical_flag_key && field.id) {
                            const answer = content?.[field.id];
                            if (answer !== undefined && answer !== null && answer !== '') {
                                flagUpdates[field.clinical_flag_key] = {
                                    value: answer,
                                    label: field.label || field.clinical_flag_key,
                                    captured_at: new Date().toISOString(),
                                    source: 'patient',
                                    record_id: record.id,
                                };
                            }
                        }
                    });
                });
                if (Object.keys(flagUpdates).length > 0) {
                    p_clinical_flags = flagUpdates;
                }
            }

            const { data, error: rpcError } = await supabase.rpc('submit_anamnesis_by_token', {
                p_token: token,
                p_content: content,
                p_status: status,
                p_lgpd_consented: lgpdConsented,
                p_ip: null,
                p_clinical_flags: p_clinical_flags
            });

            if (rpcError) throw rpcError;

            // Atualizar estado local para evitar loop de autosave
            setRecord((prev) => ({ ...prev, content, status }));

            if (status === 'completed') {
                setIsCompleted(true);
                toast({
                    title: 'Questionário enviado!',
                    description: 'Suas respostas foram enviadas ao nutricionista. Obrigado!',
                });
            } else if (!isAutoSave) {
                toast({ title: 'Progresso salvo', description: 'Você pode fechar e continuar depois.' });
            }
        } catch (err) {
            if (!isAutoSave) {
                // Detectar se o token expirou durante o preenchimento
                if (err.message?.includes('TOKEN_EXPIRED')) {
                    setErrorCode('TOKEN_EXPIRED');
                } else {
                    toast({ title: 'Erro ao salvar', description: 'Tente novamente em alguns instantes.', variant: 'destructive' });
                }
            }
        } finally {
            if (status === 'completed') setIsSubmitting(false);
            else if (!isAutoSave) setIsSaving(false);
        }
    };

    const renderField = (field) => {
        const value = content[field.id] ?? '';
        const currentAttachments = record?.attachments || [];

        return (
            <div key={field.id} className="space-y-3 p-4 rounded-xl bg-white border border-slate-100 shadow-sm">
                <Label className="text-[15px] font-semibold text-slate-800 leading-snug">
                    {field.label}{' '}
                    {field.required && <span className="text-red-500">*</span>}
                </Label>
                {field.description && (
                    <p className="text-xs text-slate-400 -mt-1">{field.description}</p>
                )}

                {field.type === 'text' && (
                    <Input className="h-12 bg-slate-50 text-[16px]" value={value}
                        onChange={(e) => handleChange(field.id, e.target.value)}
                        placeholder="Sua resposta..." />
                )}
                {field.type === 'textarea' && (
                    <Textarea className="bg-slate-50 resize-none text-[16px]" value={value}
                        onChange={(e) => handleChange(field.id, e.target.value)}
                        rows={4} placeholder="Descreva aqui..." />
                )}
                {field.type === 'number' && (
                    <Input className="h-12 bg-slate-50 text-[16px]" type="number"
                        value={value} onChange={(e) => handleChange(field.id, e.target.value)}
                        placeholder="0" />
                )}
                {field.type === 'date' && (
                    <Input className="h-12 bg-slate-50" type="date"
                        value={value} onChange={(e) => handleChange(field.id, e.target.value)} />
                )}
                {field.type === 'select' && (
                    <Select value={value} onValueChange={(v) => handleChange(field.id, v)}>
                        <SelectTrigger className="h-12 bg-slate-50">
                            <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                            {field.options?.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                {field.type === 'radio' && (
                    <RadioGroup value={value} onValueChange={(v) => handleChange(field.id, v)} className="space-y-2 mt-2">
                        {field.options?.map((opt) => (
                            <div key={opt.value}
                                className="flex items-center space-x-3 p-3.5 rounded-xl border border-slate-100 hover:bg-slate-50 hover:border-slate-200 transition-colors cursor-pointer"
                                onClick={() => handleChange(field.id, opt.value)}
                            >
                                <RadioGroupItem value={opt.value} id={`radio-${field.id}-${opt.value}`} />
                                <Label htmlFor={`radio-${field.id}-${opt.value}`}
                                    className="font-normal w-full cursor-pointer text-[15px]">{opt.label}</Label>
                            </div>
                        ))}
                    </RadioGroup>
                )}
                {field.type === 'checkbox' && (
                    <div className="space-y-2 mt-2">
                        {field.options?.map((opt) => {
                            const isChecked = Array.isArray(value) && value.includes(opt.value);
                            return (
                                <div key={opt.value}
                                    className="flex items-center space-x-3 p-3.5 rounded-xl border border-slate-100 hover:bg-slate-50 hover:border-slate-200 transition-colors cursor-pointer"
                                    onClick={() => handleCheckboxChange(field.id, opt.value, !isChecked)}
                                >
                                    <Checkbox
                                        id={`check-${field.id}-${opt.value}`}
                                        checked={isChecked}
                                        onCheckedChange={(c) => handleCheckboxChange(field.id, opt.value, c)}
                                    />
                                    <Label htmlFor={`check-${field.id}-${opt.value}`}
                                        className="font-normal w-full cursor-pointer text-[15px]">{opt.label}</Label>
                                </div>
                            );
                        })}
                    </div>
                )}
                {field.type === 'scale_1_10' && (
                    <div className="space-y-2 mt-2">
                        <div className="flex flex-wrap gap-2">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                <button
                                    key={num}
                                    onClick={() => handleChange(field.id, num)}
                                    className={`w-11 h-11 rounded-full text-sm font-bold transition-all active:scale-95 ${value === num
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                        {field.scale_labels && (
                            <div className="flex justify-between text-xs text-slate-400 px-1">
                                <span>{field.scale_labels.min || '1 = Muito ruim'}</span>
                                <span>{field.scale_labels.max || '10 = Excelente'}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Upload de arquivo — FIX: URL gerada sob demanda */}
                {field.type === 'file' && (
                    <FileUploadField
                        fieldId={field.id}
                        fieldLabel={field.label}
                        existingAttachments={currentAttachments}
                        onUpload={({ file, fieldId: fId, fieldLabel: fLabel }) =>
                            uploadAttachment.mutate({ file, fieldId: fId, fieldLabel: fLabel })
                        }
                        onDelete={({ attachmentId, storagePath }) =>
                            deleteAttachment.mutate({
                                attachmentId,
                                storagePath,
                                currentAttachments,
                            })
                        }
                        onRequestUrl={getSignedUrl}
                        uploading={uploadAttachment.isPending}
                        disabled={false}
                    />
                )}
            </div>
        );
    };

    // ── Estados de carregamento/erro ────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-slate-400">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                    <p className="text-sm font-medium animate-pulse">Carregando questionário...</p>
                </div>
            </div>
        );
    }

    if (errorCode) return <ErrorScreen errorCode={errorCode} />;

    if (isCompleted) return <ErrorScreen errorCode="ALREADY_COMPLETED" />;

    if (!record) return <ErrorScreen errorCode="TOKEN_NOT_FOUND" />;

    const template = record.template;

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-28">
            {/* Header fixo */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div>
                        <span className="text-xs font-bold text-blue-600 tracking-widest uppercase block">
                            Questionário de Saúde
                        </span>
                        <span className="text-sm text-slate-500">{record.nutritionist_name}</span>
                    </div>
                    <Lock className="w-4 h-4 text-slate-300" title="Suas respostas são protegidas" />
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
                {/* Título do formulário */}
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{template.title}</h1>
                    {template.description && (
                        <p className="text-slate-500 text-sm max-w-lg mx-auto leading-relaxed">
                            {template.description}
                        </p>
                    )}
                </div>

                {/* Formulário Paginado (Wizard Mode) */}
                <AnamnesisWizard
                    recordId={record.id}
                    template={template}
                    content={content}
                    renderField={renderField}
                    lgpdConsented={lgpdConsented}
                    setLgpdConsented={setLgpdConsented}
                    onSaveDraft={() => handleSave('draft')}
                    onSubmit={() => handleSave('completed')}
                    isSaving={isSaving}
                    isSubmitting={isSubmitting}
                    nutritionistName={record.nutritionist_name}
                />
            </div>
        </div>
    );
}
