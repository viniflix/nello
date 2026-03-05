import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Plus, Edit2, Trash2, Eye, Send, ToggleLeft, ToggleRight,
    MessageSquare, Loader2, AlertCircle, Search, Copy, CheckCircle2, Clock, HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from '@/components/ui/collapsible';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
    getMessageTemplates,
    createMessageTemplate,
    updateMessageTemplate,
    deleteMessageTemplate,
    toggleMessageTemplate,
    copyDefaultTemplate,
    previewTemplate,
    validateTemplatePlaceholders,
    TEMPLATE_CONTEXTS,
    TEMPLATE_CHANNELS,
    AVAILABLE_VARIABLES
} from '@/lib/supabase/message-templates-queries';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const EMPTY_FORM = {
    name: '',
    template_key: '',
    context: 'general',
    channel: 'in_app',
    title_template: '',
    body_template: '',
};

const generateKey = (name) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

const MessageTemplatesPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { toast } = useToast();

    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterContext, setFilterContext] = useState('all');

    // Dialog state
    const [formOpen, setFormOpen] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [editTarget, setEditTarget] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [formErrors, setFormErrors] = useState({});
    const [previewResult, setPreviewResult] = useState({ title: '', body: '' });
    const [howItWorksOpen, setHowItWorksOpen] = useState(false);
    const [duplicatingId, setDuplicatingId] = useState(null);

    const loadTemplates = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const { data } = await getMessageTemplates({ nutritionistId: user.id, limit: 100 });
            setTemplates(data || []);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => { loadTemplates(); }, [loadTemplates]);

    const openCreate = () => {
        setEditTarget(null);
        setForm(EMPTY_FORM);
        setFormErrors({});
        setFormOpen(true);
    };

    const openEdit = (tpl) => {
        setEditTarget(tpl);
        setForm({
            name:           tpl.name,
            template_key:   tpl.template_key,
            context:        tpl.context,
            channel:        tpl.channel,
            title_template: tpl.title_template || '',
            body_template:  tpl.body_template,
        });
        setFormErrors({});
        setFormOpen(true);
    };

    const openPreview = (tpl) => {
        const result = previewTemplate({
            titleTemplate: tpl.title_template || '',
            bodyTemplate:  tpl.body_template
        });
        setPreviewResult(result);
        setPreviewOpen(true);
    };

    const handleDuplicateDefault = async (tpl) => {
        if (tpl.nutritionist_id != null || !user?.id) return;
        setDuplicatingId(tpl.id);
        try {
            const { data, error } = await copyDefaultTemplate({
                defaultTemplateId: tpl.id,
                nutritionistId:   user.id
            });
            if (error) {
                toast({ title: 'Erro ao duplicar', description: error.message, variant: 'destructive' });
                return;
            }
            toast({ title: 'Cópia criada', description: 'Edite sua versão do modelo quando quiser.' });
            await loadTemplates();
            if (data) openEdit(data);
        } finally {
            setDuplicatingId(null);
        }
    };

    const handleFormChange = (field, value) => {
        setForm(prev => {
            const next = { ...prev, [field]: value };
            if (field === 'name' && !editTarget) {
                next.template_key = generateKey(value);
            }
            return next;
        });
        setFormErrors(prev => ({ ...prev, [field]: undefined }));
    };

    const validateForm = () => {
        const errors = {};
        if (!form.name.trim())         errors.name         = 'Nome é obrigatório';
        if (!form.template_key.trim()) errors.template_key = 'Chave é obrigatória';
        if (!form.body_template.trim()) errors.body_template = 'Corpo do template é obrigatório';

        const { valid, unknownPlaceholders } = validateTemplatePlaceholders(
            form.body_template, form.title_template
        );
        if (!valid) {
            errors.body_template = `Placeholders inválidos: ${unknownPlaceholders.join(', ')}`;
        }
        return errors;
    };

    const handleSave = async () => {
        const errors = validateForm();
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }
        setSaving(true);
        try {
            if (editTarget) {
                const { error } = await updateMessageTemplate({
                    templateId:     editTarget.id,
                    nutritionistId: user.id,
                    patch: {
                        name:           form.name.trim(),
                        context:        form.context,
                        channel:        form.channel,
                        title_template: form.title_template.trim() || null,
                        body_template:  form.body_template.trim(),
                    }
                });
                if (error) throw error;
                toast({ title: 'Template atualizado com sucesso' });
            } else {
                const { error } = await createMessageTemplate({
                    nutritionistId: user.id,
                    templateKey:    form.template_key.trim(),
                    name:           form.name.trim(),
                    context:        form.context,
                    channel:        form.channel,
                    titleTemplate:  form.title_template.trim() || null,
                    bodyTemplate:   form.body_template.trim(),
                });
                if (error) throw error;
                toast({ title: 'Template criado com sucesso' });
            }
            setFormOpen(false);
            loadTemplates();
        } catch (err) {
            toast({ title: 'Erro ao salvar template', description: err.message, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (tpl) => {
        const { error } = await toggleMessageTemplate({
            templateId:     tpl.id,
            nutritionistId: user.id,
            isActive:       !tpl.is_active
        });
        if (error) {
            toast({ title: 'Erro ao alterar status', variant: 'destructive' });
        } else {
            loadTemplates();
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        const { error } = await deleteMessageTemplate({
            templateId:     deleteTarget.id,
            nutritionistId: user.id
        });
        if (error) {
            toast({ title: 'Erro ao excluir template', variant: 'destructive' });
        } else {
            toast({ title: 'Template excluído' });
            loadTemplates();
        }
        setDeleteTarget(null);
    };

    const copyVariable = (v) => {
        navigator.clipboard?.writeText(v).then(() => {
            toast({ title: `Copiado: ${v}`, duration: 1500 });
        });
    };

    const filtered = templates.filter(t => {
        const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
        const matchCtx    = filterContext === 'all' || t.context === filterContext;
        return matchSearch && matchCtx;
    });

    const contextLabel = (ctx) => TEMPLATE_CONTEXTS.find(c => c.value === ctx)?.label || ctx;
    const channelLabel = (ch)  => TEMPLATE_CHANNELS.find(c => c.value === ch)?.label  || ch;

    return (
        <div className="min-h-screen bg-background overflow-x-hidden">
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 min-w-0">
                <div className="flex items-center justify-between gap-4 mb-6 min-w-0">
                    <div className="flex items-center gap-2 md:gap-4 min-w-0">
                        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div className="min-w-0">
                            <h1 className="text-2xl md:text-3xl font-bold break-words flex items-center gap-2">
                                <MessageSquare className="w-7 h-7 text-[#5f6f52] shrink-0" />
                                Modelos de mensagem
                            </h1>
                            <p className="text-muted-foreground text-sm md:text-base truncate">
                                Crie e gerencie mensagens prontas para enviar aos pacientes
                            </p>
                        </div>
                    </div>
                    <Button onClick={openCreate} size="sm" className="gap-2 shrink-0 bg-[#5f6f52] hover:bg-[#4a5a3e]">
                        <Plus className="h-4 w-4" />
                        Novo modelo
                    </Button>
                </div>

                {/* Como funciona? */}
                <Collapsible open={howItWorksOpen} onOpenChange={setHowItWorksOpen} className="mb-6">
                    <Card className="border-[#5f6f52]/30">
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground p-4 h-auto">
                                <HelpCircle className="w-5 h-5 shrink-0 text-[#5f6f52]" />
                                <span className="font-medium">Como funciona?</span>
                            </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <CardContent className="pt-0 space-y-4 text-sm text-muted-foreground">
                                <div>
                                    <p className="font-medium text-foreground mb-1">Para que serve</p>
                                    <p className="mb-2">Os modelos de mensagem permitem enviar recados padronizados aos pacientes sem precisar digitar tudo toda vez. Você cria o texto uma vez e reutiliza quando quiser.</p>
                                    <ul className="list-disc list-inside space-y-1 pl-1">
                                        <li>Lembretes (consulta, preencher diário, tomar suplemento)</li>
                                        <li>Parabéns quando o paciente atinge uma meta</li>
                                        <li>Recado após a consulta ou quando o plano alimentar é atualizado</li>
                                        <li>Alertas (ex.: resultado de exame que precisa de atenção)</li>
                                    </ul>
                                </div>
                                <div>
                                    <p className="font-medium text-foreground mb-1">Como usar</p>
                                    <ul className="list-disc list-inside space-y-1 pl-1">
                                        <li><strong>Nesta tela</strong> você cria e edita os modelos. Cada modelo tem um nome, um contexto (ex.: “Lembrete de consulta”) e o texto da mensagem.</li>
                                        <li>No <strong>hub do paciente</strong>, na aba Adesão, há um bloco “Enviar mensagem ao paciente”. Lá você escolhe qual modelo enviar para aquele paciente e clica em enviar.</li>
                                        <li>No texto do modelo você pode usar <strong>expressões que são trocadas automaticamente</strong>: por exemplo, o nome do paciente, a data de hoje, a meta atual e o progresso. Ao criar o modelo, use os botões “Clique para copiar” e cole no texto onde quiser que a informação apareça.</li>
                                    </ul>
                                </div>
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>

                <div className="space-y-4">
                {/* Filters */}
                <div className="flex gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar templates..."
                            className="pl-9"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <Select value={filterContext} onValueChange={setFilterContext}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Contexto" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os contextos</SelectItem>
                            {TEMPLATE_CONTEXTS.map(c => (
                                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Empty */}
                {!loading && filtered.length === 0 && (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
                            <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
                            <div>
                                <p className="font-medium text-muted-foreground">
                                    {templates.length === 0 ? 'Nenhum template criado' : 'Nenhum resultado'}
                                </p>
                                <p className="text-sm text-muted-foreground/70 mt-1">
                                    {templates.length === 0
                                        ? 'Crie templates para agilizar a comunicação com pacientes.'
                                        : 'Tente outros filtros.'}
                                </p>
                            </div>
                            {templates.length === 0 && (
                                <Button size="sm" onClick={openCreate} className="gap-2 mt-2">
                                    <Plus className="h-4 w-4" /> Criar primeiro template
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                )}

                {/* Template list */}
                {!loading && filtered.length > 0 && (
                    <div className="grid gap-3">
                        {filtered.map(tpl => {
                            const isDefault = tpl.nutritionist_id == null;
                            return (
                                <Card key={`${tpl.nutritionist_id ?? 'default'}-${tpl.id}`} className={cn('transition-all', !tpl.is_active && !isDefault && 'opacity-60')}>
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                    <span className="font-medium truncate">{tpl.name}</span>
                                                    {isDefault && (
                                                        <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                                                            Padrão
                                                        </Badge>
                                                    )}
                                                    {!isDefault && (
                                                        <Badge variant={tpl.is_active ? 'default' : 'secondary'} className="text-xs">
                                                            {tpl.is_active ? 'Ativo' : 'Inativo'}
                                                        </Badge>
                                                    )}
                                                    <Badge variant="outline" className="text-xs">
                                                        {contextLabel(tpl.context)}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-xs">
                                                        {channelLabel(tpl.channel)}
                                                    </Badge>
                                                </div>
                                                {tpl.title_template && (
                                                    <p className="text-sm font-medium text-muted-foreground mb-1">
                                                        Título: {tpl.title_template}
                                                    </p>
                                                )}
                                                <p className="text-sm text-muted-foreground line-clamp-2">
                                                    {tpl.body_template}
                                                </p>
                                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground/70">
                                                    <span className="flex items-center gap-1">
                                                        <Send className="h-3 w-3" />
                                                        {tpl.use_count} disparos
                                                    </span>
                                                    {tpl.last_used_at && (
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            Último: {format(new Date(tpl.last_used_at), 'dd/MM/yy', { locale: ptBR })}
                                                        </span>
                                                    )}
                                                    {!isDefault && (
                                                        <span className="font-mono text-xs opacity-60">{tpl.template_key}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <Button
                                                    variant="ghost" size="icon" className="h-8 w-8"
                                                    onClick={() => openPreview(tpl)} title="Pré-visualizar"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                                {isDefault ? (
                                                    <Button
                                                        variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"
                                                        onClick={() => handleDuplicateDefault(tpl)}
                                                        disabled={duplicatingId === tpl.id}
                                                        title="Criar uma cópia editável (só para você)"
                                                    >
                                                        {duplicatingId === tpl.id ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Copy className="h-4 w-4" />
                                                        )}
                                                        Duplicar e editar
                                                    </Button>
                                                ) : (
                                                    <>
                                                        <Button
                                                            variant="ghost" size="icon" className="h-8 w-8"
                                                            onClick={() => openEdit(tpl)} title="Editar"
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost" size="icon" className="h-8 w-8"
                                                            onClick={() => handleToggle(tpl)}
                                                            title={tpl.is_active ? 'Desativar' : 'Ativar'}
                                                        >
                                                            {tpl.is_active
                                                                ? <ToggleRight className="h-4 w-4 text-primary" />
                                                                : <ToggleLeft  className="h-4 w-4 text-muted-foreground" />}
                                                        </Button>
                                                        <Button
                                                            variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                                                            onClick={() => setDeleteTarget(tpl)} title="Excluir"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
                </div>
            </main>

            {/* Create / Edit Dialog */}
            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editTarget ? 'Editar modelo' : 'Novo modelo de mensagem'}</DialogTitle>
                        <DialogDescription>
                            Crie um texto que você poderá reutilizar para enviar aos pacientes. No corpo da mensagem você pode usar expressões que são trocadas automaticamente (nome do paciente, data, meta, etc.) — veja a lista abaixo e clique para copiar.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Name */}
                        <div className="space-y-1">
                            <Label>Nome do modelo <span className="text-destructive">*</span></Label>
                            <Input
                                placeholder="Ex: Lembrete de consulta"
                                value={form.name}
                                onChange={e => handleFormChange('name', e.target.value)}
                                className={cn(formErrors.name && 'border-destructive')}
                            />
                            <p className="text-xs text-muted-foreground">Um nome interno para você identificar este modelo na lista.</p>
                            {formErrors.name && (
                                <p className="text-xs text-destructive">{formErrors.name}</p>
                            )}
                        </div>

                        {/* Key (read-only in edit) */}
                        <div className="space-y-1">
                            <Label>Chave identificadora (técnica)</Label>
                            <Input
                                placeholder="gerado_automaticamente"
                                value={form.template_key}
                                onChange={e => handleFormChange('template_key', e.target.value)}
                                disabled={Boolean(editTarget)}
                                className={cn(
                                    'font-mono text-sm',
                                    formErrors.template_key && 'border-destructive',
                                    editTarget && 'bg-muted'
                                )}
                            />
                            {formErrors.template_key && (
                                <p className="text-xs text-destructive">{formErrors.template_key}</p>
                            )}
                        </div>

                        {/* Context + Channel */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>Contexto</Label>
                                <Select value={form.context} onValueChange={v => handleFormChange('context', v)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TEMPLATE_CONTEXTS.map(c => (
                                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">Em qual situação esta mensagem será usada (ex.: lembrete, parabéns por meta).</p>
                            </div>
                            <div className="space-y-1">
                                <Label>Canal</Label>
                                <Select value={form.channel} onValueChange={v => handleFormChange('channel', v)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TEMPLATE_CHANNELS.map(c => (
                                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">Onde o paciente receberá (por enquanto: no app).</p>
                            </div>
                        </div>

                        {/* Title */}
                        <div className="space-y-1">
                            <Label>Título da mensagem (opcional)</Label>
                            <Input
                                placeholder="Ex: Olá! Lembrete importante"
                                value={form.title_template}
                                onChange={e => handleFormChange('title_template', e.target.value)}
                            />
                        </div>

                        {/* Body */}
                        <div className="space-y-1">
                            <Label>Texto da mensagem <span className="text-destructive">*</span></Label>
                            <p className="text-xs text-muted-foreground">Escreva o recado. Onde quiser que apareça o nome do paciente, a data de hoje ou a meta, use uma das expressões da caixa abaixo (clique para copiar e cole no texto).</p>
                            <Textarea
                                placeholder="Ex: Olá! Lembrete da sua consulta na próxima semana. Qualquer dúvida, entre em contato."
                                rows={5}
                                value={form.body_template}
                                onChange={e => handleFormChange('body_template', e.target.value)}
                                className={cn(formErrors.body_template && 'border-destructive')}
                            />
                            {formErrors.body_template && (
                                <p className="text-xs text-destructive">{formErrors.body_template}</p>
                            )}
                        </div>

                        {/* Variable chips */}
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                            <p className="text-sm font-medium text-foreground">
                                Expressões que podem ser trocadas automaticamente
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Clique em uma expressão para copiar e cole no texto da mensagem. Na hora do envio, o sistema substitui pelo dado real do paciente.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {AVAILABLE_VARIABLES.map(v => (
                                    <button
                                        key={v.key}
                                        type="button"
                                        onClick={() => copyVariable(v.key)}
                                        className="text-xs font-mono bg-muted hover:bg-accent px-2 py-1 rounded border border-border transition-colors"
                                        title={v.description}
                                    >
                                        {v.key}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Live preview */}
                        {(form.title_template || form.body_template) && (
                            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
                                <p className="text-xs font-medium text-muted-foreground">
                                    Pré-visualização (exemplo com dados fictícios; para o paciente virão o nome e a data reais)
                                </p>
                                {form.title_template && (
                                    <p className="text-sm font-semibold">
                                        {previewTemplate({ titleTemplate: form.title_template, bodyTemplate: '' }).title}
                                    </p>
                                )}
                                <p className="text-sm whitespace-pre-wrap">
                                    {previewTemplate({ titleTemplate: '', bodyTemplate: form.body_template }).body}
                                </p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={saving} className="gap-2">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            {editTarget ? 'Salvar alterações' : 'Criar template'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Preview Dialog */}
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Pré-visualização do Template</DialogTitle>
                        <DialogDescription>Como a mensagem será exibida ao paciente</DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                        {previewResult.title && (
                            <p className="font-semibold text-sm">{previewResult.title}</p>
                        )}
                        <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                            {previewResult.body}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPreviewOpen(false)}>Fechar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete confirm */}
            <AlertDialog open={Boolean(deleteTarget)} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir template?</AlertDialogTitle>
                        <AlertDialogDescription>
                            O template <strong>{deleteTarget?.name}</strong> será excluído permanentemente.
                            O histórico de disparos será mantido.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default MessageTemplatesPage;
