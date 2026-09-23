import React, { useState, useMemo } from 'react';
import {
  useCustomMeasures,
  useCreateCustomMeasure,
  useUpdateCustomMeasure,
  useDeleteCustomMeasure,
} from '@/hooks/useCustomMeasures';
import { useHouseholdMeasures } from '@/hooks/useHouseholdMeasures';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CustomMeasureFormDialog from '@/components/nutritionist/CustomMeasureFormDialog';
import {
  Scale,
  Search,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Lock,
  FlaskConical,
  AlertTriangle,
} from 'lucide-react';

const MAX_CUSTOM_MEASURES = 20;

const CATEGORY_LABELS = {
  volume: 'Volume',
  unit: 'Unidade',
  weight: 'Peso',
  other: 'Outros',
  custom: 'Personalizada',
};

const CATEGORY_COLORS = {
  volume: 'bg-primary/10 text-primary border-primary/20',
  unit: 'bg-amber-50 text-amber-700 border-amber-200',
  weight: 'bg-muted/40 text-muted-foreground border-border',
  other: 'bg-muted/40 text-muted-foreground border-border',
  custom: 'bg-primary/10 text-primary border-primary/20',
};

// ── Card: Medida do Sistema (read-only) ───────────────────────
const SystemMeasureCard = ({ measure }) => (
  <div className="bg-card rounded-xl border border-border p-4 flex items-start justify-between gap-3">
    <div className="flex-1 min-w-0">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="min-w-0 font-medium text-foreground truncate">{measure.name}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[measure.category] || CATEGORY_COLORS.other}`}>
          {CATEGORY_LABELS[measure.category] || measure.category}
        </span>
      </div>
      {measure.description && (
        <p className="text-xs text-muted-foreground truncate">{measure.description}</p>
      )}
      {measure.grams_equivalent && (
        <p className="text-xs text-muted-foreground mt-1">
          1 unidade ≈ <span className="font-medium text-muted-foreground">{measure.grams_equivalent}g</span>
        </p>
      )}
    </div>
    <div className="flex items-center gap-1 shrink-0">
      <Lock className="w-3.5 h-3.5 text-muted-foreground/50" />
    </div>
  </div>
);

// ── Card: Medida Personalizada (editável) ─────────────────────
const CustomMeasureCard = ({ measure, onEdit, onDelete, isDeleting }) => (
  <div className="bg-card rounded-xl border border-primary/20 p-4 flex items-start justify-between gap-3 hover:border-primary/30 transition-colors group">
    <div className="flex-1 min-w-0">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="min-w-0 font-medium text-foreground truncate">{measure.name}</span>
        <span className="text-xs px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20">
          Pessoal
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[measure.category] || CATEGORY_COLORS.other}`}>
          {CATEGORY_LABELS[measure.category] || measure.category}
        </span>
      </div>
      {measure.description && (
        <p className="text-xs text-muted-foreground truncate">{measure.description}</p>
      )}
      <p className="text-xs text-muted-foreground mt-1">
        1 unidade = <span className="font-semibold text-primary">{measure.grams_equivalent}g</span>
      </p>
    </div>
    <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
        onClick={() => onEdit(measure)}
        title="Editar"
      >
        <Edit2 className="w-4 h-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50"
        onClick={() => onDelete(measure)}
        disabled={isDeleting}
        title="Excluir"
      >
        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </Button>
    </div>
  </div>
);

// ── Seção Principal ───────────────────────────────────────────
const CustomMeasuresSection = () => {
  const [activeTab, setActiveTab] = useState('custom');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMeasure, setEditingMeasure] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const {
    data: customMeasures,
    isLoading: loadingCustom,
    refetch: refetchCustom,
    hasReachedLimit,
    count,
  } = useCustomMeasures();

  const { data: systemMeasures, isLoading: loadingSystem } = useHouseholdMeasures();

  const { mutateAsync: createMeasure, isPending: isCreating } = useCreateCustomMeasure();
  const { mutateAsync: updateMeasure, isPending: isUpdating } = useUpdateCustomMeasure();
  const { mutateAsync: deleteMeasure } = useDeleteCustomMeasure();

  const filteredCustomMeasures = useMemo(() => {
    if (!customMeasures) return [];
    return customMeasures.filter(m => 
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.description && m.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [customMeasures, searchTerm]);

  const filteredSystemMeasures = useMemo(() => {
    if (!systemMeasures) return [];
    return systemMeasures.filter(m => 
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.description && m.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [systemMeasures, searchTerm]);

  const isSaving = isCreating || isUpdating;

  // Agrupar medidas filtradas por categoria
  const groupedSystem = filteredSystemMeasures.reduce((acc, m) => {
    const cat = m.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {});

  const handleOpenCreate = () => {
    setEditingMeasure(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (measure) => {
    setEditingMeasure(measure);
    setDialogOpen(true);
  };

  const handleSave = async (payload) => {
    try {
      if (editingMeasure) {
        await updateMeasure({ id: editingMeasure.id, payload });
      } else {
        await createMeasure(payload);
      }
      setDialogOpen(false);
      refetchCustom();
    } catch {
      // Toast já exibido pelo hook
    }
  };

  const handleDelete = async (measure) => {
    const confirmed = window.confirm(
      `Excluir "${measure.name}"?\n\nOs planos alimentares que usavam esta medida serão convertidos automaticamente para gramas.\n\nEx: "2 ${measure.name}" → "${(2 * measure.grams_equivalent).toFixed(0)}g"`
    );
    if (!confirmed) return;

    setDeletingId(measure.id);
    try {
      await deleteMeasure(measure.id);
      refetchCustom();
    } catch {
      // Toast já exibido pelo hook
    } finally {
      setDeletingId(null);
    }
  };

  const tabs = [
    { id: 'custom', label: 'Minhas Medidas', count: filteredCustomMeasures.length },
    { id: 'system', label: 'Medidas do Sistema', count: filteredSystemMeasures.length },
  ];

  return (
    <div>
      {/* Linha 1: Título + Descrição */}
      <div className="mb-6">
        <h2 className="font-heading text-lg sm:text-xl font-semibold uppercase tracking-wide text-primary flex items-center gap-2">
            <Scale className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            Medidas Caseiras
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Gerencie e crie medidas caseiras com equivalência em gramas para usar nos seus planos.
        </p>
      </div>

      {/* Linha 2: Sub-abas (esq) + Busca + Botão (dir) — padrão Nutrição */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        {/* Sub-abas */}
        <div className="flex gap-1 bg-muted p-1 rounded-xl w-full md:w-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`min-w-0 flex-1 md:flex-none flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 text-xs sm:text-sm text-center font-medium rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
              }`}
            >
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === tab.id ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Busca + Botão */}
        <div className="flex flex-col min-[420px]:flex-row gap-3 w-full md:w-auto min-w-0">
          <div className="relative flex-1 min-w-0 md:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <input
              type="text"
              placeholder="Buscar medida..."
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            onClick={handleOpenCreate}
            disabled={hasReachedLimit}
            className="bg-primary hover:bg-primary/90 min-[420px]:shrink-0"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Medida
          </Button>
        </div>
      </div>

      {/* ── Tab: Minhas Medidas ── */}
      {activeTab === 'custom' && (
        <div>
          {/* Info de limite */}
          {hasReachedLimit && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-700">
                Limite atingido ({count}/{MAX_CUSTOM_MEASURES}). Exclua uma medida para criar outra.
              </p>
            </div>
          )}
          {!hasReachedLimit && (
            <p className="text-xs text-muted-foreground mb-4">{count}/{MAX_CUSTOM_MEASURES} medidas criadas</p>
          )}

          {/* Loading */}
          {loadingCustom && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}

          {/* Empty State */}
          {!loadingCustom && filteredCustomMeasures.length === 0 && (
            <div className="bg-card rounded-xl border border-dashed border-border p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Scale className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                {searchTerm ? 'Nenhuma medida encontrada' : 'Nenhuma medida personalizada'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs mb-5">
                {searchTerm 
                  ? `Nenhum resultado para "${searchTerm}".`
                  : 'Crie medidas caseiras com equivalência em gramas para usar nos seus planos alimentares.'}
              </p>
              {!searchTerm && (
                <Button onClick={handleOpenCreate} className="bg-primary hover:bg-primary/90">
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Primeira Medida
                </Button>
              )}
            </div>
          )}

          {/* Grid de cards */}
          {!loadingCustom && filteredCustomMeasures.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCustomMeasures.map((m) => (
                <CustomMeasureCard
                  key={m.id}
                  measure={m}
                  onEdit={handleOpenEdit}
                  onDelete={handleDelete}
                  isDeleting={deletingId === m.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Medidas do Sistema ── */}
      {activeTab === 'system' && (
        <div>
          <div className="flex items-center gap-2 mb-5 p-3 bg-muted/40 rounded-lg border border-border">
            <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Estas medidas são gerenciadas pelo sistema Nello e não podem ser alteradas.
              Você pode criar medidas personalizadas na aba "Minhas Medidas".
            </p>
          </div>

          {loadingSystem ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedSystem).map(([category, measures]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <FlaskConical className="w-4 h-4" />
                    {CATEGORY_LABELS[category] || category}
                    <span className="text-xs font-normal normal-case text-muted-foreground">
                      ({measures.length})
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {measures.map((m) => (
                      <SystemMeasureCard key={m.id} measure={m} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dialog de criação/edição */}
      <CustomMeasureFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        measure={editingMeasure}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </div>
  );
};

export default CustomMeasuresSection;
