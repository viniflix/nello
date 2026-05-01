import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Plus, Database, Package, Loader2, X, ChevronLeft, ChevronRight, SlidersHorizontal, ChevronDown, BookOpen } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import FoodCardHorizontal from '@/components/nutrition/FoodCardHorizontal';
import FoodDetailsDialog from '@/components/nutrition/FoodDetailsDialog';
import SmartFoodForm from '@/components/nutrition/SmartFoodForm';
import { useDebounce } from '@/hooks/useDebounce';

const ITEMS_PER_PAGE = 20;

// Fontes reais do banco
const SOURCE_TABS = [
  { id: 'all',       label: 'Todos',          publicSource: null },
  { id: 'TACO',      label: 'TACO',           publicSource: 'TACO' },
  { id: 'TBCA',      label: 'TBCA',           publicSource: 'TBCA' },
  { id: 'TUCUNDUVA', label: 'Tucunduva',      publicSource: 'TUCUNDUVA' },
  { id: 'USDA',      label: 'USDA',           publicSource: 'USDA' },
  { id: 'Nello',     label: 'Nello',          publicSource: 'Nello' },
  { id: 'custom',    label: 'Meus Alimentos', publicSource: null },
];

// Grupos alimentares para filtro
const FOOD_GROUPS = [
  'Carnes e derivados', 'Leite e derivados', 'Cereais e derivados',
  'Leguminosas', 'Frutas', 'Verduras e Hortaliças', 'Gorduras e óleos',
  'Bebidas', 'Açúcares e confeitaria', 'Ovos', 'Pescados',
  'Alimentos preparados', 'Outros',
];

// Faixas calóricas — coluna real é "calories"
const CAL_RANGES = [
  { id: 'low',  label: 'Baixa caloria',  desc: '< 100 kcal',      min: null, max: 100 },
  { id: 'mid',  label: 'Moderada',       desc: '100 – 250 kcal',  min: 100,  max: 250 },
  { id: 'high', label: 'Alta caloria',   desc: '≥ 250 kcal',      min: 250,  max: null },
];

// Filtro de macro dominante
const MACRO_FILTERS = [
  { id: 'protein', label: 'Rico em proteína',    desc: '≥ 15g proteína/100g' },
  { id: 'carbs',   label: 'Rico em carboidratos', desc: '≥ 40g carbs/100g' },
  { id: 'fat',     label: 'Rico em gorduras',     desc: '≥ 15g gordura/100g' },
  { id: 'fiber',   label: 'Rico em fibra',        desc: '≥ 5g fibra/100g' },
];

export default function FoodBankSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [activeSource, setActiveSource] = useState('all');
  const [searchTerm, setSearchTerm]     = useState('');
  const [filterOpen, setFilterOpen]     = useState(false);

  // Filtros múltiplos
  const [groupFilters,  setGroupFilters]  = useState([]);   // grupos alimentares selecionados
  const [calFilter,     setCalFilter]     = useState(null); // id do CAL_RANGES
  const [macroFilter,   setMacroFilter]   = useState(null); // id do MACRO_FILTERS

  const [foods,   setFoods]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [page,    setPage]    = useState(0);
  const [total,   setTotal]   = useState(0);

  const [stats, setStats] = useState({ custom: 0, public: 0, totalAll: 0, taco: 0, tbca: 0, tucunduva: 0, usda: 0, nello: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  const [selectedFood,  setSelectedFood]  = useState(null);
  const [detailsOpen,   setDetailsOpen]   = useState(false);
  const [createOpen,    setCreateOpen]    = useState(false);
  const [editOpen,      setEditOpen]      = useState(false);
  const [foodToEdit,    setFoodToEdit]    = useState(null);
  const [deleteOpen,    setDeleteOpen]    = useState(false);
  const [foodToDelete,  setFoodToDelete]  = useState(null);

  const debouncedSearch = useDebounce(searchTerm, 300);
  const isCustom    = activeSource === 'custom';
  const totalPages  = Math.ceil(total / ITEMS_PER_PAGE);

  // Conta quantos filtros extras estão ativos
  const activeFilterCount = groupFilters.length + (calFilter ? 1 : 0) + (macroFilter ? 1 : 0);

  // ── Stats ────────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!user?.id) return;
    setStatsLoading(true);
    try {
      const [customRes, publicRes, tacoRes, tbcaRes, tucRes, usdaRes, nelloRes] = await Promise.all([
        supabase.from('foods').select('id', { count: 'exact', head: true })
          .eq('is_active', true).or(`source.eq.custom,nutritionist_id.eq.${user.id}`),
        supabase.from('foods').select('id', { count: 'exact', head: true })
          .eq('is_active', true).neq('source', 'custom').is('nutritionist_id', null),
        supabase.from('foods').select('id', { count: 'exact', head: true })
          .eq('is_active', true).eq('source', 'TACO').is('nutritionist_id', null),
        supabase.from('foods').select('id', { count: 'exact', head: true })
          .eq('is_active', true).eq('source', 'TBCA').is('nutritionist_id', null),
        supabase.from('foods').select('id', { count: 'exact', head: true })
          .eq('is_active', true).eq('source', 'TUCUNDUVA').is('nutritionist_id', null),
        supabase.from('foods').select('id', { count: 'exact', head: true })
          .eq('is_active', true).eq('source', 'USDA').is('nutritionist_id', null),
        supabase.from('foods').select('id', { count: 'exact', head: true })
          .eq('is_active', true).eq('source', 'Nello').is('nutritionist_id', null),
      ]);
      const pub  = publicRes.count  || 0;
      const cust = customRes.count  || 0;
      setStats({
        public: pub, custom: cust, totalAll: pub + cust,
        taco: tacoRes.count  || 0,
        tbca: tbcaRes.count  || 0,
        tucunduva: tucRes.count   || 0,
        usda: usdaRes.count  || 0,
        nello: nelloRes.count || 0,
      });
    } finally {
      setStatsLoading(false);
    }
  }, [user?.id]);

  // ── Foods query ──────────────────────────────────────────────────────────
  const fetchFoods = useCallback(async (pg = 0) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const offset = pg * ITEMS_PER_PAGE;
      let q = supabase
        .from('foods')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .order('name', { ascending: true })
        .range(offset, offset + ITEMS_PER_PAGE - 1);

      // Filtro de fonte
      if (isCustom) {
        q = q.or(`source.eq.custom,nutritionist_id.eq.${user.id}`);
      } else {
        q = q.neq('source', 'custom').is('nutritionist_id', null);
        const tab = SOURCE_TABS.find(t => t.id === activeSource);
        if (tab?.publicSource) q = q.eq('source', tab.publicSource);
      }

      // Busca textual
      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim();
        q = q.or(`name.ilike.%${s}%,group.ilike.%${s}%,description.ilike.%${s}%`);
      }

      // Grupos alimentares (OR entre os selecionados)
      if (groupFilters.length > 0) {
        const orParts = groupFilters.map(g => `group.ilike.%${g}%`).join(',');
        q = q.or(orParts);
      }

      // Faixa calórica — coluna: calories
      const calRange = CAL_RANGES.find(r => r.id === calFilter);
      if (calRange) {
        if (calRange.min != null) q = q.gte('calories', calRange.min);
        if (calRange.max != null) q = q.lt('calories', calRange.max);
      }

      // Filtro de macro dominante
      if (macroFilter === 'protein') q = q.gte('protein', 15);
      if (macroFilter === 'carbs')   q = q.gte('carbs', 40);
      if (macroFilter === 'fat')     q = q.gte('fat', 15);
      if (macroFilter === 'fiber')   q = q.gte('fiber', 5);

      const { data, error, count } = await q;
      if (error) throw error;
      setFoods(data || []);
      setTotal(count || 0);
    } catch (err) {
      toast({ title: 'Erro ao buscar alimentos', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeSource, isCustom, debouncedSearch, groupFilters, calFilter, macroFilter, toast]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { setPage(0); fetchFoods(0); }, [activeSource, debouncedSearch, groupFilters, calFilter, macroFilter]);

  const handlePageChange = (p) => { setPage(p); fetchFoods(p); };

  const handleDeleteConfirm = async () => {
    if (!foodToDelete) return;
    const { error } = await supabase.from('foods').delete().eq('id', foodToDelete.id);
    if (error) { toast({ title: 'Erro ao excluir', variant: 'destructive' }); return; }
    toast({ title: 'Alimento excluído' });
    setDeleteOpen(false); setFoodToDelete(null);
    fetchFoods(0); fetchStats();
  };

  const handleCreateSuccess = () => { setCreateOpen(false); fetchFoods(0); fetchStats(); };
  const handleEditSuccess   = () => { setEditOpen(false); setFoodToEdit(null); fetchFoods(0); fetchStats(); };

  const columns = useMemo(() => {
    const mid = Math.ceil(foods.length / 2);
    return [foods.slice(0, mid), foods.slice(mid)];
  }, [foods]);

  const clearFilters = () => { setGroupFilters([]); setCalFilter(null); setMacroFilter(null); };
  const toggleGroup = (g) => setGroupFilters(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Database className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            Banco de Alimentos
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Pesquise alimentos nas principais tabelas e crie seus próprios itens.
        </p>
      </div>

      {/* ── Stats Cards (3) ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="border-slate-200 hover:border-slate-300 transition-colors">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Banco Público</p>
                <p className="text-3xl font-black text-slate-800 mt-1 leading-none">
                  {statsLoading ? '…' : stats.public.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-slate-400 mt-1.5">TACO · TBCA · USDA · Tucunduva · Nello</p>
              </div>
              <Database className="w-8 h-8 text-slate-300 shrink-0 mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 hover:border-slate-300 transition-colors">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Meus Alimentos</p>
                <p className="text-3xl font-black text-slate-800 mt-1 leading-none">
                  {statsLoading ? '…' : stats.custom}
                </p>
                <p className="text-xs text-slate-400 mt-1.5">criados por você</p>
              </div>
              <Package className="w-8 h-8 text-slate-300 shrink-0 mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 hover:border-slate-300 transition-colors">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Total no banco</p>
                <p className="text-3xl font-black text-slate-800 mt-1 leading-none">
                  {statsLoading ? '…' : stats.totalAll.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-slate-400 mt-1.5">alimentos disponíveis</p>
              </div>
              <BookOpen className="w-8 h-8 text-slate-300 shrink-0 mt-0.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        {/* Busca */}
        <div className="relative flex-1 w-full sm:w-auto">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar por nome, grupo ou descrição..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Botão de filtros combinados */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={`gap-2 border-slate-200 bg-white ${activeFilterCount > 0 ? 'border-blue-400 text-blue-700' : ''}`}>
              <SlidersHorizontal className="w-4 h-4" />
              Filtros
              {activeFilterCount > 0 && (
                <Badge className="bg-blue-600 text-white text-xs px-1.5 py-0 h-4 min-w-4 rounded-full">
                  {activeFilterCount}
                </Badge>
              )}
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Filtros avançados</span>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  Limpar tudo
                </button>
              )}
            </div>

            {/* Faixa calórica */}
            <div className="p-3 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Faixa calórica</p>
              <div className="flex gap-1 flex-wrap">
                {CAL_RANGES.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setCalFilter(prev => prev === r.id ? null : r.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      calFilter === r.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                    }`}
                    title={r.desc}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Macro dominante */}
            <div className="p-3 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Perfil nutricional</p>
              <div className="flex gap-1 flex-wrap">
                {MACRO_FILTERS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setMacroFilter(prev => prev === m.id ? null : m.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      macroFilter === m.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                    }`}
                    title={m.desc}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grupo alimentar */}
            <div className="p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Grupo alimentar {groupFilters.length > 0 && `(${groupFilters.length})`}
              </p>
              <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                {FOOD_GROUPS.map(g => (
                  <button
                    key={g}
                    onClick={() => toggleGroup(g)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      groupFilters.includes(g)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
          <Plus className="w-4 h-4 mr-1.5" /> Novo Alimento
        </Button>
      </div>

      {/* Chips de filtros ativos */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-slate-500">{total.toLocaleString('pt-BR')} resultado{total !== 1 ? 's' : ''}:</span>
          {calFilter && (
            <button onClick={() => setCalFilter(null)}
              className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full hover:bg-blue-100">
              {CAL_RANGES.find(r => r.id === calFilter)?.label} <X className="w-3 h-3" />
            </button>
          )}
          {macroFilter && (
            <button onClick={() => setMacroFilter(null)}
              className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full hover:bg-blue-100">
              {MACRO_FILTERS.find(m => m.id === macroFilter)?.label} <X className="w-3 h-3" />
            </button>
          )}
          {groupFilters.map(g => (
            <button key={g} onClick={() => toggleGroup(g)}
              className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full hover:bg-blue-100">
              {g} <X className="w-3 h-3" />
            </button>
          ))}
          <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-slate-600 underline ml-1">
            Limpar todos
          </button>
        </div>
      )}

      {/* ── Tabs de fonte ────────────────────────────────────────────────── */}
      <div className="flex gap-1 flex-wrap bg-slate-100 p-1 rounded-xl mb-5">
        {SOURCE_TABS.map(tab => {
          // Determina contagem a mostrar ao lado do label
          const countMap = {
            all: stats.totalAll,
            TACO: stats.taco,
            TBCA: stats.tbca,
            TUCUNDUVA: stats.tucunduva,
            USDA: stats.usda,
            Nello: stats.nello,
            custom: stats.custom,
          };
          const count = countMap[tab.id];
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveSource(tab.id); setPage(0); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                activeSource === tab.id
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
              }`}
            >
              {tab.label}
              {!statsLoading && count != null && (
                <span className={`text-xs ${
                  activeSource === tab.id ? 'text-blue-500' : 'text-slate-400'
                }`}>
                  ({count.toLocaleString('pt-BR')})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Resultados ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
        </div>
      ) : foods.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center flex flex-col items-center">
          <Database className="w-12 h-12 text-slate-200 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-1">Nenhum alimento encontrado</h3>
          <p className="text-sm text-slate-400 max-w-sm mb-5">
            {searchTerm ? `Nenhum resultado para "${searchTerm}".` : 'Tente ajustar os filtros ou a tabela selecionada.'}
          </p>
          {isCustom && (
            <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" /> Criar meu primeiro alimento
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-5">
            {columns.map((col, ci) => (
              <div key={ci} className="space-y-1.5">
                {col.map(food => (
                  <FoodCardHorizontal
                    key={food.id}
                    food={food}
                    isCustom={isCustom || food.source === 'custom'}
                    onView={f => { setSelectedFood(f); setDetailsOpen(true); }}
                    onEdit={isCustom ? f => { setFoodToEdit(f); setEditOpen(true); } : undefined}
                    onDelete={isCustom ? f => { setFoodToDelete(f); setDeleteOpen(true); } : undefined}
                  />
                ))}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4 border-t border-slate-100">
              <p className="text-sm text-slate-500">
                Página {page + 1} de {totalPages} · {total.toLocaleString('pt-BR')} alimentos
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handlePageChange(Math.max(0, page - 1))} disabled={page === 0}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages - 1}>
                  Próxima <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <FoodDetailsDialog food={selectedFood} open={detailsOpen} onOpenChange={setDetailsOpen} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Novo Alimento Personalizado</DialogTitle>
            <DialogDescription>Crie um alimento com busca por código de barras e cálculo automático de macros.</DialogDescription>
          </DialogHeader>
          <SmartFoodForm mode="full" onSuccess={handleCreateSuccess} />
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Alimento</DialogTitle>
            <DialogDescription>Edite as informações nutricionais e medidas caseiras.</DialogDescription>
          </DialogHeader>
          {foodToEdit && <SmartFoodForm mode="full" initialData={foodToEdit} onSuccess={handleEditSuccess} />}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir alimento?</DialogTitle>
            <DialogDescription>
              <strong>"{foodToDelete?.name}"</strong> será excluído permanentemente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setFoodToDelete(null); }}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>Excluir</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
