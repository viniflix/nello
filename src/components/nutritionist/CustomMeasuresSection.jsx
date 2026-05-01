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
  volume: 'bg-blue-50 text-blue-700 border-blue-200',
  unit: 'bg-amber-50 text-amber-700 border-amber-200',
  weight: 'bg-slate-50 text-slate-600 border-slate-200',
  other: 'bg-slate-50 text-slate-600 border-slate-200',
  custom: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

// ── Card: Medida do Sistema (read-only) ───────────────────────
const SystemMeasureCard = ({ measure }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-3">
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-slate-800 truncate">{measure.name}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[measure.category] || CATEGORY_COLORS.other}`}>
          {CATEGORY_LABELS[measure.category] || measure.category}
        </span>
      </div>
      {measure.description && (
        <p className="text-xs text-slate-500 truncate">{measure.description}</p>
      )}
      {measure.grams_equivalent && (
        <p className="text-xs text-slate-400 mt-1">
          1 unidade ≈ <span className="font-medium text-slate-600">{measure.grams_equivalent}g</span>
        </p>
      )}
    </div>
    <div className="flex items-center gap-1 shrink-0">
      <Lock className="w-3.5 h-3.5 text-slate-300" />
    </div>
  </div>
);

// ── Card: Medida Personalizada (editável) ─────────────────────
const CustomMeasureCard = ({ measure, onEdit, onDelete, isDeleting }) => (
  <div className="bg-white rounded-xl border border-blue-100 p-4 flex items-start justify-between gap-3 hover:border-blue-300 transition-colors group">
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-slate-800 truncate">{measure.name}</span>
        <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
          Pessoal
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[measure.category] || CATEGORY_COLORS.other}`}>
          {CATEGORY_LABELS[measure.category] || measure.category}
        </span>
      </div>
      {measure.description && (
        <p className="text-xs text-slate-500 truncate">{measure.description}</p>
      )}
      <p className="text-xs text-slate-400 mt-1">
        1 unidade = <span className="font-semibold text-blue-700">{measure.grams_equivalent}g</span>
      </p>
    </div>
    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        onClick={() => onEdit(measure)}
        title="Editar"
      >
        <Edit2 className="w-4 h-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
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
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Scale className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            Medidas Caseiras
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Gerencie e crie medidas caseiras com equivalência em gramas para usar nos seus planos.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        {/* Sub-abas */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Busca */}
        <div className="relative flex-1 w-full sm:w-64">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar medida..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* ── Tab: Minhas Medidas ── */}
      {activeTab === 'custom' && (
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-sm text-slate-500">
                {count}/{MAX_CUSTOM_MEASURES} medidas criadas
              </p>
              {hasReachedLimit && (
                <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Limite atingido. Exclua uma medida para criar outra.
                </p>
              )}
            </div>
            <Button
              onClick={handleOpenCreate}
              disabled={hasReachedLimit}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Medida
            </Button>
          </div>

          {/* Loading */}
          {loadingCustom && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          )}

          {/* Empty State */}
          {!loadingCustom && filteredCustomMeasures.length === 0 && (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                <Scale className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-700 mb-1">
                {searchTerm ? 'Nenhuma medida encontrada' : 'Nenhuma medida personalizada'}
              </h3>
              <p className="text-sm text-slate-500 max-w-xs mb-5">
                {searchTerm 
                  ? `Nenhum resultado para "${searchTerm}".`
                  : 'Crie medidas caseiras com equivalência em gramas para usar nos seus planos alimentares.'}
              </p>
              {!searchTerm && (
                <Button onClick={handleOpenCreate} className="bg-emerald-600 hover:bg-emerald-700">
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
          <div className="flex items-center gap-2 mb-5 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <Lock className="w-4 h-4 text-slate-400 shrink-0" />
            <p className="text-sm text-slate-500">
              Estas medidas são gerenciadas pelo sistema HipoZero e não podem ser alteradas.
              Você pode criar medidas personalizadas na aba "Minhas Medidas".
            </p>
          </div>

          {loadingSystem ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedSystem).map(([category, measures]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <FlaskConical className="w-4 h-4" />
                    {CATEGORY_LABELS[category] || category}
                    <span className="text-xs font-normal normal-case text-slate-400">
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
