import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, Filter, Database, Package, Loader2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription 
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import FoodCardHorizontal from '@/components/nutrition/FoodCardHorizontal';
import FoodDetailsDialog from '@/components/nutrition/FoodDetailsDialog';
import SmartFoodForm from '@/components/nutrition/SmartFoodForm';
import { useDebounce } from '@/hooks/useDebounce';

const ITEMS_PER_PAGE = 20;

const FoodBankPage = () => {
    const { user } = useAuth();
    const { toast } = useToast();
    
    // State
    const [customFoods, setCustomFoods] = useState([]);
    const [publicFoods, setPublicFoods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [selectedFood, setSelectedFood] = useState(null);
    const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [foodToEdit, setFoodToEdit] = useState(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [foodToDelete, setFoodToDelete] = useState(null);
    
    // Pagination state
    const [customPage, setCustomPage] = useState(0);
    const [publicPage, setPublicPage] = useState(0);
    const [customTotal, setCustomTotal] = useState(0);
    const [publicTotal, setPublicTotal] = useState(0);
    const [loadingCustom, setLoadingCustom] = useState(false);
    const [loadingPublic, setLoadingPublic] = useState(false);
    
    // Debounce search
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    // Source options
    const sourceOptions = [
        { value: 'all', label: 'Todas as Fontes' },
        { value: 'custom', label: 'Meus Alimentos Personalizados' },
        { value: 'TACO', label: 'TACO' },
        { value: 'IBGE', label: 'IBGE' },
        { value: 'USDA', label: 'USDA' },
        { value: 'Tucunduva', label: 'Tucunduva' },
        { value: 'TBCA', label: 'TBCA' }
    ];

    // Fetch custom foods with pagination
    const fetchCustomFoods = useCallback(async (page = 0, append = false) => {
        if (sourceFilter !== 'all' && sourceFilter !== 'custom') {
            if (!append) {
                setCustomFoods([]);
                setCustomTotal(0);
            }
            return;
        }

        setLoadingCustom(true);
        try {
            const offset = page * ITEMS_PER_PAGE;
            let query = supabase
                .from('foods')
                .select('*, food_measures(*)', { count: 'exact' })
                .eq('is_active', true)
                .or(`source.eq.custom,nutritionist_id.eq.${user.id}`)
                .order('name', { ascending: true })
                .range(offset, offset + ITEMS_PER_PAGE - 1);

            // Apply search filter
            if (debouncedSearchTerm.trim()) {
                const searchLower = debouncedSearchTerm.toLowerCase();
                query = query.or(`name.ilike.%${searchLower}%,group.ilike.%${searchLower}%,description.ilike.%${searchLower}%`);
            }

            const { data, error, count } = await query;

            if (error) throw error;

            if (append) {
                setCustomFoods(prev => [...prev, ...(data || [])]);
            } else {
                setCustomFoods(data || []);
            }
            setCustomTotal(count || 0);
        } catch (error) {
            console.error('Erro ao buscar alimentos personalizados:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível carregar os alimentos personalizados.',
                variant: 'destructive'
            });
        } finally {
            setLoadingCustom(false);
        }
    }, [user.id, debouncedSearchTerm, sourceFilter, toast]);

    // Fetch public foods with pagination
    const fetchPublicFoods = useCallback(async (page = 0, append = false) => {
        if (sourceFilter === 'custom') {
            if (!append) {
                setPublicFoods([]);
                setPublicTotal(0);
            }
            return;
        }

        setLoadingPublic(true);
        try {
            const offset = page * ITEMS_PER_PAGE;
            let query = supabase
                .from('foods')
                .select('*, food_measures(*)', { count: 'exact' })
                .eq('is_active', true)
                .neq('source', 'custom')
                .is('nutritionist_id', null)
                .order('name', { ascending: true })
                .range(offset, offset + ITEMS_PER_PAGE - 1);

            // Apply source filter
            if (sourceFilter !== 'all') {
                query = query.eq('source', sourceFilter);
            }

            // Apply search filter
            if (debouncedSearchTerm.trim()) {
                const searchLower = debouncedSearchTerm.toLowerCase();
                query = query.or(`name.ilike.%${searchLower}%,group.ilike.%${searchLower}%,description.ilike.%${searchLower}%`);
            }

            const { data, error, count } = await query;

            if (error) throw error;

            if (append) {
                setPublicFoods(prev => [...prev, ...(data || [])]);
            } else {
                setPublicFoods(data || []);
            }
            setPublicTotal(count || 0);
        } catch (error) {
            console.error('Erro ao buscar alimentos públicos:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível carregar os alimentos públicos.',
                variant: 'destructive'
            });
        } finally {
            setLoadingPublic(false);
        }
    }, [debouncedSearchTerm, sourceFilter, toast]);

    // Fetch stats
    const fetchStats = useCallback(async () => {
        try {
            const [customResult, publicResult] = await Promise.all([
                supabase
                    .from('foods')
                    .select('id', { count: 'exact', head: true })
                    .eq('is_active', true)
                    .or(`source.eq.custom,nutritionist_id.eq.${user.id}`),
                supabase
                    .from('foods')
                    .select('id', { count: 'exact', head: true })
                    .eq('is_active', true)
                    .neq('source', 'custom')
                    .is('nutritionist_id', null)
            ]);
            
            return {
                custom: customResult.count || 0,
                public: publicResult.count || 0
            };
        } catch (error) {
            console.error('Erro ao buscar estatísticas:', error);
            return { custom: 0, public: 0 };
        }
    }, [user.id]);

    const [stats, setStats] = useState({ custom: 0, public: 0 });

    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            const statsData = await fetchStats();
            setStats(statsData);
            await Promise.all([
                fetchCustomFoods(0, false),
                fetchPublicFoods(0, false)
            ]);
            setLoading(false);
        };
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reload when filters change
    useEffect(() => {
        setCustomPage(0);
        setPublicPage(0);
        const reload = async () => {
            await Promise.all([
                fetchCustomFoods(0, false),
                fetchPublicFoods(0, false)
            ]);
        };
        reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearchTerm, sourceFilter]);

    // Handle view details
    const handleViewDetails = (food) => {
        setSelectedFood(food);
        setDetailsDialogOpen(true);
    };

    // Handle edit
    const handleEdit = (food) => {
        setFoodToEdit(food);
        setEditDialogOpen(true);
    };

    // Handle delete
    const handleDeleteClick = (food) => {
        setFoodToDelete(food);
        setDeleteConfirmOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!foodToDelete) return;

        try {
            const { error } = await supabase
                .from('foods')
                .delete()
                .eq('id', foodToDelete.id);

            if (error) throw error;

            toast({
                title: 'Sucesso!',
                description: 'Alimento excluído com sucesso.',
            });

            // Reload data
            setCustomPage(0);
            fetchCustomFoods(0, false);
            const statsData = await fetchStats();
            setStats(statsData);
            setDeleteConfirmOpen(false);
            setFoodToDelete(null);
        } catch (error) {
            console.error('Erro ao excluir alimento:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível excluir o alimento.',
                variant: 'destructive'
            });
        }
    };

    // Handle create success
    const handleCreateSuccess = async () => {
        setCreateDialogOpen(false);
        setCustomPage(0);
        await fetchCustomFoods(0, false);
        const statsData = await fetchStats();
        setStats(statsData);
        toast({
            title: 'Sucesso!',
            description: 'Alimento criado com sucesso.',
        });
    };

    // Handle edit success
    const handleEditSuccess = async () => {
        setEditDialogOpen(false);
        setFoodToEdit(null);
        setCustomPage(0);
        await fetchCustomFoods(0, false);
        const statsData = await fetchStats();
        setStats(statsData);
        toast({
            title: 'Sucesso!',
            description: 'Alimento atualizado com sucesso.',
        });
    };

    // Pagination helpers
    const customTotalPages = Math.ceil(customTotal / ITEMS_PER_PAGE);
    const publicTotalPages = Math.ceil(publicTotal / ITEMS_PER_PAGE);
    const customHasNext = customPage < customTotalPages - 1;
    const customHasPrev = customPage > 0;
    const publicHasNext = publicPage < publicTotalPages - 1;
    const publicHasPrev = publicPage > 0;

    // Split foods into 2 columns
    const splitIntoColumns = (items) => {
        const mid = Math.ceil(items.length / 2);
        return [items.slice(0, mid), items.slice(mid)];
    };

    const customColumns = useMemo(() => splitIntoColumns(customFoods), [customFoods]);
    const publicColumns = useMemo(() => splitIntoColumns(publicFoods), [publicFoods]);

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="max-w-7xl mx-auto w-full px-4 md:px-8 pt-8 pb-12 space-y-6"
            >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3 mb-2">
                            <Database className="w-8 h-8 text-primary" />
                            <h1 className="text-3xl font-bold text-foreground">
                                Banco de Alimentos
                            </h1>
                        </div>
                        <p className="text-muted-foreground">
                            Gerencie seus alimentos personalizados e consulte o banco público de alimentos
                        </p>
                    </div>
                    <Button onClick={() => setCreateDialogOpen(true)} size="lg">
                        <Plus className="w-5 h-5 mr-2" />
                        Novo Alimento
                    </Button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">
                                        Meus Alimentos Personalizados
                                    </p>
                                    <p className="text-3xl font-bold mt-1">{stats.custom}</p>
                                </div>
                                <Package className="w-10 h-10 text-primary opacity-50" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">
                                        Banco de Dados Público
                                    </p>
                                    <p className="text-3xl font-bold mt-1">{stats.public}</p>
                                </div>
                                <Database className="w-10 h-10 text-primary opacity-50" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Search and Filters */}
                <Card>
                    <CardContent className="pt-4 sm:pt-6">
                        <div className="space-y-3 sm:space-y-4">
                            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        placeholder="Buscar alimento por nome, grupo ou descrição..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                    <SelectTrigger className="w-full sm:w-[250px]">
                                        <Filter className="w-4 h-4 mr-2" />
                                        <SelectValue placeholder="Filtrar por fonte" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {sourceOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {searchTerm && (
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline">
                                        {customTotal + publicTotal} resultado(s) encontrado(s)
                                    </Badge>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSearchTerm('')}
                                    >
                                        <X className="w-4 h-4 mr-1" />
                                        Limpar busca
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Results */}
                {loading ? (
                    <Card>
                        <CardContent className="py-12">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">Carregando alimentos...</p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Tabs defaultValue="all" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 h-auto p-1 gap-1">
                            <TabsTrigger value="all" className="text-xs sm:text-sm px-2 sm:px-4 py-2">
                                <span className="hidden sm:inline">Todos</span>
                                <span className="sm:hidden">Todos</span>
                                <span className="ml-1">({customTotal + publicTotal})</span>
                            </TabsTrigger>
                            <TabsTrigger value="custom" className="text-xs sm:text-sm px-2 sm:px-4 py-2">
                                <span className="hidden sm:inline">Meus Alimentos</span>
                                <span className="sm:hidden">Meus</span>
                                <span className="ml-1">({customTotal})</span>
                            </TabsTrigger>
                        </TabsList>

                        {/* Tab: All Foods */}
                        <TabsContent value="all" className="space-y-6 mt-6">
                            {/* Custom Foods Section - Always First */}
                            {(sourceFilter === 'all' || sourceFilter === 'custom') && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Package className="w-5 h-5 text-emerald-600" />
                                            <h2 className="text-xl font-semibold">
                                                Meus Alimentos Personalizados
                                            </h2>
                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                                                {customTotal}
                                            </Badge>
                                        </div>
                                    </div>
                                    
                                    {loadingCustom ? (
                                        <div className="flex justify-center py-8">
                                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                        </div>
                                    ) : customFoods.length === 0 ? (
                                        <Card>
                                            <CardContent className="py-8 text-center">
                                                <p className="text-sm text-muted-foreground">
                                                    Nenhum alimento personalizado encontrado
                                                </p>
                                            </CardContent>
                                        </Card>
                                    ) : (
                                        <>
                                            {/* 2 Column Layout */}
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                {customColumns.map((column, colIndex) => (
                                                    <div key={colIndex} className="space-y-2">
                                                        {column.map((food) => (
                                                            <FoodCardHorizontal
                                                                key={food.id}
                                                                food={food}
                                                                isCustom={true}
                                                                onView={handleViewDetails}
                                                                onEdit={handleEdit}
                                                                onDelete={handleDeleteClick}
                                                            />
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                            
                                            {/* Pagination */}
                                            {customTotalPages > 1 && (
                                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
                                                    <p className="text-xs sm:text-sm text-muted-foreground">
                                                        Página {customPage + 1} de {customTotalPages}
                                                    </p>
                                                    <div className="flex gap-2 w-full sm:w-auto">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => {
                                                                setCustomPage(prev => Math.max(0, prev - 1));
                                                                fetchCustomFoods(Math.max(0, customPage - 1), false);
                                                            }}
                                                            disabled={!customHasPrev || loadingCustom}
                                                            className="flex-1 sm:flex-initial"
                                                        >
                                                            <ChevronLeft className="w-4 h-4 mr-1" />
                                                            <span className="hidden sm:inline">Anterior</span>
                                                            <span className="sm:hidden">Ant</span>
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => {
                                                                setCustomPage(prev => prev + 1);
                                                                fetchCustomFoods(customPage + 1, false);
                                                            }}
                                                            disabled={!customHasNext || loadingCustom}
                                                            className="flex-1 sm:flex-initial"
                                                        >
                                                            <span className="hidden sm:inline">Próxima</span>
                                                            <span className="sm:hidden">Próx</span>
                                                            <ChevronRight className="w-4 h-4 ml-1" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Public Foods Section */}
                            {(sourceFilter === 'all' || sourceFilter !== 'custom') && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Database className="w-5 h-5 text-primary" />
                                            <h2 className="text-xl font-semibold">
                                                Banco de Dados Público
                                            </h2>
                                            <Badge variant="outline">
                                                {publicTotal}
                                            </Badge>
                                        </div>
                                    </div>
                                    
                                    {loadingPublic ? (
                                        <div className="flex justify-center py-8">
                                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                        </div>
                                    ) : publicFoods.length === 0 ? (
                                        <Card>
                                            <CardContent className="py-8 text-center">
                                                <p className="text-sm text-muted-foreground">
                                                    Nenhum alimento público encontrado
                                                </p>
                                            </CardContent>
                                        </Card>
                                    ) : (
                                        <>
                                            {/* 2 Column Layout */}
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                {publicColumns.map((column, colIndex) => (
                                                    <div key={colIndex} className="space-y-2">
                                                        {column.map((food) => (
                                                            <FoodCardHorizontal
                                                                key={food.id}
                                                                food={food}
                                                                isCustom={false}
                                                                onView={handleViewDetails}
                                                            />
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                            
                                            {/* Pagination */}
                                            {publicTotalPages > 1 && (
                                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
                                                    <p className="text-xs sm:text-sm text-muted-foreground">
                                                        Página {publicPage + 1} de {publicTotalPages}
                                                    </p>
                                                    <div className="flex gap-2 w-full sm:w-auto">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => {
                                                                setPublicPage(prev => Math.max(0, prev - 1));
                                                                fetchPublicFoods(Math.max(0, publicPage - 1), false);
                                                            }}
                                                            disabled={!publicHasPrev || loadingPublic}
                                                            className="flex-1 sm:flex-initial"
                                                        >
                                                            <ChevronLeft className="w-4 h-4 mr-1" />
                                                            <span className="hidden sm:inline">Anterior</span>
                                                            <span className="sm:hidden">Ant</span>
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => {
                                                                setPublicPage(prev => prev + 1);
                                                                fetchPublicFoods(publicPage + 1, false);
                                                            }}
                                                            disabled={!publicHasNext || loadingPublic}
                                                            className="flex-1 sm:flex-initial"
                                                        >
                                                            <span className="hidden sm:inline">Próxima</span>
                                                            <span className="sm:hidden">Próx</span>
                                                            <ChevronRight className="w-4 h-4 ml-1" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </TabsContent>

                        {/* Tab: Custom Foods Only */}
                        <TabsContent value="custom" className="space-y-6 mt-6">
                            {loadingCustom ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                </div>
                            ) : customFoods.length === 0 ? (
                                <Card>
                                    <CardContent className="py-12 text-center">
                                        <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                                        <p className="text-sm text-muted-foreground mb-4">
                                            Você ainda não criou nenhum alimento personalizado
                                        </p>
                                        <Button onClick={() => setCreateDialogOpen(true)}>
                                            <Plus className="w-4 h-4 mr-2" />
                                            Criar Primeiro Alimento
                                        </Button>
                                    </CardContent>
                                </Card>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        {customColumns.map((column, colIndex) => (
                                            <div key={colIndex} className="space-y-2">
                                                {column.map((food) => (
                                                    <FoodCardHorizontal
                                                        key={food.id}
                                                        food={food}
                                                        isCustom={true}
                                                        onView={handleViewDetails}
                                                        onEdit={handleEdit}
                                                        onDelete={handleDeleteClick}
                                                    />
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {customTotalPages > 1 && (
                                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
                                            <p className="text-xs sm:text-sm text-muted-foreground">
                                                Página {customPage + 1} de {customTotalPages}
                                            </p>
                                            <div className="flex gap-2 w-full sm:w-auto">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setCustomPage(prev => Math.max(0, prev - 1));
                                                        fetchCustomFoods(Math.max(0, customPage - 1), false);
                                                    }}
                                                    disabled={!customHasPrev || loadingCustom}
                                                    className="flex-1 sm:flex-initial"
                                                >
                                                    <ChevronLeft className="w-4 h-4 mr-1" />
                                                    <span className="hidden sm:inline">Anterior</span>
                                                    <span className="sm:hidden">Ant</span>
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setCustomPage(prev => prev + 1);
                                                        fetchCustomFoods(customPage + 1, false);
                                                    }}
                                                    disabled={!customHasNext || loadingCustom}
                                                    className="flex-1 sm:flex-initial"
                                                >
                                                    <span className="hidden sm:inline">Próxima</span>
                                                    <span className="sm:hidden">Próx</span>
                                                    <ChevronRight className="w-4 h-4 ml-1" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </TabsContent>
                    </Tabs>
                )}
            </motion.div>

            {/* Food Details Dialog */}
            <FoodDetailsDialog
                food={selectedFood}
                open={detailsDialogOpen}
                onOpenChange={setDetailsDialogOpen}
            />

            {/* Create Food Dialog */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5" />
                            Novo Alimento Personalizado
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
                <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            Editar Alimento
                        </DialogTitle>
                        <DialogDescription>
                            Edite as informações nutricionais e medidas caseiras
                        </DialogDescription>
                    </DialogHeader>
                    {foodToEdit && (
                        <SmartFoodForm
                            mode="full"
                            initialData={foodToEdit}
                            onSuccess={handleEditSuccess}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmar Exclusão</DialogTitle>
                        <DialogDescription>
                            Tem certeza que deseja excluir o alimento "{foodToDelete?.name}"? Esta ação não pode ser desfeita.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setDeleteConfirmOpen(false);
                                setFoodToDelete(null);
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                        >
                            Excluir
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default FoodBankPage;
