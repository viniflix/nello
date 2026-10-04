import React from 'react';
import {History,ChevronUp,ChevronDown} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
export default function PlanVersionHistory({mealPlanVersions=[],versionsLoading=false,versionsError=false,retryContext,versionsExpanded,setVersionsExpanded,selectedVersionId,setSelectedVersionId,restoringVersion,handleRestoreVersion,currentMetrics,baseMetrics,buildDelta}) {
if (versionsLoading) return <div role="status" className="rounded-2xl border bg-white p-5 text-sm text-muted-foreground">Carregando histórico de versões…</div>;
if (versionsError) return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Não foi possível carregar o histórico. <Button variant="outline" size="sm" onClick={retryContext}>Tentar novamente</Button></div>;
return <section aria-label="Histórico de versões" className="rounded-2xl border bg-white p-4 sm:p-5">                {/* Histórico de Versões */}
                {mealPlanVersions.length > 0 && (
                    <div>
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
{!mealPlanVersions.length && <p className="text-sm text-muted-foreground">Nenhuma versão disponível para este plano.</p>}</section>;}
