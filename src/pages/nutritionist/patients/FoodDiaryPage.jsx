import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Utensils, Calendar, Clock, TrendingUp, Activity,
    History, ChevronDown, Flame, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/customSupabaseClient';
import {
    getPatientMeals,
    getMealAuditHistory,
    calculateDiaryAdherence,
    getNutritionalSummary,
    formatAuditAction,
    extractChanges,
    getPatientAuditHistory
} from '@/lib/supabase/food-diary-queries';
import { cn } from '@/lib/utils';

const FoodDiaryPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [patientName, setPatientName] = useState('');
    const [activeTab, setActiveTab] = useState('meals');

    // Dados
    const [meals, setMeals] = useState([]);
    const [auditHistory, setAuditHistory] = useState([]);
    const [adherenceStats, setAdherenceStats] = useState(null);
    const [nutritionalSummary, setNutritionalSummary] = useState(null);

    // Filtros
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        mealType: ''
    });
    const [filtersOpen, setFiltersOpen] = useState(false);

    // Modal de detalhes
    const [selectedMeal, setSelectedMeal] = useState(null);
    const [mealHistory, setMealHistory] = useState([]);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, [patientId]);

    useEffect(() => {
        if (!loading && filters.startDate && filters.endDate) {
            loadMeals();
        }
    }, [filters]);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            // Buscar nome do paciente
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('name')
                .eq('id', patientId)
                .single();

            if (profile) {
                setPatientName(profile.name);
            }

            // Buscar data inicial do plano alimentar ativo
            const { data: activePlan } = await supabase
                .from('meal_plans')
                .select('start_date')
                .eq('patient_id', patientId)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            const today = new Date().toISOString().split('T')[0];
            const planStartDate = activePlan?.start_date || today;

            // Definir filtros de data
            setFilters({
                startDate: planStartDate,
                endDate: today,
                mealType: ''
            });

            // Buscar refeições com as datas definidas
            const { data: mealsData } = await getPatientMeals(patientId, {
                startDate: planStartDate,
                endDate: today,
                mealType: ''
            });
            setMeals(mealsData || []);

            // Buscar histórico de auditoria completo
            const { data: auditData } = await getPatientAuditHistory(patientId, {
                startDate: planStartDate,
                endDate: today
            });
            setAuditHistory(auditData || []);

            // Calcular adesão (últimos 30 dias)
            const { data: adherence } = await calculateDiaryAdherence(patientId, 30);
            setAdherenceStats(adherence);

            // Calcular resumo nutricional (últimos 7 dias)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const sevenDaysStr = sevenDaysAgo.toISOString().split('T')[0];

            const { data: summary } = await getNutritionalSummary(patientId, sevenDaysStr, today);
            setNutritionalSummary(summary);

        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadMeals = async () => {
        try {
            const { data: mealsData } = await getPatientMeals(patientId, filters);
            setMeals(mealsData || []);

            const { data: auditData } = await getPatientAuditHistory(patientId, filters);
            setAuditHistory(auditData || []);
        } catch (error) {
            console.error('Erro ao buscar refeições:', error);
        }
    };

    const handleMealClick = async (meal) => {
        setSelectedMeal(meal);

        // Buscar histórico de auditoria específico da refeição
        const { data: history } = await getMealAuditHistory(meal.id);
        setMealHistory(history || []);

        setShowDetailsModal(true);
    };

    const handleFilterChange = (field, value) => {
        setFilters(prev => ({ ...prev, [field]: value }));
    };

    const getMealTypeLabel = (type) => {
        const types = {
            breakfast: 'Café da Manhã',
            morning_snack: 'Lanche da Manhã',
            lunch: 'Almoço',
            afternoon_snack: 'Lanche da Tarde',
            dinner: 'Jantar',
            supper: 'Ceia'
        };
        return types[type] || type;
    };

    const getMealTypeColor = (type) => {
        const colors = {
            breakfast: { bg: 'bg-orange-500', border: '#f97316' },
            morning_snack: { bg: 'bg-yellow-500', border: '#eab308' },
            lunch: { bg: 'bg-green-600', border: '#16a34a' },
            afternoon_snack: { bg: 'bg-blue-500', border: '#3b82f6' },
            dinner: { bg: 'bg-purple-600', border: '#9333ea' },
            supper: { bg: 'bg-indigo-500', border: '#6366f1' }
        };
        return colors[type] || { bg: 'bg-[#5f6f52]', border: '#5f6f52' };
    };

    return loading ? null : (
        <div className="flex flex-col min-h-screen bg-background">
            <div className="max-w-7xl mx-auto w-full px-4 md:px-6 py-4 md:py-6">
                {/* Header */}
                <div className="mb-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/nutritionist/patients/${patientId}/hub?tab=nutrition`)}
                        className="mb-3 -ml-2 text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10"
                    >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Voltar
                    </Button>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
                            <Utensils className="w-7 h-7 text-[#5f6f52]" />
                            Diário Alimentar
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {patientName}
                        </p>
                    </div>
                </div>

                {/* Stats Compactos */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground mb-1">Adesão 30d</p>
                                    <p className="text-xl md:text-2xl font-bold text-[#5f6f52] truncate">
                                        {adherenceStats?.adherencePercentage || 0}%
                                    </p>
                                </div>
                                <TrendingUp className="w-6 h-6 text-[#5f6f52] opacity-30 flex-shrink-0" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground mb-1">Sequência</p>
                                    <p className="text-xl md:text-2xl font-bold text-[#c4661f] truncate">
                                        {adherenceStats?.currentStreak || 0} dias
                                    </p>
                                </div>
                                <Activity className="w-6 h-6 text-[#c4661f] opacity-30 flex-shrink-0" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground mb-1">Média Cal. 7d</p>
                                    <p className="text-xl md:text-2xl font-bold text-foreground truncate">
                                        {nutritionalSummary?.avgCaloriesPerDay || 0}
                                    </p>
                                </div>
                                <Flame className="w-6 h-6 text-orange-500 opacity-30 flex-shrink-0" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground mb-1">Total Refeições</p>
                                    <p className="text-xl md:text-2xl font-bold text-foreground truncate">
                                        {adherenceStats?.totalMeals || 0}
                                    </p>
                                </div>
                                <Utensils className="w-6 h-6 text-[#5f6f52] opacity-30 flex-shrink-0" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filtros Colapsáveis */}
                <Card className="mb-6">
                    <CardHeader
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setFiltersOpen(!filtersOpen)}
                    >
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-[#5f6f52]" />
                                Filtros
                            </CardTitle>
                            <ChevronDown
                                className={cn(
                                    "w-5 h-5 text-muted-foreground transition-transform",
                                    filtersOpen && "rotate-180"
                                )}
                            />
                        </div>
                    </CardHeader>
                    {filtersOpen && (
                        <CardContent className="pt-0">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="start_date" className="text-sm">Data Inicial</Label>
                                    <DateInputWithCalendar
                                        id="start_date"
                                        value={filters.startDate}
                                        onChange={(value) => handleFilterChange('startDate', value)}
                                        className="h-9"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="end_date" className="text-sm">Data Final</Label>
                                    <DateInputWithCalendar
                                        id="end_date"
                                        value={filters.endDate}
                                        onChange={(value) => handleFilterChange('endDate', value)}
                                        className="h-9"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="meal_type" className="text-sm">Tipo de Refeição</Label>
                                    <Select
                                        value={filters.mealType || 'all'}
                                        onValueChange={(value) => handleFilterChange('mealType', value === 'all' ? '' : value)}
                                    >
                                        <SelectTrigger id="meal_type" className="h-9">
                                            <SelectValue placeholder="Todas" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas</SelectItem>
                                            <SelectItem value="breakfast">Café da Manhã</SelectItem>
                                            <SelectItem value="morning_snack">Lanche da Manhã</SelectItem>
                                            <SelectItem value="lunch">Almoço</SelectItem>
                                            <SelectItem value="afternoon_snack">Lanche da Tarde</SelectItem>
                                            <SelectItem value="dinner">Jantar</SelectItem>
                                            <SelectItem value="supper">Ceia</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    )}
                </Card>

                {/* Tabs: Refeições e Histórico */}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="meals" className="flex items-center gap-2">
                            <Utensils className="w-4 h-4" />
                            <span className="hidden sm:inline">Refeições</span>
                            <Badge variant="secondary" className="ml-1">{meals.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="audit" className="flex items-center gap-2">
                            <History className="w-4 h-4" />
                            <span className="hidden sm:inline">Histórico</span>
                            <Badge variant="secondary" className="ml-1">{auditHistory.length}</Badge>
                        </TabsTrigger>
                    </TabsList>

                    {/* Tab: Refeições */}
                    <TabsContent value="meals" className="mt-0">
                        {meals.length === 0 ? (
                            <Card>
                                <CardContent className="py-12">
                                    <div className="text-center">
                                        <Utensils className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                                        <p className="text-muted-foreground">Nenhuma refeição registrada no período selecionado</p>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-3">
                                {meals.map(meal => (
                                    <MealCard
                                        key={meal.id}
                                        meal={meal}
                                        onClick={() => handleMealClick(meal)}
                                        getMealTypeLabel={getMealTypeLabel}
                                        getMealTypeColor={getMealTypeColor}
                                    />
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    {/* Tab: Histórico de Auditoria */}
                    <TabsContent value="audit" className="mt-0">
                        {auditHistory.length === 0 ? (
                            <Card>
                                <CardContent className="py-12">
                                    <div className="text-center">
                                        <History className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                                        <p className="text-muted-foreground">Nenhuma alteração registrada no período</p>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-3">
                                {auditHistory.map((log, index) => (
                                    <AuditLogCard
                                        key={log.id || index}
                                        log={log}
                                        getMealTypeLabel={getMealTypeLabel}
                                        onClick={async () => {
                                            if (log.meal_id && log.action !== 'delete') {
                                                // Buscar dados completos da refeição
                                                const { data: mealData } = await getPatientMeals(patientId, {}, 1, 0);
                                                const fullMeal = mealData?.find(m => m.id === log.meal_id);
                                                if (fullMeal) {
                                                    await handleMealClick(fullMeal);
                                                }
                                            } else if (log.action === 'delete') {
                                                // Para refeições deletadas, mostrar modal com dados do log
                                                const deletedMeal = {
                                                    meal_type: log.meal_type,
                                                    meal_date: log.meal_date,
                                                    meal_time: log.meal_time,
                                                    total_calories: log.details?.total_calories || 0,
                                                    total_protein: log.details?.total_protein || 0,
                                                    total_carbs: log.details?.total_carbs || 0,
                                                    total_fat: log.details?.total_fat || 0,
                                                    meal_items: log.details?.meal_items || [],
                                                    notes: log.details?.notes
                                                };
                                                setSelectedMeal(deletedMeal);
                                                setMealHistory([log]);
                                                setShowDetailsModal(true);
                                            }
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>

                {/* Modal de Detalhes */}
                {selectedMeal && (
                    <MealDetailsModal
                        meal={selectedMeal}
                        history={mealHistory}
                        open={showDetailsModal}
                        onClose={() => setShowDetailsModal(false)}
                        getMealTypeLabel={getMealTypeLabel}
                    />
                )}
            </div>
        </div>
    );
};

// Componente Card de Refeição
const MealCard = ({ meal, onClick, getMealTypeLabel, getMealTypeColor }) => {
    const colors = getMealTypeColor(meal.meal_type);

    return (
        <Card
            className="hover:shadow-md transition-shadow cursor-pointer border-l-4"
            style={{ borderLeftColor: colors.border }}
            onClick={onClick}
        >
            <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0", colors.bg)}>
                            <Utensils className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground truncate">
                                {getMealTypeLabel(meal.meal_type)}
                            </h3>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(meal.meal_date).toLocaleDateString('pt-BR')}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {meal.meal_time}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 sm:gap-3 text-center text-xs flex-shrink-0">
                        <div>
                            <p className="text-muted-foreground">Kcal</p>
                            <p className="font-semibold text-[#5f6f52]">{Math.round(meal.total_calories)}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">PTN</p>
                            <p className="font-semibold">{Math.round(meal.total_protein)}g</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">CHO</p>
                            <p className="font-semibold">{Math.round(meal.total_carbs)}g</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">LIP</p>
                            <p className="font-semibold">{Math.round(meal.total_fat)}g</p>
                        </div>
                    </div>
                </div>

                {meal.is_edited && (
                    <Badge variant="outline" className="mt-3 text-xs">
                        <FileText className="w-3 h-3 mr-1" />
                        Editada
                    </Badge>
                )}
            </CardContent>
        </Card>
    );
};

// Componente Card de Auditoria
const AuditLogCard = ({ log, getMealTypeLabel, onClick }) => {
    const actionInfo = formatAuditAction(log);
    const changes = extractChanges(log.details);

    const getBadgeVariant = (action) => {
        if (action === 'create') return 'default';
        if (action === 'update') return 'secondary';
        return 'destructive';
    };

    return (
        <Card
            className={cn(
                "border-l-4 transition-shadow",
                actionInfo.borderColor.replace('border-', 'border-l-'),
                onClick && "cursor-pointer hover:shadow-md"
            )}
            onClick={onClick}
        >
            <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <Badge variant={getBadgeVariant(log.action)}>
                                {actionInfo.label}
                            </Badge>
                            {log.meal_type && (
                                <span className="text-sm font-medium truncate">
                                    {getMealTypeLabel(log.meal_type)}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {actionInfo.description}
                        </p>
                    </div>
                    <div className="text-xs text-muted-foreground flex-shrink-0">
                        <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(log.created_at).toLocaleDateString('pt-BR')}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {new Date(log.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                </div>

                {changes.length > 0 && (
                    <div className={cn("text-xs space-y-1 pt-3 border-t", actionInfo.bgColor)}>
                        {changes.map((change, idx) => (
                            <div key={idx} className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-muted-foreground">{change.label}:</span>
                                {change.oldValue && (
                                    <>
                                        <span className="line-through text-red-600">{change.oldValue}</span>
                                        <span>→</span>
                                    </>
                                )}
                                <span className="text-green-600 font-medium">{change.newValue}</span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

// Componente Modal de Detalhes da Refeição
const MealDetailsModal = ({ meal, history, open, onClose, getMealTypeLabel }) => {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Utensils className="w-5 h-5 text-[#5f6f52]" />
                        {getMealTypeLabel(meal.meal_type)}
                    </DialogTitle>
                    <DialogDescription>
                        {new Date(meal.meal_date).toLocaleDateString('pt-BR')} às {meal.meal_time}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 pt-4">
                    {/* Informações Nutricionais */}
                    <div>
                        <h3 className="font-semibold mb-3 text-[#5f6f52]">Totais Nutricionais</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="text-center p-3 bg-[#fefae0]/40 rounded border">
                                <p className="text-xs text-muted-foreground mb-1">Calorias</p>
                                <p className="text-2xl font-bold text-[#5f6f52]">{Math.round(meal.total_calories)}</p>
                                <p className="text-xs text-muted-foreground">kcal</p>
                            </div>
                            <div className="text-center p-3 bg-[#fefae0]/40 rounded border">
                                <p className="text-xs text-muted-foreground mb-1">Proteínas</p>
                                <p className="text-2xl font-bold">{Math.round(meal.total_protein)}</p>
                                <p className="text-xs text-muted-foreground">g</p>
                            </div>
                            <div className="text-center p-3 bg-[#fefae0]/40 rounded border">
                                <p className="text-xs text-muted-foreground mb-1">Carboidratos</p>
                                <p className="text-2xl font-bold">{Math.round(meal.total_carbs)}</p>
                                <p className="text-xs text-muted-foreground">g</p>
                            </div>
                            <div className="text-center p-3 bg-[#fefae0]/40 rounded border">
                                <p className="text-xs text-muted-foreground mb-1">Gorduras</p>
                                <p className="text-2xl font-bold">{Math.round(meal.total_fat)}</p>
                                <p className="text-xs text-muted-foreground">g</p>
                            </div>
                        </div>
                    </div>

                    {/* Alimentos */}
                    <div>
                        <h3 className="font-semibold mb-3 text-[#5f6f52]">
                            Alimentos Consumidos ({meal.meal_items?.length || 0})
                        </h3>
                        <div className="space-y-2">
                            {meal.meal_items?.map((item, index) => (
                                <div key={index} className="p-3 bg-white rounded border">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium text-sm">{item.name}</span>
                                        <Badge variant="outline" className="text-xs">
                                            {item.quantity} {item.unit || 'g'}
                                        </Badge>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                                        <span>{Math.round(item.calories || 0)} kcal</span>
                                        <span>{Math.round(item.protein || 0)}g PTN</span>
                                        <span>{Math.round(item.carbs || 0)}g CHO</span>
                                        <span>{Math.round(item.fat || 0)}g LIP</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Notas */}
                    {meal.notes && (
                        <div>
                            <h3 className="font-semibold mb-2 text-[#5f6f52]">Observações</h3>
                            <p className="text-sm text-muted-foreground bg-[#fefae0]/30 p-3 rounded border">
                                {meal.notes}
                            </p>
                        </div>
                    )}

                    {/* Histórico de Alterações desta Refeição */}
                    {history && history.length > 0 && (
                        <div>
                            <h3 className="font-semibold mb-3 text-[#5f6f52]">Histórico de Alterações</h3>
                            <div className="space-y-2">
                                {history.map((log, index) => {
                                    const actionInfo = formatAuditAction(log);
                                    const changes = extractChanges(log.details);

                                    return (
                                        <div
                                            key={index}
                                            className={cn(
                                                "p-3 rounded border text-sm",
                                                actionInfo.bgColor,
                                                actionInfo.borderColor
                                            )}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <Badge className={cn("text-xs", actionInfo.color)}>
                                                    {actionInfo.label}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    {new Date(log.created_at).toLocaleDateString('pt-BR')} às{' '}
                                                    {new Date(log.created_at).toLocaleTimeString('pt-BR', {
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </span>
                                            </div>
                                            {changes.length > 0 && (
                                                <div className="text-xs space-y-1">
                                                    {changes.map((change, idx) => (
                                                        <div key={idx} className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-medium">{change.label}:</span>
                                                            {change.oldValue && (
                                                                <>
                                                                    <span className="line-through text-red-600">
                                                                        {change.oldValue}
                                                                    </span>
                                                                    <span>→</span>
                                                                </>
                                                            )}
                                                            <span className="text-green-600 font-medium">
                                                                {change.newValue}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default FoodDiaryPage;
