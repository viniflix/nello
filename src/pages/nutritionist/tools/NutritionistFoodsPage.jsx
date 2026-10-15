import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, Edit, Loader2, Database, Plus, Package } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { searchFoodsPaginated, getFoodMeasures } from '@/lib/supabase/foodService';
import { useDebounce } from '@/hooks/useDebounce';
import FoodMeasureManager from '@/components/nutritionist/FoodMeasureManager';
import SmartFoodForm from '@/components/nutrition/SmartFoodForm';
import { supabase } from '@/infrastructure/supabase/client';
import { SimpleListSkeleton } from '@/components/ui/custom-skeletons';
import { formatNutrient } from '@/lib/utils';
import { failurePresentation } from '@/lib/utils/failure';
import { ResourceStatus } from '@/components/ui/resource-status';

/**
 * NutritionistFoodsPage - Gerenciar Alimentos e Medidas Caseiras
 *
 * Permite ao nutricionista:
 * - Buscar alimentos no banco de dados
 * - Editar medidas caseiras de cada alimento
 */
export default function NutritionistFoodsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [stats, setStats] = useState({ total: 0, custom: 0 });
  const observerTarget = useRef(null);
  const editTriggerRef = useRef(null);
  const createTriggerRef = useRef(null);
  const loadMoreTriggerRef = useRef(null);
  const appendFocusRef = useRef(false);
  const appendReturnFocusRef = useRef(null);
  const resultsContainerRef = useRef(null);
  const statusContainerRef = useRef(null);
  const restoreDialogFocus = (event, trigger) => {
    if (trigger?.isConnected) {
      event.preventDefault();
      trigger.focus();
    }
  };
  const searchOwner = useRef({ generation: 0, controller: null, busy: false, term: null });
  const currentTerm = useRef(searchTerm); currentTerm.current = searchTerm;
  const alive = useRef(true);
  const [searchError, setSearchError] = useState(null);
  useEffect(() => {
    alive.current = true;
    const owner = searchOwner.current;
    return () => { alive.current = false; owner.generation += 1; owner.controller?.abort(); };
  }, []);
  useEffect(() => {
    const owner = searchOwner.current;
    if (owner.term !== searchTerm) {
      owner.generation += 1; owner.controller?.abort(); owner.busy = false;
      setLoading(false); setLoadingMore(false); setSearchError(null);
    }
  }, [searchTerm]);

  // Debounce search term (500ms)
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // Fetch stats (total foods, custom foods)
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [totalResult, customResult] = await Promise.all([
          supabase.from('foods').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('foods').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('source', 'custom')
        ]);
        setStats({
          total: totalResult.count || 0,
          custom: customResult.count || 0
        });
      } catch (error) {
        logDiagnostic('error', 'pages/nutritionist/tools/NutritionistFoodsPage.jsx:63', 'Erro ao buscar estatísticas:', error);
      }
    };
    fetchStats();
  }, []);

  // Search foods with pagination
  const handleSearchFoods = useCallback(async (targetPage = 0, append = false) => {
    const owner = searchOwner.current;
    if (debouncedSearchTerm !== currentTerm.current || (append && owner.busy)) return;
    owner.controller?.abort();
    const controller = new AbortController(), generation = ++owner.generation;
    owner.controller = controller; owner.term = debouncedSearchTerm; owner.busy = true;
    const current = () => alive.current && generation === owner.generation
      && debouncedSearchTerm === currentTerm.current && !controller.signal.aborted;
    setSearchError(null);
    if (!debouncedSearchTerm.trim() || debouncedSearchTerm.length < 2) {
      setFoods([]);
      setHasMore(false);
      owner.busy = false; setLoading(false); setLoadingMore(false);
      return;
    }

    const isLoadingMore = append && targetPage > 0;

    if (isLoadingMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const result = await searchFoodsPaginated(debouncedSearchTerm, targetPage, null, { signal: controller.signal });
      if (!current()) return;

      if (append) {
        setFoods(prev => [...prev, ...result.data]);
      } else {
        setFoods(result.data);
      }

      setHasMore(result.hasMore);
      setPage(targetPage);
    } catch (error) {
      if (!current()) return;
      const failure = failurePresentation(error);
      if (failure.kind === 'aborted') return;
      setSearchError({ failure, targetPage, append });
      logDiagnostic('error', 'pages/nutritionist/tools/NutritionistFoodsPage.jsx:96', 'Erro ao buscar alimentos:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível buscar alimentos.',
        variant: 'destructive'
      });
      if (['unauthenticated', 'forbidden'].includes(failure.kind)) {
        setFoods([]);
        setHasMore(false);
      }
    } finally {
      if (current()) { owner.busy = false; setLoading(false); setLoadingMore(false); }
    }
  }, [debouncedSearchTerm, toast]);

  // Reset and search when debounced term changes
  useEffect(() => {
    setPage(0);
    setFoods([]);
    if (debouncedSearchTerm.trim().length >= 2) {
      handleSearchFoods(0, false);
    } else {
      setFoods([]);
      setHasMore(false);
    }
  }, [debouncedSearchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load more function
  const loadMore = useCallback(() => {
    if (hasMore && !loading && !loadingMore && !searchError) {
      appendFocusRef.current = document.activeElement === loadMoreTriggerRef.current;
      appendReturnFocusRef.current = [...(resultsContainerRef.current?.querySelectorAll('button[aria-haspopup="dialog"]') || [])].at(-1);
      const nextPage = page + 1;
      handleSearchFoods(nextPage, true);
    }
  }, [hasMore, loading, loadingMore, searchError, page, handleSearchFoods]);

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
      observer.disconnect();
    };
  }, [loadMore]);

  const handleEditFood = async (food, trigger) => {
    editTriggerRef.current = trigger;
    try {
      const measures = await getFoodMeasures(food.id);
      setSelectedFood({ ...food, food_measures: measures });
      setEditDialogOpen(true);
    } catch {
      toast({ title: 'Erro ao carregar medidas', description: 'Tente novamente antes de editar o alimento.', variant: 'destructive' });
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedFood(null);
    // Refresh search to get updated measures
    if (debouncedSearchTerm.trim().length >= 2) {
      handleSearchFoods(0, false);
    }
  };

  const handleCreateSuccess = (food) => {
    setCreateDialogOpen(false);
    toast({
      title: 'Sucesso!',
      description: 'Alimento criado com sucesso.',
    });
    // Refresh stats
    const fetchStats = async () => {
      try {
        const [totalResult, customResult] = await Promise.all([
          supabase.from('foods').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('foods').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('source', 'custom')
        ]);
        setStats({
          total: totalResult.count || 0,
          custom: customResult.count || 0
        });
      } catch (error) {
        logDiagnostic('error', 'pages/nutritionist/tools/NutritionistFoodsPage.jsx:193', 'Erro ao atualizar estatísticas:', error);
      }
    };
    fetchStats();
  };

  const handleEditSuccess = (food) => {
    setEditDialogOpen(false);
    setSelectedFood(null);
    toast({
      title: 'Sucesso!',
      description: 'Alimento atualizado com sucesso.',
    });
    // Refresh search
    if (debouncedSearchTerm.trim().length >= 2) {
      handleSearchFoods(0, false);
    }
  };

  const waitingForTerm = searchTerm !== debouncedSearchTerm && searchTerm.trim().length >= 2;
  const visibleFoods = searchTerm === debouncedSearchTerm ? foods : [];
  const appendFailure = searchError?.append && visibleFoods.length > 0;
  useEffect(() => {
    if (loadingMore || !appendFocusRef.current) return;
    appendFocusRef.current = false;
    if (document.activeElement === document.body || document.activeElement === loadMoreTriggerRef.current
      || document.activeElement === statusContainerRef.current?.querySelector('button')) {
      if (appendFailure) statusContainerRef.current?.querySelector('button')?.focus();
      else if (appendReturnFocusRef.current?.isConnected) appendReturnFocusRef.current.focus({ preventScroll: true });
    }
    appendReturnFocusRef.current = null;
  }, [appendFailure, loadingMore]);
  const searchStatus = <div ref={statusContainerRef}><ResourceStatus resource={{ error: searchError?.failure, hasSnapshot: visibleFoods.length > 0,
    pending: loading || loadingMore || waitingForTerm, refreshing: loading && visibleFoods.length > 0 }}
    label="alimentos" onRetry={searchError ? () => {
      if (searchError.append) {
        appendFocusRef.current = document.activeElement === statusContainerRef.current?.querySelector('button');
        appendReturnFocusRef.current = [...(resultsContainerRef.current?.querySelectorAll('button[aria-haspopup="dialog"]') || [])].at(-1);
      }
      handleSearchFoods(searchError.targetPage, searchError.append);
    } : undefined} /></div>;

  return (
    <div className="flex flex-col min-h-dvh bg-background overflow-x-hidden">
      <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-4 md:py-8 space-y-6 min-w-0">
        {/* Header */}
        <div className="mb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 min-w-0">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <Database className="w-7 h-7 md:w-8 md:h-8 text-primary shrink-0" />
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground break-words">Admin: Alimentos</h1>
                <span className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium mt-1">
                  Administrador
                </span>
              </div>
            </div>
            <Button onClick={(event) => { createTriggerRef.current = event.currentTarget; setCreateDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Alimento
            </Button>
          </div>
          <p className="text-muted-foreground mt-2">
            Busque e gerencie alimentos e medidas caseiras (Backoffice)
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total de Alimentos</p>
                  <p className="text-2xl font-bold mt-1">{stats.total.toLocaleString()}</p>
                </div>
                <Package className="w-8 h-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Alimentos Personalizados</p>
                  <p className="text-2xl font-bold mt-1">{stats.custom.toLocaleString()}</p>
                </div>
                <Database className="w-8 h-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input
                aria-label="Buscar alimentos"
                placeholder="Buscar alimento (ex: Arroz, Abacate, Frango)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {searchTerm.length > 0 && searchTerm.length < 2 && (
              <p className="text-xs text-muted-foreground mt-2">
                Digite pelo menos 2 caracteres para buscar
              </p>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {searchTerm.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {!appendFailure && searchStatus}
            {(loading || waitingForTerm) && visibleFoods.length === 0 ? (
              <div className="space-y-4">
                <SimpleListSkeleton />
              </div>
            ) : visibleFoods.length === 0 && !searchError ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Nenhum alimento encontrado para "{searchTerm}"
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div ref={resultsContainerRef} className="space-y-3">
                {visibleFoods.map((food) => (
                  <motion.div
                    key={food.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg text-foreground mb-1 break-words">
                              {food.name}
                            </h3>
                            {food.group && (
                              <p className="text-sm text-muted-foreground mb-2">
                                {food.group}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                              <span>{formatNutrient(food.calories)} kcal/100g</span>
                              <span>P: {formatNutrient(food.protein)}g</span>
                              <span>C: {formatNutrient(food.carbs)}g</span>
                              <span>G: {formatNutrient(food.fat)}g</span>
                            </div>
                            {food.food_measures && food.food_measures.length > 0 && (
                              <div className="mt-3 pt-3 border-t">
                                <p className="text-xs font-medium text-muted-foreground mb-2">
                                  Medidas cadastradas:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {food.food_measures.map((measure) => (
                                    <span
                                      key={measure.id}
                                      className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium"
                                    >
                                      {measure.measure_label} ({measure.quantity_grams}g)
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                          aria-haspopup="dialog" onClick={(event) => handleEditFood(food, event.currentTarget)}
                            className="flex-shrink-0"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}

                {appendFailure && searchStatus}

                {/* Infinite scroll trigger */}
                {hasMore && !searchError && (
                  <div ref={observerTarget} className="py-4 text-center">
                    <Button ref={loadMoreTriggerRef} variant="ghost" size="sm" onClick={loadMore}
                      aria-disabled={loadingMore || undefined} aria-busy={loadingMore || undefined}
                      className={loadingMore ? 'pointer-events-none opacity-60' : undefined}>
                      {loadingMore && <Loader2 aria-hidden="true" className="mr-2 w-4 h-4 animate-spin" />}
                      <span aria-live="polite">{loadingMore ? 'Carregando mais...' : 'Carregar mais'}</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Empty State - No search */}
        {searchTerm.length < 2 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Database className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Digite o nome de um alimento para começar a buscar
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Food Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent onCloseAutoFocus={(event) => restoreDialogFocus(event, createTriggerRef.current)} className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Novo Alimento
            </DialogTitle>
            <DialogDescription>
              Crie um alimento customizado com busca por código de barras e cálculo automático
            </DialogDescription>
          </DialogHeader>
          <SmartFoodForm
            mode="full"
            onSuccess={handleCreateSuccess}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Food Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent onCloseAutoFocus={(event) => restoreDialogFocus(event, editTriggerRef.current)} className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Editar Alimento
            </DialogTitle>
            <DialogDescription>
              Edite as informações nutricionais e medidas caseiras
            </DialogDescription>
          </DialogHeader>
          {selectedFood && (
            <SmartFoodForm
              mode="full"
              initialData={selectedFood}
              onSuccess={handleEditSuccess}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Food Measure Manager Dialog (Legacy - for quick measure editing) */}
      {selectedFood && (
        <FoodMeasureManager
          food={selectedFood}
          isOpen={dialogOpen}
          onClose={handleDialogClose}
        />
      )}
    </div>
  );
}

