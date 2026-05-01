import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { useAnamnesisRunner } from '@/hooks/useAnamnesisRunner';
import { useAnamnesisAttachments } from '@/hooks/useAnamnesisAttachments';
import { ClinicalAlertsPanel } from '@/components/anamnesis/ClinicalAlertsPanel';
import { FileUploadField } from '@/components/anamnesis/FileUploadField';
import { exportAnamnesisAsPdf } from '@/lib/utils/exportAnamnesisAsPdf';
import { isFieldVisible } from '@/lib/utils/conditionalLogic';
import { Save, ArrowLeft, Loader2, CheckCircle, Clock, FileDown, ShieldCheck, Link2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { patientAnamnesisListRoute } from '@/lib/utils/patientRoutes';
import { useAuth } from '@/contexts/AuthContext';

export default function PatientAnamnesisForm() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user } = useAuth();
    const { paramValue, patientId } = useResolvedPatientId();
    const { anamnesisId } = useParams();

    const { useRecord, updateRecord, usePreviousProfile, generateLink } = useAnamnesisRunner(patientId);
    const { data: record, isLoading: loadingRecord } = useRecord(anamnesisId);
    const { data: previousProfile, isLoading: loadingPrev } = usePreviousProfile();
    const { uploadAttachment, deleteAttachment, getSignedUrl } = useAnamnesisAttachments(anamnesisId, patientId);

    const [content, setContent] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        if (record?.content) setContent(record.content);
    }, [record]);

    // Auto-save draft every 10s if changed
    useEffect(() => {
        if (!record || record.status === 'completed' || record.status === 'validated') return;
        const saveTimer = setTimeout(() => {
            if (JSON.stringify(content) !== JSON.stringify(record.content)) {
                handleSave('draft', true);
            }
        }, 10000);
        return () => clearTimeout(saveTimer);
    }, [content, record]);

    const handleChange = useCallback((fieldId, value) => {
        setContent(prev => ({ ...prev, [fieldId]: value }));
    }, []);

    const handleCheckboxChange = useCallback((fieldId, optionValue, checked) => {
        setContent(prev => {
            const current = Array.isArray(prev[fieldId]) ? prev[fieldId] : [];
            if (checked) return { ...prev, [fieldId]: [...current, optionValue] };
            return { ...prev, [fieldId]: current.filter(v => v !== optionValue) };
        });
    }, []);

    const usePreviousAnswer = (fieldId) => {
        if (previousProfile?.[fieldId] !== undefined) {
            handleChange(fieldId, previousProfile[fieldId]);
            toast({ description: 'Resposta anterior aplicada.', duration: 2000 });
        }
    };

    const validateFields = () => {
        const template = record?.template;
        if (!template) return true;
        for (const section of template.sections || []) {
            for (const field of section.fields || []) {
                if (field.required) {
                    const val = content[field.id];
                    if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
                        toast({ title: 'Atenção', description: `O campo "${field.label}" é obrigatório.`, variant: 'destructive' });
                        return false;
                    }
                }
            }
        }
        return true;
    };

    const handleSave = async (status = 'draft', isAutoSave = false) => {
        if (status === 'completed' && !validateFields()) return;
        const isSubmit = status === 'completed';
        if (isSubmit) setIsSubmitting(true);
        else if (!isAutoSave) setIsSaving(true);
        try {
            await updateRecord.mutateAsync({ recordId: record.id, content, status });
            if (isSubmit) navigate(patientAnamnesisListRoute({ slug: paramValue }));
        } finally {
            if (isSubmit) setIsSubmitting(false);
            else if (!isAutoSave) setIsSaving(false);
        }
    };

    // Sprint 7: PDF Export
    const handleExportPdf = async () => {
        if (!record) return;
        setIsExporting(true);
        try {
            await exportAnamnesisAsPdf({
                record,
                template: record.template,
                patientName: record.patient?.name,
                nutritionistName: user?.profile?.name,
            });
        } catch (err) {
            toast({ title: 'Erro ao gerar PDF', description: err.message, variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

    const renderField = (field) => {
        const value = content[field.id] ?? '';
        const prevValue = previousProfile?.[field.id];
        const showPrevBanner = prevValue !== undefined && JSON.stringify(prevValue) !== JSON.stringify(value);
        const currentAttachments = record?.attachments || [];

        return (
            <div key={field.id} className="space-y-2 p-4 rounded-xl bg-slate-50/60 border border-slate-100 hover:border-slate-200 transition-colors">
                <div className="flex items-start justify-between gap-4">
                    <Label className="text-[15px] font-semibold text-slate-800 leading-snug">
                        {field.label} {field.required && <span className="text-red-500">*</span>}
                    </Label>
                    {showPrevBanner && (
                        <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-1 rounded-lg text-xs shrink-0">
                            <Clock className="w-3 h-3" />
                            <span>Já respondido antes</span>
                            <button onClick={() => usePreviousAnswer(field.id)} className="font-bold hover:underline ml-1">
                                Puxar
                            </button>
                        </div>
                    )}
                </div>

                {field.type === 'text' && (
                    <Input className="bg-white" value={value} onChange={e => handleChange(field.id, e.target.value)} placeholder="Digite aqui..." />
                )}
                {field.type === 'textarea' && (
                    <Textarea className="bg-white resize-none" value={value} onChange={e => handleChange(field.id, e.target.value)} rows={3} placeholder="Descreva aqui..." />
                )}
                {field.type === 'number' && (
                    <Input className="bg-white" type="number" value={value} onChange={e => handleChange(field.id, e.target.value)} />
                )}
                {field.type === 'date' && (
                    <Input className="bg-white" type="date" value={value} onChange={e => handleChange(field.id, e.target.value)} />
                )}
                {field.type === 'select' && (
                    <Select value={value} onValueChange={v => handleChange(field.id, v)}>
                        <SelectTrigger className="bg-white"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                            {field.options?.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                {field.type === 'radio' && (
                    <RadioGroup value={value} onValueChange={v => handleChange(field.id, v)} className="space-y-2 mt-2">
                        {field.options?.map(opt => (
                            <div key={opt.value} className="flex items-center space-x-2 p-2 rounded-lg hover:bg-slate-100 transition-colors">
                                <RadioGroupItem value={opt.value} id={`radio-${field.id}-${opt.value}`} />
                                <Label htmlFor={`radio-${field.id}-${opt.value}`} className="font-normal cursor-pointer w-full">{opt.label}</Label>
                            </div>
                        ))}
                    </RadioGroup>
                )}
                {field.type === 'checkbox' && (
                    <div className="space-y-2 mt-2">
                        {field.options?.map(opt => {
                            const isChecked = Array.isArray(value) && value.includes(opt.value);
                            return (
                                <div key={opt.value} className="flex items-center space-x-2 p-2 rounded-lg hover:bg-slate-100 transition-colors">
                                    <Checkbox
                                        id={`check-${field.id}-${opt.value}`}
                                        checked={isChecked}
                                        onCheckedChange={checked => handleCheckboxChange(field.id, opt.value, checked)}
                                    />
                                    <Label htmlFor={`check-${field.id}-${opt.value}`} className="font-normal cursor-pointer w-full">{opt.label}</Label>
                                </div>
                            );
                        })}
                    </div>
                )}
                {field.type === 'scale_1_10' && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                            <button
                                key={num}
                                onClick={() => handleChange(field.id, num)}
                                className={`w-9 h-9 rounded-full text-sm font-semibold transition-all active:scale-95 ${value === num ? 'bg-[#5f6f52] text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                {num}
                            </button>
                        ))}
                        {value > 0 && (
                            <Badge variant="outline" className="ml-2 text-[#5f6f52] border-[#5f6f52]/30 bg-[#5f6f52]/5">
                                {value}/10
                            </Badge>
                        )}
                    </div>
                )}

                {/* Upload de Arquivo (FIX: URL dinâmica via getSignedUrl) */}
                {field.type === 'file' && (
                    <FileUploadField
                        fieldId={field.id}
                        fieldLabel={field.label}
                        existingAttachments={currentAttachments}
                        onUpload={({ file, fieldId: fId, fieldLabel: fLabel }) =>
                            uploadAttachment.mutate({ file, fieldId: fId, fieldLabel: fLabel })
                        }
                        onDelete={({ attachmentId, storagePath }) =>
                            deleteAttachment.mutate({ attachmentId, storagePath, currentAttachments })
                        }
                        onRequestUrl={getSignedUrl}
                        uploading={uploadAttachment.isPending}
                        disabled={record.status === 'completed' || record.status === 'validated' || record.status === 'awaiting_patient'}
                    />
                )}
            </div>
        );
    };

    if (loadingRecord || loadingPrev) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#5f6f52]" />
            </div>
        );
    }

    if (!record) {
        return <div className="text-center py-20 text-slate-500">Formulário não encontrado.</div>;
    }

    const template = record.template;
    const isReadOnly = record.status === 'completed' || record.status === 'validated';

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <Button variant="ghost" onClick={() => navigate(patientAnamnesisListRoute({ slug: paramValue }))}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar
                </Button>
                <div className="flex gap-2 flex-wrap">
                    {/* Exportar PDF (fichas concluídas) */}
                    {isReadOnly && (
                        <Button
                            variant="outline"
                            onClick={handleExportPdf}
                            disabled={isExporting}
                            className="text-slate-600"
                        >
                            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
                            Baixar PDF
                        </Button>
                    )}
                    {/* Gerar/Reenviar Link (fichas draft ou awaiting_patient) */}
                    {(record.status === 'draft' || record.status === 'awaiting_patient') && (
                        <Button
                            variant="outline"
                            onClick={() => generateLink.mutate({ recordId: record.id })}
                            disabled={generateLink.isPending}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                            {generateLink.isPending
                                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                : <Link2 className="w-4 h-4 mr-2" />
                            }
                            {record.status === 'awaiting_patient' ? 'Reenviar Link' : 'Gerar Link para Paciente'}
                        </Button>
                    )}
                    {!isReadOnly && (
                        <>
                            <Button variant="outline" onClick={() => handleSave('draft')} disabled={isSaving || isSubmitting}>
                                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                Salvar Rascunho
                            </Button>
                            <Button onClick={() => handleSave('completed')} className="bg-[#5f6f52] hover:bg-[#4a5740]" disabled={isSaving || isSubmitting}>
                                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                                Finalizar Anamnese
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Sprint 8: Painel de Alertas Clínicos */}
            <ClinicalAlertsPanel patientId={patientId} />

            {/* Form Body */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-[#fefae0]/60 to-white p-6 border-b border-slate-200">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-[#5f6f52]">{template?.title}</h1>
                            {template?.description && <p className="text-slate-500 mt-1.5 text-sm">{template.description}</p>}
                        </div>
                        {isReadOnly && (
                            <div className="flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0">
                                <ShieldCheck className="w-4 h-4" />
                                Concluída — Somente Leitura
                            </div>
                        )}
                    </div>
                </div>

                <div className={`p-6 space-y-10 ${isReadOnly ? 'opacity-70 pointer-events-none select-none' : ''}`}>
                {/* Seções e campos */}
                {template.sections?.map((section) => {
                    const visibleFields = section.fields?.filter(f => isFieldVisible(f, content)) || [];
                    if (visibleFields.length === 0) return null;

                    return (
                        <div key={section.id} className="space-y-4">
                            <h2 className="text-lg font-bold text-slate-800 pb-2 border-b-2 border-slate-200/70">
                                {section.title}
                            </h2>
                            <div className="grid gap-4">
                                {visibleFields.map((field) => renderField(field))}
                            </div>
                        </div>
                    );
                })}
                </div>
            </div>
        </div>
    );
}
