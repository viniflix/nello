import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Trash2, GripVertical, Settings2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAnamnesisTemplates } from '@/hooks/useAnamnesisTemplates';
import { useToast } from '@/components/ui/use-toast';

const FIELD_TYPES = [
  { value: 'text', label: 'Texto Curto' },
  { value: 'textarea', label: 'Texto Longo' },
  { value: 'number', label: 'Número' },
  { value: 'select', label: 'Lista de Seleção' },
  { value: 'radio', label: 'Múltipla Escolha (Única)' },
  { value: 'checkbox', label: 'Caixas de Seleção (Múltipla)' },
  { value: 'scale_1_10', label: 'Escala (1 a 10)' },
  { value: 'date', label: 'Data' }
];

export default function TemplateBuilder() {
    const navigate = useNavigate();
    const { templateId } = useParams();
    const { toast } = useToast();
    const { getTemplate, createTemplate, updateTemplate } = useAnamnesisTemplates();

    const [isLoading, setIsLoading] = useState(!!templateId);
    const [isSaving, setIsSaving] = useState(false);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [sections, setSections] = useState([]);

    // Field Editor State
    const [activeSectionId, setActiveSectionId] = useState(null);
    const [activeFieldId, setActiveFieldId] = useState(null);

    useEffect(() => {
        if (templateId) {
            getTemplate(templateId).then(data => {
                setTitle(data.title);
                setDescription(data.description || '');
                setSections(data.sections || []);
                setIsLoading(false);
                if (data.sections?.length > 0) setActiveSectionId(data.sections[0].id);
            }).catch(err => {
                toast({ title: 'Erro', description: 'Template não encontrado', variant: 'destructive' });
                navigate('/nutritionist/tools/protocols?group=forms&ftab=forms');
            });
        } else {
            // New Template defaults
            const newId = crypto.randomUUID();
            setSections([{ id: newId, title: 'Nova Seção', fields: [] }]);
            setActiveSectionId(newId);
        }
    }, [templateId, getTemplate, navigate, toast]);

    const handleSave = async () => {
        if (!title.trim()) {
            toast({ title: 'Erro', description: 'Dê um nome ao formulário.', variant: 'destructive' });
            return;
        }
        setIsSaving(true);
        try {
            if (templateId) {
                await updateTemplate.mutateAsync({ id: templateId, title, description, sections });
            } else {
                await createTemplate.mutateAsync({ title, description, sections });
                navigate('/nutritionist/tools/protocols?group=forms&ftab=forms');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const addSection = () => {
        const newId = crypto.randomUUID();
        setSections([...sections, { id: newId, title: 'Nova Seção', fields: [] }]);
        setActiveSectionId(newId);
    };

    const addField = (sectionId) => {
        const newField = {
            id: crypto.randomUUID(),
            type: 'text',
            label: 'Nova Pergunta',
            required: false,
            options: []
        };
        setSections(sections.map(s => {
            if (s.id === sectionId) return { ...s, fields: [...s.fields, newField] };
            return s;
        }));
        setActiveFieldId(newField.id);
        setActiveSectionId(sectionId);
    };

    const updateSection = (id, updates) => {
        setSections(sections.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    const deleteSection = (id) => {
        setSections(sections.filter(s => s.id !== id));
        if (activeSectionId === id) setActiveSectionId(null);
    };

    const updateField = (sectionId, fieldId, updates) => {
        setSections(sections.map(s => {
            if (s.id === sectionId) {
                return { ...s, fields: s.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f) };
            }
            return s;
        }));
    };

    const deleteField = (sectionId, fieldId) => {
        setSections(sections.map(s => {
            if (s.id === sectionId) return { ...s, fields: s.fields.filter(f => f.id !== fieldId) };
            return s;
        }));
        if (activeFieldId === fieldId) setActiveFieldId(null);
    };

    const moveField = (sectionId, fieldIndex, direction) => {
        setSections(sections.map(s => {
            if (s.id === sectionId) {
                const newFields = [...s.fields];
                if (direction === 'up' && fieldIndex > 0) {
                    [newFields[fieldIndex - 1], newFields[fieldIndex]] = [newFields[fieldIndex], newFields[fieldIndex - 1]];
                } else if (direction === 'down' && fieldIndex < newFields.length - 1) {
                    [newFields[fieldIndex + 1], newFields[fieldIndex]] = [newFields[fieldIndex], newFields[fieldIndex + 1]];
                }
                return { ...s, fields: newFields };
            }
            return s;
        }));
    };

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    const activeFieldData = activeFieldId 
        ? sections.find(s => s.id === activeSectionId)?.fields.find(f => f.id === activeFieldId)
        : null;

    const allFields = sections.flatMap(s => s.fields);
    // Fields available for conditional logic (exclude self)
    const availableConditionFields = allFields.filter(f => f.id !== activeFieldId && f.label);

    return (
        <div className="container mx-auto p-4 sm:p-6 max-w-[1400px] min-h-[calc(100vh-80px)] lg:h-[calc(100vh-80px)] flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Voltar
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">{templateId ? 'Editar' : 'Novo'} Formulário</h1>
                    </div>
                </div>
                <Button className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Salvar Template
                </Button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0 pb-6 lg:pb-0">
                {/* Center Panel - Builder Canvas */}
                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-w-0 h-[60vh] lg:h-auto">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl shrink-0">
                        <Input 
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Nome do Formulário (Ex: Anamnese Adulto)"
                            className="text-lg font-bold border-none bg-transparent shadow-none px-0 focus-visible:ring-0"
                        />
                        <Input 
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Descrição opcional..."
                            className="text-sm text-slate-500 border-none bg-transparent shadow-none px-0 focus-visible:ring-0 h-8"
                        />
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
                        {sections.map((section, sIdx) => (
                            <div 
                                key={section.id} 
                                className={`bg-white rounded-lg border ${activeSectionId === section.id ? 'border-blue-400 ring-1 ring-blue-400' : 'border-slate-200'} transition-all`}
                                onClick={() => setActiveSectionId(section.id)}
                            >
                                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-lg">
                                    <div className="flex-1 flex items-center gap-2">
                                        <GripVertical className="w-4 h-4 text-slate-300 cursor-move" />
                                        <Input 
                                            value={section.title}
                                            onChange={e => updateSection(section.id, { title: e.target.value })}
                                            className="font-semibold border-none bg-transparent h-8 focus-visible:ring-1"
                                            placeholder="Nome da Seção"
                                        />
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); deleteSection(section.id); }} className="text-slate-400 hover:text-red-500">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                                <div className="p-4 space-y-3">
                                    {section.fields.map((field, fIdx) => (
                                        <div 
                                            key={field.id}
                                            onClick={(e) => { e.stopPropagation(); setActiveFieldId(field.id); setActiveSectionId(section.id); }}
                                            className={`relative group p-3 rounded-md border ${activeFieldId === field.id ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200 bg-white hover:border-blue-300'} cursor-pointer flex gap-3`}
                                        >
                                            <div className="flex flex-col gap-1 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={(e) => { e.stopPropagation(); moveField(section.id, fIdx, 'up'); }} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={fIdx === 0}>
                                                    <ChevronUp className="w-4 h-4" />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); moveField(section.id, fIdx, 'down'); }} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={fIdx === section.fields.length - 1}>
                                                    <ChevronDown className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-sm text-slate-800">{field.label || 'Pergunta sem título'}</span>
                                                    {field.required && <span className="text-[10px] text-red-500 font-bold">*</span>}
                                                </div>
                                                <span className="text-xs text-slate-400 px-2 py-0.5 bg-slate-100 rounded-md">
                                                    {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                                                </span>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); deleteField(section.id, field.id); }} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-2">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    
                                    <Button variant="outline" size="sm" className="w-full mt-2 border-dashed text-slate-500" onClick={(e) => { e.stopPropagation(); addField(section.id); }}>
                                        <Plus className="w-4 h-4 mr-2" /> Adicionar Pergunta
                                    </Button>
                                </div>
                            </div>
                        ))}

                        <Button variant="outline" className="w-full border-dashed bg-white text-blue-600 border-blue-200 hover:bg-blue-50" onClick={addSection}>
                            <Plus className="w-4 h-4 mr-2" /> Adicionar Seção
                        </Button>
                    </div>
                </div>

                {/* Right Panel - Properties */}
                <div className="w-full lg:w-[320px] bg-white rounded-xl border border-slate-200 shadow-sm shrink-0 flex flex-col h-[50vh] lg:h-auto mt-4 lg:mt-0">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/80 rounded-t-xl flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-slate-600" />
                        <h3 className="font-semibold text-slate-800">Propriedades</h3>
                    </div>
                    <div className="p-5 flex-1 overflow-y-auto space-y-6">
                        {!activeFieldData ? (
                            <div className="text-center text-slate-400 text-sm mt-10">
                                Clique em uma pergunta para editar suas configurações.
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label>Tipo da Pergunta</Label>
                                    <Select 
                                        value={activeFieldData.type} 
                                        onValueChange={(val) => updateField(activeSectionId, activeFieldId, { type: val })}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {FIELD_TYPES.map(type => (
                                                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Título / Pergunta</Label>
                                    <Textarea 
                                        value={activeFieldData.label} 
                                        onChange={(e) => updateField(activeSectionId, activeFieldId, { label: e.target.value })}
                                        rows={3}
                                    />
                                </div>

                                {['select', 'radio', 'checkbox'].includes(activeFieldData.type) && (
                                    <div className="space-y-3 pt-2 border-t border-slate-100">
                                        <Label>Opções de Resposta</Label>
                                        {(activeFieldData.options || []).map((opt, oIdx) => (
                                            <div key={oIdx} className="flex gap-2 items-center">
                                                <Input 
                                                    value={opt.label}
                                                    onChange={e => {
                                                        const newOpts = [...activeFieldData.options];
                                                        newOpts[oIdx] = { label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, '_') };
                                                        updateField(activeSectionId, activeFieldId, { options: newOpts });
                                                    }}
                                                    placeholder={`Opção ${oIdx + 1}`}
                                                    className="h-8 text-sm"
                                                />
                                                <button 
                                                    onClick={() => {
                                                        const newOpts = activeFieldData.options.filter((_, i) => i !== oIdx);
                                                        updateField(activeSectionId, activeFieldId, { options: newOpts });
                                                    }}
                                                    className="text-slate-400 hover:text-red-500"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        <Button 
                                            variant="secondary" 
                                            size="sm" 
                                            className="w-full text-xs"
                                            onClick={() => {
                                                const newOpts = [...(activeFieldData.options || []), { label: '', value: '' }];
                                                updateField(activeSectionId, activeFieldId, { options: newOpts });
                                            }}
                                        >
                                            <Plus className="w-3 h-3 mr-1" /> Adicionar Opção
                                        </Button>
                                    </div>
                                )}

                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                    <Label className="cursor-pointer" htmlFor="req-switch">Obrigatória?</Label>
                                    <Switch 
                                        id="req-switch"
                                        checked={activeFieldData.required} 
                                        onCheckedChange={(checked) => updateField(activeSectionId, activeFieldId, { required: checked })}
                                    />
                                </div>

                                {/* Sprint C: Lógica Condicional */}
                                <div className="pt-4 border-t border-slate-100 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="cursor-pointer" htmlFor="cond-switch">Lógica Condicional</Label>
                                        <Switch 
                                            id="cond-switch"
                                            checked={!!activeFieldData.conditional_logic} 
                                            onCheckedChange={(checked) => {
                                                if (checked) {
                                                    updateField(activeSectionId, activeFieldId, { 
                                                        conditional_logic: { field_id: '', operator: 'equals', value: '' } 
                                                    });
                                                } else {
                                                    const { conditional_logic, ...rest } = activeFieldData;
                                                    updateField(activeSectionId, activeFieldId, { conditional_logic: null });
                                                }
                                            }}
                                        />
                                    </div>

                                    {activeFieldData.conditional_logic && (
                                        <div className="space-y-3 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                                            <div className="space-y-1">
                                                <Label className="text-xs text-slate-500">Mostrar este campo quando:</Label>
                                                <Select 
                                                    value={activeFieldData.conditional_logic.field_id}
                                                    onValueChange={(val) => updateField(activeSectionId, activeFieldId, { 
                                                        conditional_logic: { ...activeFieldData.conditional_logic, field_id: val } 
                                                    })}
                                                >
                                                    <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="Selecione o campo..." /></SelectTrigger>
                                                    <SelectContent>
                                                        {availableConditionFields.map(f => (
                                                            <SelectItem key={f.id} value={f.id}>{f.label || 'Sem título'}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            
                                            <div className="flex gap-2">
                                                <Select 
                                                    value={activeFieldData.conditional_logic.operator}
                                                    onValueChange={(val) => updateField(activeSectionId, activeFieldId, { 
                                                        conditional_logic: { ...activeFieldData.conditional_logic, operator: val } 
                                                    })}
                                                >
                                                    <SelectTrigger className="h-8 text-xs bg-white w-[120px]"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="equals">For igual a</SelectItem>
                                                        <SelectItem value="not_equals">For diferente de</SelectItem>
                                                        <SelectItem value="contains">Contiver</SelectItem>
                                                        <SelectItem value="greater_than">Maior que</SelectItem>
                                                        <SelectItem value="less_than">Menor que</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                
                                                <Input 
                                                    value={activeFieldData.conditional_logic.value}
                                                    onChange={(e) => updateField(activeSectionId, activeFieldId, { 
                                                        conditional_logic: { ...activeFieldData.conditional_logic, value: e.target.value } 
                                                    })}
                                                    placeholder="Valor esperado"
                                                    className="h-8 text-xs flex-1"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Sprint I: Chave Clínica */}
                                <div className="pt-4 border-t border-slate-100 space-y-3">
                                    <div className="space-y-1">
                                        <Label className="flex items-center gap-1.5 text-sm font-medium">
                                            🏷️ Chave Clínica
                                        </Label>
                                        <p className="text-[11px] text-slate-400 leading-snug">
                                            Se preenchida, a resposta será salva como flag clínica no perfil do paciente automaticamente.
                                        </p>
                                    </div>
                                    <Input
                                        value={activeFieldData.clinical_flag_key || ''}
                                        onChange={(e) => updateField(activeSectionId, activeFieldId, {
                                            clinical_flag_key: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
                                        })}
                                        placeholder="ex: alergia_lactose, nivel_atividade"
                                        className="h-8 text-xs font-mono"
                                    />
                                    {activeFieldData.clinical_flag_key && (
                                        <div className="flex items-start gap-2 p-2 rounded-lg bg-green-50 border border-green-100">
                                            <span className="text-green-600 text-xs mt-0.5">✓</span>
                                            <p className="text-[11px] text-green-700">
                                                A resposta será salva como <code className="bg-green-100 px-1 rounded font-mono">{activeFieldData.clinical_flag_key}</code> nas flags clínicas do paciente.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
