import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    UtensilsCrossed, History, ChevronUp, ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { patientRoute } from '@/lib/utils/patientRoutes';
import MacrosChart from '@/components/meal-plan/MacrosChart';
import PlanMealsOverview from './PlanMealsOverview';
import PlanNutritionTotals from './PlanNutritionTotals';
import MealPlanDocumentActions from '@/features/documents/components/MealPlanDocumentActions';

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
        <Card className="overflow-hidden border-primary/20 bg-white shadow-sm">
            <CardHeader className="border-b bg-primary/5 p-[12px] sm:p-6">
                <div className="flex flex-col gap-4">
                    {/* Título e Badge */}
                    <div className="flex flex-col items-start justify-between gap-4 lg:flex-row">
                        <CardTitle className="tracking-normal min-w-0 text-lg sm:text-xl flex flex-wrap items-center gap-2">
                            <span className="break-words">{activePlan.name}</span>
                            <Badge className="bg-primary">Ativo</Badge>
                            <Badge variant="outline">{({ quantitative: 'QUANTITATIVO', qualitative: 'QUALITATIVO', hybrid: 'HÍBRIDO' })[activePlan.plan_mode] || 'HÍBRIDO'}</Badge>
                        </CardTitle>

                        {/* Botões de Ação */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Editar Plano - PRIMÁRIO */}
                            <Button
                                size="sm"
                                onClick={() => handleEdit(activePlan.id)}
                                className="gap-2"
                            >
                                <Edit className="h-4 w-4 mr-2" />
                                Editar Plano
                            </Button>
                            {/* Exportar PDF - SECUNDÁRIO VISÍVEL */}
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setExportDialogOpen(true)}
                                className="gap-2"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Exportar PDF
                            </Button>

                            {/* Dropdown de Ações Secundárias */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button aria-label="Mais ações do plano" variant="ghost" size="icon" className="shrink-0">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
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
                                        Salvar como modelo
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
            <CardContent className="space-y-5 p-[12px] pt-5 sm:p-6 sm:pt-5">
                <MealPlanDocumentActions plan={activePlan} patientId={patientId} />
                {activePlan.description && (
                    <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{activePlan.description}</p>
                )}

                {/* Metadata Grid */}
                <div className="grid gap-3 mb-6 [overflow-wrap:anywhere]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
                    <div className="p-[12px] rounded-lg border bg-muted/20">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <Calendar className="w-3.5 h-3.5" />
                            Início
                        </div>
                        <div className="font-semibold text-sm">{formatDate(activePlan.start_date)}</div>
                    </div>
                    <div className="p-[12px] rounded-lg border bg-muted/20">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <CalendarCheck className="w-3.5 h-3.5" />
                            Término
                        </div>
                        <div className="font-semibold text-sm">
                            {activePlan.end_date ? formatDate(activePlan.end_date) : 'Indeterminado'}
                        </div>
                    </div>
                    <div className="p-[12px] rounded-lg border bg-muted/20">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <CalendarDays className="w-3.5 h-3.5" />
                            Dias Ativos
                        </div>
                        <div className="font-semibold text-sm break-words">{getDaysLabel(activePlan.active_days)}</div>
                    </div>
                    <div className="p-[12px] rounded-lg border bg-muted/20">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <UtensilsCrossed className="w-3.5 h-3.5" />
                            Refeições
                        </div>
                        <div className="font-semibold text-sm">{activePlan.meals?.length || 0}</div>
                    </div>
                </div>

                <PlanNutritionTotals plan={activePlan} />
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
                    <PlanMealsOverview meals={activePlan.meals || []} dailyCalories={activePlan.daily_calories} />
                    {/* Painel Nutricional - 40% */}
                    <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
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
                            aria-expanded={versionsExpanded} aria-controls="plan-version-history" onClick={() => setVersionsExpanded(!versionsExpanded)}
                            className="flex items-center justify-between w-full group"
                        >
                            <div className="flex items-center gap-2">
                                <History className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-semibold text-foreground">Histórico de Versões</span>
                                <Badge variant="secondary" className="h-5 px-1.5 text-xs">{mealPlanVersions.length}</Badge>

                            </div>
                            {versionsExpanded ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            )}
                        </button>

                        {versionsExpanded && (
                            <div id="plan-version-history" className="mt-4 space-y-4">
                                <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
                                    <div>
                                        <p className="text-sm text-muted-foreground">Cada edição salva gera uma versão. Restaurar uma versão anterior cria uma nova versão; o histórico é mantido.</p><label htmlFor="plan-history-version" className="mt-3 block text-sm font-medium text-foreground">Comparar plano atual com versão</label>
                                        <select id="plan-history-version"
                                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            value={selectedVersionId}
                                            onChange={(event) => setSelectedVersionId(event.target.value)}
                                        >
                                            {mealPlanVersions.map((version) => (
                                                <option key={version.id} value={String(version.id)}>
                                                    Versão {version.version_number} • {new Date(version.created_at).toLocaleString('pt-BR')}
                                                    {version.is_rollback ? ' • restauração' : ''}
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
                                            <p className="text-xs text-muted-foreground">Diferença: {buildDelta(currentMetrics.calories, baseMetrics.calories)}</p>
                                        </div>
                                        <div className="rounded-lg border p-3">
                                            <p className="text-xs text-muted-foreground">Proteína</p>
                                            <p className="text-lg font-semibold">{currentMetrics.protein.toFixed(1)} g</p>
                                            <p className="text-xs text-muted-foreground">Diferença: {buildDelta(currentMetrics.protein, baseMetrics.protein)}</p>
                                        </div>
                                        <div className="rounded-lg border p-3">
                                            <p className="text-xs text-muted-foreground">Carboidratos</p>
                                            <p className="text-lg font-semibold">{currentMetrics.carbs.toFixed(1)} g</p>
                                            <p className="text-xs text-muted-foreground">Diferença: {buildDelta(currentMetrics.carbs, baseMetrics.carbs)}</p>
                                        </div>
                                        <div className="rounded-lg border p-3">
                                            <p className="text-xs text-muted-foreground">Gorduras</p>
                                            <p className="text-lg font-semibold">{currentMetrics.fat.toFixed(1)} g</p>
                                            <p className="text-xs text-muted-foreground">Diferença: {buildDelta(currentMetrics.fat, baseMetrics.fat)}</p>
                                        </div>
                                        <div className="rounded-lg border p-3">
                                            <p className="text-xs text-muted-foreground">Refeições</p>
                                            <p className="text-lg font-semibold">{currentMetrics.mealsCount}</p>
                                            <p className="text-xs text-muted-foreground">Diferença: {buildDelta(currentMetrics.mealsCount, baseMetrics.mealsCount)}</p>
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
