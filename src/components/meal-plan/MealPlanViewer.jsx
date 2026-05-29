import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { 
    Edit, Download, MoreVertical, BarChart3, ShoppingCart, 
    Send, Save, Archive, Calendar, CalendarCheck, CalendarDays, 
    UtensilsCrossed, History, Info, ChevronUp, ChevronDown 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { patientRoute } from '@/lib/utils/patientRoutes';
import MacrosChart from '@/components/meal-plan/MacrosChart';

const MealPlanViewer = ({
    patientId,
    patientSlugOrId,
    activePlan,
    referenceValues,
    mealPlanVersions = [],
    versionsExpanded,
    setVersionsExpanded,
    selectedVersionId,
    setSelectedVersionId,
    restoringVersion,
    handleRestoreVersion,
    currentMetrics,
    baseMetrics,
    buildDelta,
    handleEdit,
    setExportDialogOpen,
    handleGenerateShoppingList,
    handleCopy,
    setSaveTemplateDialogOpen,
    handleArchive,
    formatDate,
    getDaysLabel
}) => {
    const navigate = useNavigate();

    if (!activePlan) return null;

    return (
        <Card className="border-primary shadow-sm">
            <CardHeader>
                <div className="flex flex-col gap-4">
                    {/* Título e Badge */}
                    <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                            <span className="break-words">{activePlan.name}</span>
                            <Badge className="bg-primary">Ativo</Badge>
                        </CardTitle>

                        {/* Botões de Ação */}
                        <div className="flex items-center gap-2">
                            {/* Editar Plano - PRIMÁRIO */}
                            <Button
                                size="sm"
                                onClick={() => handleEdit(activePlan.id)}
                                className="hidden sm:flex bg-[#5f6f52] hover:bg-[#4a5740] text-white font-bold h-9 px-4 shadow-sm"
                            >
                                <Edit className="h-4 w-4 mr-2" />
                                Editar Plano
                            </Button>
                            {/* Exportar PDF - SECUNDÁRIO VISÍVEL */}
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setExportDialogOpen(true)}
                                className="hidden sm:flex"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Exportar PDF
                            </Button>

                            {/* Dropdown de Ações Secundárias */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <div className="sm:hidden">
                                        <DropdownMenuItem onClick={() => handleEdit(activePlan.id)}>
                                            <Edit className="h-4 w-4 mr-2" />
                                            Editar Plano
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setExportDialogOpen(true)}>
                                            <Download className="h-4 w-4 mr-2" />
                                            Exportar PDF
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                    </div>

                                    <DropdownMenuItem onClick={() => navigate(patientRoute({ id: patientId, slug: patientSlugOrId }, `meal-plan/${activePlan.id}/summary`))}>
                                        <BarChart3 className="h-4 w-4 mr-2" />
                                        Resumo Nutricional
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleGenerateShoppingList}>
                                        <ShoppingCart className="h-4 w-4 mr-2" />
                                        Lista de Compras
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleCopy(activePlan.id)}>
                                        <Send className="h-4 w-4 mr-2" />
                                        Enviar para Paciente
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSaveTemplateDialogOpen(true)}>
                                        <Save className="h-4 w-4 mr-2" />
                                        Salvar como Template
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => handleArchive(activePlan.id)}
                                        className="text-destructive focus:text-destructive"
                                    >
                                        <Archive className="h-4 w-4 mr-2" />
                                        Arquivar Plano
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {activePlan.description && (
                    <p className="text-muted-foreground mb-4">{activePlan.description}</p>
                )}

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div className="p-3 rounded-lg border bg-muted/20">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <Calendar className="w-3.5 h-3.5" />
                            Início
                        </div>
                        <div className="font-semibold text-sm">{formatDate(activePlan.start_date)}</div>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/20">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <CalendarCheck className="w-3.5 h-3.5" />
                            Término
                        </div>
                        <div className="font-semibold text-sm">
                            {activePlan.end_date ? formatDate(activePlan.end_date) : 'Indeterminado'}
                        </div>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/20">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <CalendarDays className="w-3.5 h-3.5" />
                            Dias Ativos
                        </div>
                        <div className="font-semibold text-sm">{getDaysLabel(activePlan.active_days)}</div>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/20">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <UtensilsCrossed className="w-3.5 h-3.5" />
                            Refeições
                        </div>
                        <div className="font-semibold text-sm">{activePlan.meals?.length || 0}</div>
                    </div>
                </div>

                {/* Grid: Refeições (60%) + Painel Nutricional (40%) */}
                <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
                    {/* Refeições - 60% */}
                    <div className="lg:col-span-6">
                        {activePlan.meals && activePlan.meals.length > 0 ? (
                            <div className="space-y-2">
                                <div className="font-semibold mb-3 flex items-center gap-2">
                                    <UtensilsCrossed className="w-4 h-4 text-muted-foreground" />
                                    Refeições
                                </div>
                                {activePlan.meals.map((meal, index) => {
                                    const mealCalPct = activePlan.daily_calories > 0
                                        ? ((meal.total_calories || 0) / activePlan.daily_calories) * 100
                                        : 0;
                                    const mealColors = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088fe', '#00c49f', '#ffbb28', '#ff6b6b', '#a57ed0'];
                                    const mealColor = mealColors[index % mealColors.length];

                                    return (
                                        <div key={meal.id} className="group p-3 border rounded-lg bg-background hover:shadow-sm transition-all duration-150">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-1 h-10 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: mealColor }}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="font-medium text-sm truncate">
                                                            {meal.name}
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            {meal.meal_time && (
                                                                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                                                                    {meal.meal_time}
                                                                </span>
                                                            )}
                                                            <span className="text-xs font-semibold" style={{ color: mealColor }}>
                                                                {(meal.total_calories || 0).toFixed(0)} kcal
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {/* Calorie % bar */}
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full transition-all duration-500"
                                                                style={{ width: `${Math.min(mealCalPct, 100)}%`, backgroundColor: mealColor, opacity: 0.7 }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] text-muted-foreground w-8 text-right">
                                                            {mealCalPct.toFixed(0)}%
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                                        {meal.foods?.length || 0} alimento(s)
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <Alert>
                                <AlertDescription>
                                    Nenhuma refeição adicionada ainda.
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>

                    {/* Painel Nutricional - 40% */}
                    <div className="lg:col-span-4">
                        <MacrosChart
                            protein={activePlan.daily_protein || 0}
                            carbs={activePlan.daily_carbs || 0}
                            fat={activePlan.daily_fat || 0}
                            calories={activePlan.daily_calories || 0}
                            patientId={patientId}
                            patientSlugOrId={patientSlugOrId}
                            planId={null}
                            referenceValues={referenceValues}
                            onReferenceUpdate={null}
                            readOnly={true}
                            plan={activePlan}
                            activePlanId={activePlan.id}
                        />
                    </div>
                </div>

                {/* Histórico de Versões */}
                {mealPlanVersions.length > 0 && (
                    <div className="mt-6 border-t pt-4">
                        <button
                            type="button"
                            onClick={() => setVersionsExpanded(!versionsExpanded)}
                            className="flex items-center justify-between w-full group"
                        >
                            <div className="flex items-center gap-2">
                                <History className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-semibold text-foreground">Histórico de Versões</span>
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{mealPlanVersions.length}</Badge>
                                <div className="relative">
                                    <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help peer" />
                                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2.5 bg-foreground text-background text-xs rounded-lg shadow-lg opacity-0 pointer-events-none peer-hover:opacity-100 transition-opacity z-50">
                                        Cada vez que você salva uma edição no plano, uma versão é criada automaticamente. Compare mudanças e restaure versões anteriores.
                                    </div>
                                </div>
                            </div>
                            {versionsExpanded ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            )}
                        </button>

                        {versionsExpanded && (
                            <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
                                    <div>
                                        <label className="text-sm font-medium text-foreground">Comparar plano atual com versão</label>
                                        <select
                                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            value={selectedVersionId}
                                            onChange={(event) => setSelectedVersionId(event.target.value)}
                                        >
                                            {mealPlanVersions.map((version) => (
                                                <option key={version.id} value={String(version.id)}>
                                                    Versão {version.version_number} • {new Date(version.created_at).toLocaleString('pt-BR')}
                                                    {version.is_rollback ? ' • rollback' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <Button
                                        variant="outline"
                                        disabled={!selectedVersionId || restoringVersion}
                                        onClick={handleRestoreVersion}
                                    >
                                        {restoringVersion ? 'Restaurando...' : 'Restaurar versão'}
                                    </Button>
                                </div>

                                {selectedVersionId && currentMetrics && baseMetrics ? (
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                        <div className="rounded-lg border p-3">
                                            <p className="text-xs text-muted-foreground">Kcal/dia</p>
                                            <p className="text-lg font-semibold">{currentMetrics.calories.toFixed(0)}</p>
                                            <p className="text-xs text-muted-foreground">Delta: {buildDelta(currentMetrics.calories, baseMetrics.calories)}</p>
                                        </div>
                                        <div className="rounded-lg border p-3">
                                            <p className="text-xs text-muted-foreground">Proteína</p>
                                            <p className="text-lg font-semibold">{currentMetrics.protein.toFixed(1)} g</p>
                                            <p className="text-xs text-muted-foreground">Delta: {buildDelta(currentMetrics.protein, baseMetrics.protein)}</p>
                                        </div>
                                        <div className="rounded-lg border p-3">
                                            <p className="text-xs text-muted-foreground">Carboidratos</p>
                                            <p className="text-lg font-semibold">{currentMetrics.carbs.toFixed(1)} g</p>
                                            <p className="text-xs text-muted-foreground">Delta: {buildDelta(currentMetrics.carbs, baseMetrics.carbs)}</p>
                                        </div>
                                        <div className="rounded-lg border p-3">
                                            <p className="text-xs text-muted-foreground">Gorduras</p>
                                            <p className="text-lg font-semibold">{currentMetrics.fat.toFixed(1)} g</p>
                                            <p className="text-xs text-muted-foreground">Delta: {buildDelta(currentMetrics.fat, baseMetrics.fat)}</p>
                                        </div>
                                        <div className="rounded-lg border p-3">
                                            <p className="text-xs text-muted-foreground">Refeições</p>
                                            <p className="text-lg font-semibold">{currentMetrics.mealsCount}</p>
                                            <p className="text-xs text-muted-foreground">Delta: {buildDelta(currentMetrics.mealsCount, baseMetrics.mealsCount)}</p>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default MealPlanViewer;
