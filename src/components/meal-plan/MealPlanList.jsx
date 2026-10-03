import React, { useState } from 'react';
import MealPlanPreviewDialog from './MealPlanPreviewDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import {
    Plus, Copy, Edit, Trash2, RefreshCw, Send, Utensils, FolderOpen, Search, Eye
} from 'lucide-react';

const MealPlanList = ({
    patientId,
    previewState: controlledPreview,
    setPreviewState: setControlledPreview,
    activePlan,
    plans,
    pendingDrafts,
    plansModalOpen,
    setPlansModalOpen,
    plansSearchTerm,
    setPlansSearchTerm,
    handleResumePendingDraft,
    setDraftToDelete,
    handleSetActive,
    handleEdit,
    handleCopy,
    setPlanToDelete,
    setDeleteDialogOpen,
    setShowForm,
    setPendingDraft,
    setEditingPlan,
    setTemplateManagerOpen,
    discardingDraft,
    formatDate,
    getDaysLabel,
    formatRelativeTime
}) => {
    const [localPreview, setLocalPreview] = useState({ id: null, fromList: false });
    const preview = controlledPreview || localPreview;
    const setPreview = setControlledPreview || setLocalPreview;
    const previewId = preview.id;
    const openPreview = (id, fromList = false) => {
        if (fromList) setPlansModalOpen(false);
        setPreview({ id, fromList });
    };
    const closePreview = () => {
        setPreview({ id: null, fromList: false });
        if (preview.fromList) setPlansModalOpen(true);
    };
    const normalizedSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const matches = item => normalizedSearch(item.name).includes(normalizedSearch(plansSearchTerm).trim());
    const visiblePlans = plans.filter(matches);
    const visibleDrafts = pendingDrafts.filter(matches);
    return (
        <>
            {/* Lista de Planos - Inline quando NÃO tem plano ativo */}
            {!activePlan && (
                <Card>
                    <CardHeader>
                        <CardTitle className="tracking-normal">Todos os Planos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {pendingDrafts.length === 0 && plans.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="p-4 bg-muted/20 rounded-full mb-4">
                                    <Utensils className="w-12 h-12 text-muted-foreground opacity-20" />
                                </div>
                                <h3 className="text-xl font-bold mb-2">Nenhum Plano Ativo</h3>
                                <p className="text-muted-foreground max-w-md mb-8">
                                    Este paciente ainda não possui um plano alimentar ativo.
                                    Crie um novo plano ou utilize um modelo para começar.
                                </p>
                                <div className="flex flex-col sm:flex-row flex-wrap gap-4 w-full justify-center">
                                    <Button
                                        onClick={() => {
                                            setPendingDraft(null);
                                            setEditingPlan(null);
                                            setShowForm(true);
                                        }}
                                        size="lg"
                                        className="font-bold min-h-12 h-auto py-3 px-4 bg-primary hover:bg-primary/90 text-white w-full sm:w-auto shadow-md"
                                    >
                                        <Plus className="w-5 h-5 mr-2" />
                                        Criar Primeiro Plano
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="lg"
                                        onClick={() => setTemplateManagerOpen(true)}
                                        className="font-bold min-h-12 h-auto py-3 px-4 border-2 w-full sm:w-auto"
                                    >
                                        <Copy className="w-5 h-5 mr-2" />
                                        Usar Modelo
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {pendingDrafts.map((draft) => (
                                    <div key={draft.id} className="p-4 border-2 border-amber-200 bg-amber-50/50 border-dashed rounded-lg transition-colors">
                                        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="font-semibold break-words text-amber-900">{draft.name || 'Novo Plano Alimentar'}</h3>
                                                    <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-200">Rascunho</Badge>
                                                </div>
                                                <div className="text-sm text-amber-800 mt-1">
                                                    {formatRelativeTime(draft.updated_at)} • Pendente
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap max-w-full gap-2">
                                                <Button variant="outline" size="sm" className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100" onClick={() => handleResumePendingDraft(draft)} title="Retomar edição">
                                                    <Edit className="h-4 w-4 mr-2" />Retomar
                                                </Button>
                                                <Button variant="ghost" size="sm" className="text-destructive hover:bg-red-50 hover:text-destructive" onClick={() => setDraftToDelete(draft)} disabled={discardingDraft} aria-label={`Descartar rascunho ${draft.name || 'sem nome'}`} title="Descartar rascunho">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {plans.map((plan) => (
                                    <div key={plan.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                                        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="font-semibold break-words">{plan.name}</h3>
                                                    {plan.is_active && <Badge variant="outline" className="border-green-300 text-green-700">Ativo</Badge>}
                                                    {!plan.is_active && <Badge variant="secondary">Arquivado</Badge>}
                                                </div>
                                                <div className="text-sm text-muted-foreground mt-1">
                                                    {formatDate(plan.start_date)}
                                                    {plan.end_date && ` até ${formatDate(plan.end_date)}`}
                                                    {' '}• {getDaysLabel(plan.active_days)}
                                                    {' '}• {Math.round(Number(plan.daily_calories) || 0).toLocaleString('pt-BR')} kcal/dia
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap max-w-full gap-2">
                                                <Button variant="outline" size="sm" aria-label={`Ver ${plan.name}`} onClick={() => openPreview(plan.id)}><Eye className="mr-1 h-4 w-4" />Ver plano</Button>
                                                {!plan.is_active && (
                                                    <Button variant="default" size="sm" onClick={() => handleSetActive(plan.id)} aria-label={`Ativar ${plan.name}`} title="Ativar este plano">
                                                        <RefreshCw className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                <Button variant="outline" size="sm" onClick={() => handleEdit(plan.id)} aria-label={`Editar ${plan.name}`} title="Editar plano">
                                                    <Edit className="h-4 w-4 mr-1" />Editar
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => handleCopy(plan.id)} aria-label={`Copiar ${plan.name} para outro paciente`} title="Copiar para outro paciente">
                                                    <Send className="h-4 w-4" />
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => { setPlanToDelete(plan.id); setDeleteDialogOpen(true); }} aria-label={`Excluir ${plan.name}`} title="Excluir plano">
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Modal "Meus Planos" - quando plano ativo existe */}
            {!previewId && <Dialog open={plansModalOpen} onOpenChange={(open) => { setPlansModalOpen(open); if (!open) setPlansSearchTerm(''); }}>
                <DialogContent className="flex w-[96vw] max-w-5xl max-h-[92dvh] flex-col overflow-hidden bg-white">
                    <DialogHeader>
                        <DialogTitle className="tracking-normal flex flex-wrap items-center gap-2">
                            <FolderOpen className="h-5 w-5 text-primary" />
                            Planos Alimentares
                        </DialogTitle>
                        <DialogDescription>
                            {plans.length} plano(s) • {pendingDrafts.length} rascunho(s)
                        </DialogDescription>
                    </DialogHeader>

                    {/* Busca */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            aria-label="Buscar planos alimentares"
                            placeholder="Buscar por nome do plano..."
                            value={plansSearchTerm}
                            onChange={(e) => setPlansSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    <div className="min-h-0 overflow-y-auto space-y-3 pr-1">
                        {!visiblePlans.length && !visibleDrafts.length && <p role="status" className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum plano encontrado. Tente outro nome.</p>}
                        {/* Rascunhos */}
                        {visibleDrafts.map((draft) => (
                            <div key={draft.id} className="p-3 border-2 border-amber-200 bg-amber-50/50 border-dashed rounded-lg">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h4 className="font-semibold text-sm text-amber-900 break-words">{draft.name || 'Novo Plano'}</h4>
                                            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-200 shrink-0 text-xs">Rascunho</Badge>
                                        </div>
                                        <p className="text-xs text-amber-800 mt-0.5">{formatRelativeTime(draft.updated_at)}</p>
                                    </div>
                                    <div className="flex flex-wrap max-w-full gap-1.5">
                                        <Button variant="outline" size="sm" className="min-h-10 border-amber-300 text-amber-800" onClick={() => { handleResumePendingDraft(draft); setPlansModalOpen(false); }}>
                                            <Edit className="h-3.5 w-3.5 mr-1" />Retomar
                                        </Button>
                                        <Button variant="ghost" size="icon" aria-label="Descartar rascunho" className="h-8 w-8 text-destructive" onClick={() => setDraftToDelete(draft)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Planos salvos */}
                        {visiblePlans.map((plan) => (
                            <div key={plan.id} className="p-4 border rounded-xl bg-white hover:bg-primary/5 transition-colors">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h4 className="font-semibold text-sm break-words">{plan.name}</h4>
                                            {plan.is_active && <Badge variant="outline" className="border-green-300 text-green-700 shrink-0 text-xs">Ativo</Badge>}
                                            {!plan.is_active && <Badge variant="secondary" className="shrink-0 text-xs">Arquivado</Badge>}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {formatDate(plan.start_date)}
                                            {plan.end_date && ` → ${formatDate(plan.end_date)}`}
                                            {' '}• {Math.round(Number(plan.daily_calories) || 0).toLocaleString('pt-BR')} kcal/dia
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap max-w-full gap-1.5">
                                        <Button variant="outline" size="sm" aria-label={`Ver ${plan.name}`} onClick={() => openPreview(plan.id, true)}><Eye className="mr-1 h-4 w-4" />Ver plano</Button>
                                        {!plan.is_active && (
                                            <Button variant="default" size="icon" className="h-10 w-10" onClick={() => { handleSetActive(plan.id); setPlansModalOpen(false); }} aria-label={`Ativar ${plan.name}`} title="Ativar">
                                                <RefreshCw className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                        <Button variant="outline" size="sm" className="min-h-10" onClick={() => { handleEdit(plan.id); setPlansModalOpen(false); }} aria-label={`Editar ${plan.name}`} title="Editar">
                                            <Edit className="h-3.5 w-3.5 mr-1" />Editar
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => handleCopy(plan.id)} aria-label={`Copiar ${plan.name} para outro paciente`} title="Copiar para outro paciente">
                                            <Send className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => { setPlanToDelete(plan.id); setDeleteDialogOpen(true); }} aria-label={`Excluir ${plan.name}`} title="Excluir">
                                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>}
            {previewId && <MealPlanPreviewDialog planId={previewId} patientId={patientId} onClose={closePreview} onEdit={id => { setPreview({ id: null, fromList: false }); handleEdit(id); setPlansModalOpen(false); }} />}
        </>
    );
};

export default MealPlanList;
