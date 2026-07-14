import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTemplates } from '@/hooks/useTemplates';
import { useCheckins } from '@/hooks/useCheckins';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CheckinTemplateBuilder from '@/components/nutritionist/CheckinTemplateBuilder';
import MessageTemplatesSection from '@/components/templates/MessageTemplatesSection';
import FoodBankSection from '@/components/templates/FoodBankSection';
import CustomMeasuresSection from '@/components/nutritionist/CustomMeasuresSection';
import TemplatesList from '@/pages/nutritionist/settings/anamnesis-templates/TemplatesList';
import {
  FileText,
  Coffee,
  UtensilsCrossed,
  Plus,
  Search,
  Edit2,
  Trash2,
  Loader2,
  CheckSquare,
  Clock,
  Settings2,
  ClipboardList,
  Salad,
  ExternalLink,
  Construction,
  MessageSquare,
  Database,
  Scale,
} from 'lucide-react';
import { CardSkeleton } from '@/components/ui/custom-skeletons';

// ─── Nutrição: Card de Template ───────────────────────────────────────────────
const NutritionCard = React.memo(({ template, type, onDelete, toast }) => {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);

  const typeLabel = { diet: 'Dieta', meal: 'Refeição', recipe: 'Receita' }[type];
  const typeBadgeClass = {
    diet: 'bg-blue-100 text-blue-800',
    meal: 'bg-blue-100 text-blue-800',
    recipe: 'bg-amber-100 text-amber-800',
  }[type];

  const handleDelete = async () => {
    const mealInfo = template.meal_count > 0
      ? `Este template possui ${template.meal_count} refeição(ões) e ${template.food_count} alimento(s). `
      : '';
    if (!window.confirm(`${mealInfo}Excluir "${template.name}"? Esta ação não pode ser desfeita.`)) return;
    setIsDeleting(true);
    const success = await onDelete(template.id);
    if (success) {
      toast({ title: 'Sucesso', description: 'Template excluído.' });
    } else {
      toast({ title: 'Erro', description: 'Não foi possível excluir o template.', variant: 'destructive' });
      setIsDeleting(false);
    }
  };

  const formattedDate = new Date(template.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all flex flex-col h-full p-5 gap-3 group">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600 shrink-0">
          {type === 'diet' && <FileText className="w-5 h-5" />}
          {type === 'meal' && <Coffee className="w-5 h-5" />}
          {type === 'recipe' && <UtensilsCrossed className="w-5 h-5" />}
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          type === 'recipe' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
        }`}>
          {typeLabel}
        </span>
      </div>

      {/* Nome e descrição */}
      <div className="flex-1">
        <h3
          className="text-base font-bold text-slate-800 line-clamp-2 leading-snug"
          title={template.name}
        >
          {template.name}
        </h3>
        {template.description && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{template.description}</p>
        )}
      </div>

      {/* Stats de conteúdo */}
      {type === 'diet' && (template.meal_count > 0 || template.food_count > 0) && (
        <div className="flex items-center gap-3 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
          <span className="flex items-center gap-1.5">
            <Coffee className="w-3.5 h-3.5 text-slate-400" />
            {template.meal_count} refeição(ões)
          </span>
          <span className="text-slate-300">·</span>
          <span className="flex items-center gap-1.5">
            <Salad className="w-3.5 h-3.5 text-slate-400" />
            {template.food_count} alimento(s)
          </span>
        </div>
      )}

      {/* Tags */}
      {template.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {template.tags.slice(0, 4).map((tag, idx) => (
            <span
              key={idx}
              className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs rounded-full font-medium"
            >
              {tag}
            </span>
          ))}
          {template.tags.length > 4 && (
            <span className="px-2.5 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">
              +{template.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-400">{formattedDate}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/nutritionist/templates/edit/${type}/${template.id}`)}
            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
            title="Editar"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
            title="Excluir"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
});

// ─── Check-ins: Seção Inline ──────────────────────────────────────────────────
const CheckinsSection = () => {
  const { useTemplates: useCheckinTemplates, createTemplate } = useCheckins();
  const { data: templates, isLoading } = useCheckinTemplates();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [sendTime, setSendTime] = useState('09:00');
  const [channel, setChannel] = useState('in_app');
  const [fields, setFields] = useState([
    { label: 'Como você avalia sua adesão à dieta nesta semana?', field_type: 'scale_1_10', options: [], score_weight: 1.0, is_required: true }
  ]);

  const [searchTerm, setSearchTerm] = useState('');

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    return templates.filter(t => 
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [templates, searchTerm]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name) return;
    await createTemplate.mutateAsync({
      template: { name, description, frequency, send_time: sendTime, send_days: [1], channel },
      fields
    });
    setIsCreateModalOpen(false);
    setName(''); setDescription(''); setFrequency('weekly');
    setFields([{ label: 'Como você avalia sua adesão à dieta nesta semana?', field_type: 'scale_1_10', options: [], score_weight: 1.0, is_required: true }]);
  };

  return (
    <>
      {/* Header: Título + Busca + Botão tudo na mesma linha */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
                  Templates de Check-ins
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Crie e gerencie formulários automáticos de acompanhamento.
              </p>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar check-ins..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button onClick={() => setIsCreateModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
                  <Plus className="w-4 h-4 mr-2" /> Novo Check-in
              </Button>
          </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {!isLoading && (!filteredTemplates || filteredTemplates.length === 0) && (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center flex flex-col items-center">
          <CheckSquare className="w-12 h-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-1">
            {searchTerm ? 'Nenhum check-in encontrado' : 'Nenhum check-in criado'}
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mb-6">
            {searchTerm 
              ? `Nenhum resultado para "${searchTerm}".`
              : 'Crie formulários automáticos de check-in para acompanhar a adesão dos seus pacientes.'}
          </p>
          {!searchTerm && (
            <Button onClick={() => setIsCreateModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" /> Começar agora
            </Button>
          )}
        </div>
      )}

      {!isLoading && filteredTemplates && filteredTemplates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="flex flex-col border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-200">
              <CardHeader className="pb-3 bg-slate-50/60 border-b border-slate-100">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base line-clamp-1">{template.name}</CardTitle>
                  <span className="bg-emerald-50 text-emerald-700 text-xs font-semibold px-2 py-1 rounded-md shrink-0 ml-2">
                    {template.channel === 'whatsapp' ? 'WhatsApp' : 'In-App'}
                  </span>
                </div>
                <CardDescription className="line-clamp-2 min-h-[2.5rem] text-sm mt-1">
                  {template.description || 'Sem descrição'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pt-4 pb-3">
                <div className="space-y-2 text-sm text-slate-500">
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-md">
                    <Clock className="w-4 h-4 text-emerald-600/70 shrink-0" />
                    <span>
                      {template.frequency === 'daily' ? 'Diário' :
                       template.frequency === 'weekly' ? 'Semanal' :
                       template.frequency === 'biweekly' ? 'Quinzenal' : 'Mensal'} às {template.send_time?.substring(0, 5)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-md">
                    <CheckSquare className="w-4 h-4 text-emerald-600/70 shrink-0" />
                    <span>{template.checkin_fields?.length || 0} perguntas</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-3 border-t border-slate-100 bg-slate-50/30">
                <Button className="w-full h-9" variant="outline" size="sm">
                  <Settings2 className="w-4 h-4 mr-2" /> Editar Template
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <div className="px-6 py-4 border-b bg-slate-50">
            <DialogHeader>
              <DialogTitle className="text-xl">Criar Template de Check-in</DialogTitle>
              <DialogDescription>
                Configure as perguntas e escalas que geram o ranking de adesão automática.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
            <form id="create-checkin-form" onSubmit={handleCreate} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="font-semibold">Nome do Template</Label>
                    <Input required value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Relato Semanal de Adesão" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold">Frequência de Envio</Label>
                    <Select value={frequency} onValueChange={setFrequency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Diariamente</SelectItem>
                        <SelectItem value="weekly">Semanalmente</SelectItem>
                        <SelectItem value="biweekly">A cada 15 dias</SelectItem>
                        <SelectItem value="monthly">Mensalmente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="font-semibold">Horário de Envio</Label>
                    <Input type="time" required value={sendTime} onChange={e => setSendTime(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold">Canal de Disparo</Label>
                    <Select value={channel} onValueChange={setChannel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_app">App HipoZero (Notificação)</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp (Requer integração)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t">
                <CheckinTemplateBuilder fields={fields} setFields={setFields} />
              </div>
            </form>
          </div>

          <div className="px-6 py-4 border-t bg-slate-50 flex justify-end gap-3 shrink-0">
            <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)}>Cancelar</Button>
            <Button
              type="submit"
              form="create-checkin-form"
              disabled={createTemplate.isPending || fields.length === 0}
              className="px-8 bg-emerald-600 hover:bg-emerald-700"
            >
              {createTemplate.isPending ? 'Salvando...' : 'Salvar Template'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};



// ─── Página Principal ──────────────────────────────────────────────────────────
const GROUPS = [
  { id: 'nutrition', label: 'Nutrição', icon: Salad },
  { id: 'foodbank', label: 'Banco de Alimentos', icon: Database },
  { id: 'measures', label: 'Medidas Caseiras', icon: Scale },
  { id: 'forms', label: 'Formulários & Acompanhamento', icon: ClipboardList },
];

const NUTRITION_TABS = [
  { id: 'diet', label: 'Dietas Padrão', icon: FileText },
  { id: 'meal', label: 'Refeições', icon: Coffee },
  { id: 'recipe', label: 'Receitas', icon: UtensilsCrossed },
];

const FORMS_TABS = [
  { id: 'forms', label: 'Formulários', icon: ClipboardList },
  { id: 'checkins', label: 'Check-ins', icon: CheckSquare },
  { id: 'messages', label: 'Modelos de Mensagem', icon: MessageSquare },
];

export default function TemplatesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeGroup = searchParams.get('group') || 'nutrition';
  const activeNutritionTab = searchParams.get('ntab') || 'diet';
  const activeFormsTab = searchParams.get('ftab') || 'forms';
  
  const setActiveGroup = (group) => {
    const params = new URLSearchParams(searchParams);
    params.set('group', group);
    setSearchParams(params, { replace: true });
  };
  
  const setActiveNutritionTab = (tab) => {
    const params = new URLSearchParams(searchParams);
    params.set('ntab', tab);
    setSearchParams(params, { replace: true });
  };
  
  const setActiveFormsTab = (tab) => {
    const params = new URLSearchParams(searchParams);
    params.set('ftab', tab);
    setSearchParams(params, { replace: true });
  };

  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  // Nutrição hook — só carrega quando no grupo certo
  const { templates, loading, deleteTemplate } = useTemplates(
    activeGroup === 'nutrition' ? activeNutritionTab : 'diet'
  );

  const filteredTemplates = useMemo(
    () => templates.filter(t =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
    ),
    [templates, searchTerm]
  );

  const currentNutritionTab = NUTRITION_TABS.find(t => t.id === activeNutritionTab);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <Helmet>
        <title>Protocolos - HipoZero</title>
      </Helmet>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Protocolos</h1>
        <p className="text-slate-500 mt-1">Gerencie seus protocolos de dietas, banco de alimentos, formulários, check-ins e modelos de mensagem.</p>
      </div>

      {/* Seletor de Grupo */}
      <div className="flex gap-3 mb-6">
        {GROUPS.map(group => {
          const Icon = group.icon;
          const isActive = activeGroup === group.id;
          return (
            <button
              key={group.id}
              onClick={() => { setActiveGroup(group.id); setSearchTerm(''); }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                isActive
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {group.label}
            </button>
          );
        })}
      </div>

      {/* ── Grupo: Nutrição ── */}
      {activeGroup === 'nutrition' && (
        <>
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
                Templates de Nutrição
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Gerencie seus protocolos de dietas, refeições e receitas.
            </p>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            {/* Sub-abas */}
            <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto">
              {NUTRITION_TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeNutritionTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveNutritionTab(tab.id); setSearchTerm(''); }}
                    className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      isActive ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 w-full md:w-auto">
              {/* Busca */}
              <div className="relative flex-1 md:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder={
                    activeNutritionTab === 'diet' ? 'Buscar dieta...' :
                    activeNutritionTab === 'meal' ? 'Buscar refeição...' :
                    'Buscar receita...'
                  }
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
              <button
                onClick={() => navigate(`/nutritionist/templates/new/${activeNutritionTab}`)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-colors font-medium text-sm whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Novo Template
              </button>
            </div>
          </div>

          {/* Grid de Cards */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4">
                {activeNutritionTab === 'diet' && <FileText className="w-8 h-8" />}
                {activeNutritionTab === 'meal' && <Coffee className="w-8 h-8" />}
                {activeNutritionTab === 'recipe' && <UtensilsCrossed className="w-8 h-8" />}
              </div>
              <h3 className="text-lg font-medium text-slate-800 mb-1">Nenhum template encontrado</h3>
              <p className="text-slate-500 max-w-sm mb-6">
                {searchTerm
                  ? `Nenhum resultado para "${searchTerm}".`
                  : `Você ainda não possui ${currentNutritionTab?.label.toLowerCase()} cadastrados.`}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => navigate(`/nutritionist/templates/new/${activeNutritionTab}`)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" /> Criar Novo Template
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredTemplates.map(template => (
                <NutritionCard
                  key={template.id}
                  template={template}
                  type={activeNutritionTab}
                  onDelete={deleteTemplate}
                  toast={toast}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Grupo: Banco de Alimentos ── */}
      {activeGroup === 'foodbank' && <FoodBankSection />}

      {/* ── Grupo: Medidas Caseiras ── */}
      {activeGroup === 'measures' && <CustomMeasuresSection />}

      {/* ── Grupo: Formulários & Acompanhamento ── */}
      {activeGroup === 'forms' && (
        <>
          {/* Título */}
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
              Formulários & Acompanhamento
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Gerencie formulários de anamnese, check-ins automáticos e modelos de mensagem.
            </p>
          </div>

          {/* Sub-abas — mesmo padrão de Nutrição */}
          <div className="inline-flex space-x-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto mb-6">
            {FORMS_TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeFormsTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveFormsTab(tab.id)}
                  className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    isActive ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Conteúdo dinâmico */}
          {activeFormsTab === 'checkins' && <CheckinsSection />}
          {activeFormsTab === 'messages' && <MessageTemplatesSection />}
          {activeFormsTab === 'forms' && <TemplatesList />}
        </>
      )}
    </div>
  );
}
