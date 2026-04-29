import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Plus, Database, Package, Loader2, X, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FoodCardHorizontal from '@/components/nutrition/FoodCardHorizontal';
import FoodDetailsDialog from '@/components/nutrition/FoodDetailsDialog';
import SmartFoodForm from '@/components/nutrition/SmartFoodForm';
import { useDebounce } from '@/hooks/useDebounce';

const ITEMS_PER_PAGE = 20;

// Fonte → valor usado na query
const SOURCE_TABS = [
  { id: 'all',        label: 'Todos',           publicSource: null },
  { id: 'TACO',       label: 'TACO',            publicSource: 'TACO' },
  { id: 'TBCA',       label: 'TBCA',            publicSource: 'TBCA' },
  { id: 'Tucunduva',  label: 'Tucunduvá',       publicSource: 'Tucunduva' },
  { id: 'USDA',       label: 'USDA',            publicSource: 'USDA' },
  { id: 'IBGE',       label: 'IBGE',            publicSource: 'IBGE' },
  { id: 'custom',     label: 'Meus Alimentos',  publicSource: null },
];

// Grupos alimentares comuns para filtro rápido
const FOOD_GROUPS = [
  'Todos os grupos', 'Carnes e derivados', 'Leite e derivados', 'Cereais e derivados',
  'Leguminosas', 'Frutas', 'Verduras e Hortaliças', 'Gorduras e óleos',
  'Bebidas', 'Açúcares e produtos de confeitaria', 'Ovos', 'Pescados',
  'Alimentos preparados', 'Outros',
];

// Badge de caloria colorido
const CalorieBadge = ({ kcal }) => {
  if (!kcal) return null;
  const color = kcal < 50 ? 'text-green-700 bg-green-50 border-green-200'
    : kcal < 150 ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
    : kcal < 300 ? 'text-orange-700 bg-orange-50 border-orange-200'
    : 'text-red-700 bg-red-50 border-red-200';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${color}`}>
      {Math.round(kcal)} kcal/100g
    </span>
  );
};

export default function FoodBankSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [activeSource, setActiveSource] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('Todos os grupos');
  const [calFilter, setCalFilter] = useState('all');

  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const [stats, setStats] = useState({ custom: 0, public: 0, taco: 0, tbca: 0, usda: 0, ibge: 0, tucunduva: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  const [selectedFood, setSelectedFood] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [foodToEdit, setFoodToEdit] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [foodToDelete, setFoodToDelete] = useState(null);

  const debouncedSearch = useDebounce(searchTerm, 300);
  const isCustom = activeSource === 'custom';
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!user?.id) return;
    setStatsLoading(true);
    try {
      const [customRes, publicRes, tacoRes, tbcaRes, usdaRes, ibgeRes, tucRes] = await Promise.all([
        supabase.from('foods').select('id', { count: 'exact', head: true }).eq('is_active', true).or(`source.eq.custom,nutritionist_id.eq.${user.id}`),
        supabase.from('foods').select('id', { count: 'exact', head: true }).eq('is_active', true).neq('source', 'custom').is('nutritionist_id', null),
        supabase.from('foods').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('source', 'TACO').is('nutritionist_id', null),
        supabase.from('foods').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('source', 'TBCA').is('nutritionist_id', null),
        supabase.from('foods').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('source', 'USDA').is('nutritionist_id', null),
        supabase.from('foods').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('source', 'IBGE').is('nutritionist_id', null),
        supabase.from('foods').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('source', 'Tucunduva').is('nutritionist_id', null),
      ]);
      setStats({
        custom: customRes.count || 0,
        public: publicRes.count || 0,
        taco: tacoRes.count || 0,
        tbca: tbcaRes.count || 0,
        usda: usdaRes.count || 0,
        ibge: ibgeRes.count || 0,
        tucunduva: tucRes.count || 0,
      });
    } finally {
      setStatsLoading(false);
    }
  }, [user?.id]);

  // ── Foods query ────────────────────────────────────────────────────────────
  const fetchFoods = useCallback(async (pg = 0) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const offset = pg * ITEMS_PER_PAGE;
      let query = supabase
        .from('foods')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .order('name', { ascending: true })
        .range(offset, offset + ITEMS_PER_PAGE - 1);

      // Filtro por fonte
      if (isCustom) {
        query = query.or(`source.eq.custom,nutritionist_id.eq.${user.id}`);
      } else {
        query = query.neq('source', 'custom').is('nutritionist_id', null);
        const tab = SOURCE_TABS.find(t => t.id === activeSource);
        if (tab?.publicSource) query = query.eq('source', tab.publicSource);
      }

      // Busca por texto
      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim();
        query = query.or(`name.ilike.%${s}%,group.ilike.%${s}%,description.ilike.%${s}%`);
      }

      // Filtro por grupo alimentar
      if (groupFilter && groupFilter !== 'Todos os grupos') {
        query = query.ilike('group', `%${groupFilter}%`);
      }

      // Filtro por calorias
      if (calFilter === 'low')    query = query.lt('kcal', 100);
      if (calFilter === 'mid')    query = query.gte('kcal', 100).lt('kcal', 250);
      if (calFilter === 'high')   query = query.gte('kcal', 250);

      const { data, error, count } = await query;
      if (error) throw error;
      setFoods(data || []);
      setTotal(count || 0);
    } catch (err) {
      toast({ title: 'Erro ao buscar alimentos', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeSource, isCustom, debouncedSearch, groupFilter, calFilter, toast]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { setPage(0); fetchFoods(0); }, [activeSource, debouncedSearch, groupFilter, calFilter]);

  const handlePageChange = (newPage) => { setPage(newPage); fetchFoods(newPage); };

  const handleDeleteConfirm = async () => {
    if (!foodToDelete) return;
    const { error } = await supabase.from('foods').delete().eq('id', foodToDelete.id);
    if (error) { toast({ title: 'Erro ao excluir', variant: 'destructive' }); return; }
    toast({ title: 'Alimento excluído com sucesso' });
    setDeleteOpen(false); setFoodToDelete(null);
    fetchFoods(0); fetchStats();
  };

  const handleCreateSuccess = () => { setCreateOpen(false); fetchFoods(0); fetchStats(); };
  const handleEditSuccess = () => { setEditOpen(false); setFoodToEdit(null); fetchFoods(0); fetchStats(); };

  // Split 2 colunas
  const columns = useMemo(() => {
    const mid = Math.ceil(foods.length / 2);
    return [foods.slice(0, mid), foods.slice(mid)];
  }, [foods]);

  return (
    <>
      {/* ── Stats Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="border-slate-200">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 font-medium">Alimentos Públicos</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{statsLoading ? '…' : stats.public.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-slate-400 mt-1">TACO · TBCA · USDA · IBGE</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 font-medium">Meus Alimentos</p>
            <p className="text-2xl font-bold text-emerald-700 mt-0.5">{statsLoading ? '…' : stats.custom}</p>
            <p className="text-xs text-slate-400 mt-1">personalizados por você</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 font-medium">TACO</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{statsLoading ? '…' : stats.taco.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-slate-400 mt-1">UNICAMP</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 font-medium">TBCA · USDA · IBGE</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">
              {statsLoading ? '…' : (stats.tbca + stats.usda + stats.ibge + stats.tucunduva).toLocaleString('pt-BR')}
            </p>
            <p className="text-xs text-slate-400 mt-1">outras tabelas</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Toolbar: Busca + Filtros ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por nome, grupo ou descrição..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-full sm:w-52">
            <SlidersHorizontal className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
            <SelectValue placeholder="Grupo alimentar" />
          </SelectTrigger>
          <SelectContent>
            {FOOD_GROUPS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={calFilter} onValueChange={setCalFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Faixa calórica" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as calorias</SelectItem>
            <SelectItem value="low">Baixa caloria (&lt;100 kcal)</SelectItem>
            <SelectItem value="mid">Moderada (100–250 kcal)</SelectItem>
            <SelectItem value="high">Alta caloria (≥250 kcal)</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
          <Plus className="w-4 h-4 mr-2" /> Novo Alimento
        </Button>
      </div>

      {/* Filtro ativo */}
      {(searchTerm || groupFilter !== 'Todos os grupos' || calFilter !== 'all') && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Badge variant="outline" className="text-slate-600">
            {total} resultado{total !== 1 ? 's' : ''}
          </Badge>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500"
            onClick={() => { setSearchTerm(''); setGroupFilter('Todos os grupos'); setCalFilter('all'); }}>
            <X className="w-3 h-3 mr-1" /> Limpar filtros
          </Button>
        </div>
      )}

      {/* ── Tabs de fonte ────────────────────────────────────────────────── */}
      <div className="flex gap-1 flex-wrap bg-slate-100 p-1 rounded-xl mb-6">
        {SOURCE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveSource(tab.id); setPage(0); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
              activeSource === tab.id
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            {tab.label}
            {tab.id === 'all' && !statsLoading && (
              <span className="text-xs text-slate-400">({(stats.public + stats.custom).toLocaleString('pt-BR')})</span>
            )}
            {tab.id === 'custom' && !statsLoading && (
              <span className="text-xs text-slate-400">({stats.custom})</span>
            )}
            {tab.id === 'TACO' && !statsLoading && (
              <span className="text-xs text-slate-400">({stats.taco.toLocaleString('pt-BR')})</span>
            )}
            {tab.id === 'TBCA' && !statsLoading && (
              <span className="text-xs text-slate-400">({stats.tbca.toLocaleString('pt-BR')})</span>
            )}
            {tab.id === 'USDA' && !statsLoading && (
              <span className="text-xs text-slate-400">({stats.usda.toLocaleString('pt-BR')})</span>
            )}
            {tab.id === 'IBGE' && !statsLoading && (
              <span className="text-xs text-slate-400">({stats.ibge.toLocaleString('pt-BR')})</span>
            )}
            {tab.id === 'Tucunduva' && !statsLoading && (
              <span className="text-xs text-slate-400">({stats.tucunduva.toLocaleString('pt-BR')})</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Resultados ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
        </div>
      ) : foods.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center flex flex-col items-center">
          <Database className="w-12 h-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-1">Nenhum alimento encontrado</h3>
          <p className="text-sm text-slate-400 max-w-sm mb-5">
            {searchTerm ? `Nenhum resultado para "${searchTerm}".` : 'Tente ajustar os filtros.'}
          </p>
          {isCustom && (
            <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" /> Criar meu primeiro alimento
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {columns.map((col, ci) => (
              <div key={ci} className="space-y-2">
                {col.map(food => (
                  <div key={food.id} className="relative">
                    <FoodCardHorizontal
                      food={food}
                      isCustom={isCustom || food.source === 'custom'}
                      onView={f => { setSelectedFood(f); setDetailsOpen(true); }}
                      onEdit={isCustom ? f => { setFoodToEdit(f); setEditOpen(true); } : undefined}
                      onDelete={isCustom ? f => { setFoodToDelete(f); setDeleteOpen(true); } : undefined}
                    />
                    {/* Calorie badge overlay */}
                    <div className="absolute top-2 right-2 pointer-events-none">
                      <CalorieBadge kcal={food.kcal} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Paginação */}
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
              O alimento <strong>"{foodToDelete?.name}"</strong> será excluído permanentemente. Esta ação não pode ser desfeita.
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
