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
    diet: 'bg-primary/15 text-primary',
    meal: 'bg-primary/15 text-primary',
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
    <div className="bg-card rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-primary/20 transition-all flex flex-col h-full p-5 gap-3 group">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
          {type === 'diet' && <FileText className="w-5 h-5" />}
          {type === 'meal' && <Coffee className="w-5 h-5" />}
          {type === 'recipe' && <UtensilsCrossed className="w-5 h-5" />}
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          type === 'recipe' ? 'bg-amber-100 text-amber-800' : 'bg-primary/15 text-primary'
        }`}>
          {typeLabel}
        </span>
      </div>

      {/* Nome e descrição */}
      <div className="flex-1">
        <h3
          className="text-base font-bold text-foreground line-clamp-2 leading-snug"
          title={template.name}
        >
          {template.name}
        </h3>
        {template.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.description}</p>
        )}
      </div>

      {/* Stats de conteúdo */}
      {type === 'diet' && (template.meal_count > 0 || template.food_count > 0) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          <span className="flex items-center gap-1.5">
            <Coffee className="w-3.5 h-3.5 text-muted-foreground" />
            {template.meal_count} refeição(ões)
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span className="flex items-center gap-1.5">
            <Salad className="w-3.5 h-3.5 text-muted-foreground" />
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
              className="px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/20 text-xs rounded-full font-medium"
            >
              {typeof tag === 'string' ? tag : String(tag?.name || tag?.label || '')}
            </span>
          ))}
          {template.tags.length > 4 && (
            <span className="px-2.5 py-0.5 bg-muted text-muted-foreground text-xs rounded-full">
              +{template.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{formattedDate}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/nutritionist/templates/edit/${type}/${template.id}`)}
            className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
            title="Editar"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
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
  const navigate = useNavigate();
  const { useTemplates: useCheckinTemplates } = useCheckins();
  const { data: templates, isLoading, isError, refetch } = useCheckinTemplates();

  const [searchTerm, setSearchTerm] = useState('');

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    return templates.filter(t => 
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [templates, searchTerm]);

  return (
    <>
      {/* Header: Título + Busca + Botão tudo na mesma linha */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                  Templates de Check-ins
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Crie e gerencie formulários automáticos de acompanhamento.
              </p>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar check-ins..."
                  className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button onClick={() => navigate('/nutritionist/templates/checkins/new')} className="bg-primary hover:bg-primary/90 shrink-0">
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

      {!isLoading && isError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <h3 className="text-lg font-medium text-amber-900">Não foi possível carregar os check-ins</h3>
          <p className="mt-1 text-sm text-amber-800">Isso é uma falha de carregamento, não significa que seus formulários foram removidos.</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      )}

      {!isLoading && !isError && (!filteredTemplates || filteredTemplates.length === 0) && (
        <div className="bg-card rounded-xl border border-dashed border-border p-12 text-center flex flex-col items-center">
          <CheckSquare className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">
            {searchTerm ? 'Nenhum check-in encontrado' : 'Nenhum check-in criado'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {searchTerm 
              ? `Nenhum resultado para "${searchTerm}".`
              : 'Crie formulários automáticos de check-in para acompanhar a adesão dos seus pacientes.'}
          </p>
          {!searchTerm && (
            <Button onClick={() => navigate('/nutritionist/templates/checkins/new')} className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" /> Começar agora
            </Button>
          )}
        </div>
      )}

      {!isLoading && !isError && filteredTemplates && filteredTemplates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="flex flex-col border-border shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200">
              <CardHeader className="pb-3 bg-muted/60 border-b border-border">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base line-clamp-1">{template.name}</CardTitle>
                  <span className="bg-primary/10 text-primary text-xs font-semibold px-2 py-1 rounded-md shrink-0 ml-2">
                    {template.channel === 'whatsapp' ? 'WhatsApp' : 'In-App'}
                  </span>
                </div>
                <CardDescription className="line-clamp-2 min-h-[2.5rem] text-sm mt-1">
                  {template.description || 'Sem descrição'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pt-4 pb-3">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 bg-muted/40 p-2 rounded-md">
                    <Clock className="w-4 h-4 text-primary/70 shrink-0" />
                    <span>
                      {template.frequency === 'daily' ? 'Diário' :
                       template.frequency === 'weekly' ? 'Semanal' :
                       template.frequency === 'biweekly' ? 'Quinzenal' : 'Mensal'} às {template.send_time?.substring(0, 5)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/40 p-2 rounded-md">
                    <CheckSquare className="w-4 h-4 text-primary/70 shrink-0" />
                    <span>{template.checkin_fields?.length || 0} perguntas</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-3 border-t border-border bg-muted/30">
                <Button className="w-full h-9" variant="outline" size="sm" onClick={() => navigate(`/nutritionist/templates/checkins/${template.id}/edit`)}>
                  <Settings2 className="w-4 h-4 mr-2" /> Editar Template
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
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
  const { templates, loading, deleteTemplate } = useTemplates(activeNutritionTab, {
    enabled: activeGroup === 'nutrition',
  });

  const filteredTemplates = useMemo(
    () => templates.filter(t =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
    ),
    [templates, searchTerm]
  );

  const currentNutritionTab = NUTRITION_TABS.find(t => t.id === activeNutritionTab);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <main className="mx-auto w-full max-w-7xl min-w-0 px-4 pt-4 pb-8 md:px-8 md:pt-8">
      <Helmet>
        <title>Protocolos - Nello</title>
      </Helmet>

      {/* Header */}
      <div className="mb-6 text-center sm:text-left md:mb-8">
        <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-primary break-words md:text-3xl">Protocolos</h1>
        <p className="mt-1 text-sm text-neutral-600 md:text-base">Gerencie seus protocolos de dietas, banco de alimentos, formulários, check-ins e modelos de mensagem.</p>
      </div>

      {/* Seletor de Grupo */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:gap-3 lg:flex">
        {GROUPS.map(group => {
          const Icon = group.icon;
          const isActive = activeGroup === group.id;
          return (
            <button
              type="button"
              key={group.id}
              aria-pressed={isActive}
              onClick={() => { setActiveGroup(group.id); setSearchTerm(''); }}
              className={`flex min-w-0 items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-center text-xs font-semibold leading-tight transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-5 sm:text-sm ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-primary'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {group.label}
            </button>
          );
        })}
      </div>

      {/* ── Grupo: Nutrição ── */}
      {activeGroup === 'nutrition' && (
        <>
          <div className="mb-6">
            <h2 className="font-heading text-lg sm:text-xl font-semibold uppercase tracking-wide text-primary flex items-center gap-2">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                Templates de Nutrição
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Gerencie seus protocolos de dietas, refeições e receitas.
            </p>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            {/* Sub-abas */}
            <div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-muted p-1 md:flex md:w-auto">
              {NUTRITION_TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeNutritionTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveNutritionTab(tab.id); setSearchTerm(''); }}
                    className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-center text-xs font-medium leading-tight transition-all sm:flex-row sm:gap-2 sm:text-sm md:flex-none md:px-4 ${
                      isActive ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex w-full min-w-0 flex-col gap-2 min-[375px]:flex-row md:w-auto md:gap-3">
              {/* Busca */}
              <div className="relative min-w-0 flex-1 md:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-muted-foreground" />
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
                  className="block w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm bg-card placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <button
                onClick={() => navigate(`/nutritionist/templates/new/${activeNutritionTab}`)}
                className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-colors font-medium text-sm whitespace-nowrap"
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
            <div className="bg-card rounded-xl shadow-sm border border-border p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-muted-foreground mb-4">
                {activeNutritionTab === 'diet' && <FileText className="w-8 h-8" />}
                {activeNutritionTab === 'meal' && <Coffee className="w-8 h-8" />}
                {activeNutritionTab === 'recipe' && <UtensilsCrossed className="w-8 h-8" />}
              </div>
              <h3 className="text-lg font-medium text-foreground mb-1">Nenhum template encontrado</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                {searchTerm
                  ? `Nenhum resultado para "${searchTerm}".`
                  : `Você ainda não possui ${currentNutritionTab?.label.toLowerCase()} cadastrados.`}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => navigate(`/nutritionist/templates/new/${activeNutritionTab}`)}
                  className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
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
            <h2 className="font-heading text-lg sm:text-xl font-semibold uppercase tracking-wide text-primary flex items-center gap-2">
              <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              Formulários & Acompanhamento
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Gerencie formulários de anamnese, check-ins automáticos e modelos de mensagem.
            </p>
          </div>

          {/* Sub-abas — mesmo padrão de Nutrição */}
          <div className="mb-6 grid w-full grid-cols-3 gap-1 rounded-xl bg-muted p-1 md:inline-flex md:w-auto">
            {FORMS_TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeFormsTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveFormsTab(tab.id)}
                  className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-center text-xs font-medium leading-tight transition-all sm:flex-row sm:gap-2 sm:text-sm md:flex-none md:px-4 ${
                    isActive ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
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
      </main>
    </div>
  );
}
