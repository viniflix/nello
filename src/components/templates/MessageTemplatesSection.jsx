import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, Eye, Send, ToggleLeft, ToggleRight,
  MessageSquare, Loader2, Search, Copy, CheckCircle2, Clock, HelpCircle, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMessageTemplates, createMessageTemplate, updateMessageTemplate,
  deleteMessageTemplate, toggleMessageTemplate, copyDefaultTemplate,
  previewTemplate, validateTemplatePlaceholders,
  TEMPLATE_CONTEXTS, TEMPLATE_CHANNELS, AVAILABLE_VARIABLES
} from '@/lib/supabase/message-templates-queries';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const EMPTY_FORM = {
  name: '', template_key: '', context: 'general',
  channel: 'in_app', title_template: '', body_template: '',
};

const generateKey = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

export default function MessageTemplatesSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterContext, setFilterContext] = useState('all');
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [previewResult, setPreviewResult] = useState({ title: '', body: '' });
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
      name: tpl.name, template_key: tpl.template_key,
      context: tpl.context, channel: tpl.channel,
      title_template: tpl.title_template || '',
      body_template: tpl.body_template,
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const openPreview = (tpl) => {
    setPreviewResult(previewTemplate({ titleTemplate: tpl.title_template || '', bodyTemplate: tpl.body_template }));
    setPreviewOpen(true);
  };

  const handleDuplicateDefault = async (tpl) => {
    if (tpl.nutritionist_id != null || !user?.id) return;
    setDuplicatingId(tpl.id);
    try {
      const { data, error } = await copyDefaultTemplate({ defaultTemplateId: tpl.id, nutritionistId: user.id });
      if (error) { toast({ title: 'Erro ao duplicar', description: error.message, variant: 'destructive' }); return; }
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
      if (field === 'name' && !editTarget) next.template_key = generateKey(value);
      return next;
    });
    setFormErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Nome é obrigatório';
    if (!form.template_key.trim()) errors.template_key = 'Chave é obrigatória';
    if (!form.body_template.trim()) errors.body_template = 'Corpo do template é obrigatório';
    const { valid, unknownPlaceholders } = validateTemplatePlaceholders(form.body_template, form.title_template);
    if (!valid) errors.body_template = `Variáveis inválidas: ${unknownPlaceholders.join(', ')}`;
    return errors;
  };

  const handleSave = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setSaving(true);
    try {
      if (editTarget) {
        const { error } = await updateMessageTemplate({
          templateId: editTarget.id, nutritionistId: user.id,
          patch: {
            name: form.name.trim(), context: form.context, channel: form.channel,
            title_template: form.title_template.trim() || null,
            body_template: form.body_template.trim(),
          }
        });
        if (error) throw error;
        toast({ title: 'Modelo atualizado com sucesso' });
      } else {
        const { error } = await createMessageTemplate({
          nutritionistId: user.id, templateKey: form.template_key.trim(),
          name: form.name.trim(), context: form.context, channel: form.channel,
          titleTemplate: form.title_template.trim() || null,
          bodyTemplate: form.body_template.trim(),
        });
        if (error) throw error;
        toast({ title: 'Modelo criado com sucesso' });
      }
      setFormOpen(false);
      loadTemplates();
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (tpl) => {
    const { error } = await toggleMessageTemplate({ templateId: tpl.id, nutritionistId: user.id, isActive: !tpl.is_active });
    if (error) toast({ title: 'Erro ao alterar status', variant: 'destructive' });
    else loadTemplates();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await deleteMessageTemplate({ templateId: deleteTarget.id, nutritionistId: user.id });
    if (error) toast({ title: 'Erro ao excluir', variant: 'destructive' });
    else { toast({ title: 'Modelo excluído' }); loadTemplates(); }
    setDeleteTarget(null);
  };

  const copyVariable = (v) => {
    navigator.clipboard?.writeText(v).then(() => toast({ title: `Copiado: ${v}`, duration: 1500 }));
  };

  const contextLabel = (ctx) => TEMPLATE_CONTEXTS.find(c => c.value === ctx)?.label || ctx;
  const channelLabel = (ch) => TEMPLATE_CHANNELS.find(c => c.value === ch)?.label || ch;

  const filtered = templates.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    const matchCtx = filterContext === 'all' || t.context === filterContext;
    return matchSearch && matchCtx;
  });

  return (
    <>
      {/* Linha 1: Título + Descrição + Botão */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="font-heading text-lg sm:text-xl font-semibold uppercase tracking-wide text-primary flex items-center gap-2">
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            Modelos de Mensagem
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Crie textos prontos com variáveis dinâmicas para agilizar a comunicação com seus pacientes.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 whitespace-nowrap w-full sm:w-auto sm:shrink-0">
          <Plus className="w-4 h-4 mr-2" /> Novo modelo
        </Button>
      </div>

      {/* Linha 2: Busca + Filtro — padrão nativo */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          <input
            type="text"
            placeholder="Buscar modelos..."
            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer"
          value={filterContext}
          onChange={e => setFilterContext(e.target.value)}
        >
          <option value="all">Todos os contextos</option>
          {TEMPLATE_CONTEXTS.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Como funciona */}
      <Collapsible open={howItWorksOpen} onOpenChange={setHowItWorksOpen} className="mb-5">
        <div className={`rounded-xl overflow-hidden border-2 transition-all ${
          howItWorksOpen ? 'border-primary/30 bg-primary/10' : 'border-primary/20 bg-primary/5 hover:border-primary/30 hover:bg-primary/10'
        }`}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between gap-3 p-4 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-primary/15 rounded-lg shrink-0">
                  <HelpCircle className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-semibold text-primary">Como funcionam os modelos de mensagem?</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-primary transition-transform duration-200 shrink-0 ${howItWorksOpen ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-3 space-y-2 text-sm text-muted-foreground border-t border-primary/20">
              <p>Crie textos prontos para enviar aos pacientes sem precisar digitar tudo toda vez. Use <strong>variáveis dinâmicas</strong> como <code className="bg-card border border-border px-1.5 py-0.5 rounded text-xs font-mono text-primary">{'{{'+'nome_paciente'+'}}'}</code> que são substituídas automaticamente no envio.</p>
              <p>No <strong>hub do paciente</strong>, aba Adesão, escolha o modelo e clique em enviar. Os modelos com badge “Padrão” foram criados pelo sistema — duplique-os para personalizar.</p>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="font-medium text-muted-foreground">
                {templates.length === 0 ? 'Nenhum modelo criado' : 'Nenhum resultado encontrado'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {templates.length === 0
                  ? 'Crie modelos para agilizar a comunicação com seus pacientes.'
                  : 'Tente outros filtros ou termos de busca.'}
              </p>
            </div>
            {templates.length === 0 && (
              <Button size="sm" onClick={openCreate} className="gap-2 mt-1 bg-primary hover:bg-primary/90">
                <Plus className="h-4 w-4" /> Criar primeiro modelo
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Template list */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map(tpl => {
            const isDefault = tpl.nutritionist_id == null;
            return (
              <Card
                key={`${tpl.nutritionist_id ?? 'default'}-${tpl.id}`}
                className={cn('border-border transition-all hover:border-primary/20 hover:shadow-sm', !tpl.is_active && !isDefault && 'opacity-60')}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Nome + badges */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-foreground truncate">{tpl.name}</span>
                        {isDefault && (
                          <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">Padrão</Badge>
                        )}
                        {!isDefault && (
                          <Badge
                            className={cn('text-xs', tpl.is_active ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground')}
                            variant="outline"
                          >
                            {tpl.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs text-muted-foreground">{contextLabel(tpl.context)}</Badge>
                        <Badge variant="outline" className="text-xs text-muted-foreground">{channelLabel(tpl.channel)}</Badge>
                      </div>

                      {/* Título do template */}
                      {tpl.title_template && (
                        <p className="text-sm font-medium text-muted-foreground mb-0.5">
                          Título: {tpl.title_template}
                        </p>
                      )}

                      {/* Preview do corpo */}
                      <p className="text-sm text-muted-foreground line-clamp-2">{tpl.body_template}</p>

                      {/* Stats */}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Send className="h-3 w-3" /> {tpl.use_count ?? 0} disparos
                        </span>
                        {tpl.last_used_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Último: {format(new Date(tpl.last_used_at), 'dd/MM/yy', { locale: ptBR })}
                          </span>
                        )}
                        {!isDefault && (
                          <span className="font-mono opacity-50">{tpl.template_key}</span>
                        )}
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPreview(tpl)} title="Pré-visualizar">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isDefault ? (
                        <Button
                          variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"
                          onClick={() => handleDuplicateDefault(tpl)}
                          disabled={duplicatingId === tpl.id}
                          title="Duplicar e personalizar"
                        >
                          {duplicatingId === tpl.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                          Duplicar
                        </Button>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(tpl)} title="Editar">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => handleToggle(tpl)}
                            title={tpl.is_active ? 'Desativar' : 'Ativar'}
                          >
                            {tpl.is_active
                              ? <ToggleRight className="h-4 w-4 text-primary" />
                              : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600"
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

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar modelo' : 'Novo modelo de mensagem'}</DialogTitle>
            <DialogDescription>
              Crie um texto reutilizável com variáveis dinâmicas que são substituídas automaticamente no envio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Nome */}
            <div className="space-y-1">
              <Label>Nome do modelo <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Ex: Lembrete de consulta"
                value={form.name}
                onChange={e => handleFormChange('name', e.target.value)}
                className={cn(formErrors.name && 'border-red-400')}
              />
              {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
            </div>

            {/* Chave */}
            <div className="space-y-1">
              <Label>Chave identificadora</Label>
              <Input
                placeholder="gerado_automaticamente"
                value={form.template_key}
                onChange={e => handleFormChange('template_key', e.target.value)}
                disabled={Boolean(editTarget)}
                className={cn('font-mono text-sm', formErrors.template_key && 'border-red-400', editTarget && 'bg-muted/40')}
              />
              {formErrors.template_key && <p className="text-xs text-red-500">{formErrors.template_key}</p>}
            </div>

            {/* Contexto + Canal */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Contexto de uso</Label>
                <Select value={form.context} onValueChange={v => handleFormChange('context', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CONTEXTS.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Canal de envio</Label>
                <Select value={form.channel} onValueChange={v => handleFormChange('channel', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CHANNELS.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Título */}
            <div className="space-y-1">
              <Label>Título da mensagem <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input
                placeholder="Ex: Olá! Lembrete importante"
                value={form.title_template}
                onChange={e => handleFormChange('title_template', e.target.value)}
              />
            </div>

            {/* Corpo */}
            <div className="space-y-1">
              <Label>Texto da mensagem <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Ex: Olá {{nome_paciente}}! Passando para lembrar da sua consulta."
                rows={5}
                value={form.body_template}
                onChange={e => handleFormChange('body_template', e.target.value)}
                className={cn(formErrors.body_template && 'border-red-400')}
              />
              {formErrors.body_template && <p className="text-xs text-red-500">{formErrors.body_template}</p>}
            </div>

            {/* Variáveis disponíveis */}
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <p className="text-sm font-medium text-foreground">Variáveis dinâmicas — clique para copiar</p>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_VARIABLES.map(v => (
                  <button
                    key={v.key} type="button"
                    onClick={() => copyVariable(v.key)}
                    className="text-xs font-mono bg-card hover:bg-primary/10 px-2 py-1 rounded border border-border hover:border-primary/30 transition-colors"
                    title={v.description}
                  >
                    {v.key}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview ao vivo */}
            {(form.title_template || form.body_template) && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Pré-visualização com dados fictícios</p>
                {form.title_template && (
                  <p className="text-sm font-semibold text-foreground">
                    {previewTemplate({ titleTemplate: form.title_template, bodyTemplate: '' }).title}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {previewTemplate({ titleTemplate: '', bodyTemplate: form.body_template }).body}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-primary hover:bg-primary/90">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {editTarget ? 'Salvar alterações' : 'Criar modelo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pré-visualização</DialogTitle>
            <DialogDescription>Como o paciente receberá a mensagem</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
            {previewResult.title && <p className="font-semibold text-sm text-foreground">{previewResult.title}</p>}
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{previewResult.body}</p>
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
            <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              O modelo <strong>{deleteTarget?.name}</strong> será excluído permanentemente. O histórico de disparos será mantido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
