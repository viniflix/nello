import React from 'react';
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
    Plus, Copy, Edit, Trash2, RefreshCw, Send, Utensils, FolderOpen, Search 
} from 'lucide-react';

const MealPlanList = ({
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
    return (
        <>
            {/* Lista de Planos - Inline quando NÃO tem plano ativo */}
            {!activePlan && (
                <Card>
                    <CardHeader>
                        <CardTitle>Todos os Planos</CardTitle>
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
                                <div className="flex flex-col sm:flex-row gap-4 w-full justify-center px-4">
                                    <Button 
                                        onClick={() => {
                                            setPendingDraft(null);
                                            setEditingPlan(null);
                                            setShowForm(true);
                                        }}
                                        size="lg"
                                        className="font-bold h-12 px-8 bg-primary hover:bg-primary/90 text-white w-full sm:w-auto shadow-md"
                                    >
                                        <Plus className="w-5 h-5 mr-2" />
                                        Criar Primeiro Plano
                                    </Button>
                                    <Button 
                                        variant="outline" 
                                        size="lg"
                                        onClick={() => setTemplateManagerOpen(true)}
                                        className="font-bold h-12 px-8 border-2 w-full sm:w-auto"
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
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold text-amber-900">{draft.name || 'Novo Plano Alimentar'}</h3>
                                                    <Badge className="bg-amber-500 hover:bg-amber-600">Rascunho</Badge>
                                                </div>
                                                <div className="text-sm text-amber-700/80 mt-1">
                                                    {formatRelativeTime(draft.updated_at)} • Pendente
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100" onClick={() => handleResumePendingDraft(draft)} title="Retomar edição">
                                                    <Edit className="h-4 w-4 mr-2" />Retomar
                                                </Button>
                                                <Button variant="ghost" size="sm" className="text-destructive hover:bg-red-50 hover:text-destructive" onClick={() => setDraftToDelete(draft)} disabled={discardingDraft} title="Descartar rascunho">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {plans.map((plan) => (
                                    <div key={plan.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold">{plan.name}</h3>
                                                    {plan.is_active && <Badge variant="outline" className="border-green-300 text-green-700">Ativo</Badge>}
                                                    {!plan.is_active && <Badge variant="secondary">Arquivado</Badge>}
                                                </div>
                                                <div className="text-sm text-muted-foreground mt-1">
                                                    {formatDate(plan.start_date)}
                                                    {plan.end_date && ` até ${formatDate(plan.end_date)}`}
                                                    {' '}• {getDaysLabel(plan.active_days)}
                                                    {' '}• {plan.daily_calories?.toFixed(0) || 0} kcal/dia
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                {!plan.is_active && (
                                                    <Button variant="default" size="sm" onClick={() => handleSetActive(plan.id)} title="Ativar este plano">
                                                        <RefreshCw className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                <Button variant="outline" size="sm" onClick={() => handleEdit(plan.id)} title="Editar plano">
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => handleCopy(plan.id)} title="Enviar para paciente">
                                                    <Send className="h-4 w-4" />
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => { setPlanToDelete(plan.id); setDeleteDialogOpen(true); }} title="Deletar plano">
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
            <Dialog open={plansModalOpen} onOpenChange={(open) => { setPlansModalOpen(open); if (!open) setPlansSearchTerm(''); }}>
                <DialogContent className="max-w-3xl max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
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
                            placeholder="Buscar por nome do plano..."
                            value={plansSearchTerm}
                            onChange={(e) => setPlansSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    <div className="overflow-y-auto max-h-[50vh] space-y-2 pr-1">
                        {/* Rascunhos */}
                        {pendingDrafts.filter(d => !plansSearchTerm || (d.name || '').toLowerCase().includes(plansSearchTerm.toLowerCase())).map((draft) => (
                            <div key={draft.id} className="p-3 border-2 border-amber-200 bg-amber-50/50 border-dashed rounded-lg">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-sm text-amber-900 truncate">{draft.name || 'Novo Plano'}</h4>
                                            <Badge className="bg-amber-500 hover:bg-amber-600 shrink-0 text-[10px]">Rascunho</Badge>
                                        </div>
                                        <p className="text-xs text-amber-700/70 mt-0.5">{formatRelativeTime(draft.updated_at)}</p>
                                    </div>
                                    <div className="flex gap-1.5 shrink-0">
                                        <Button variant="outline" size="sm" className="h-8 border-amber-300 text-amber-800" onClick={() => { handleResumePendingDraft(draft); setPlansModalOpen(false); }}>
                                            <Edit className="h-3.5 w-3.5 mr-1" />Retomar
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDraftToDelete(draft)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Planos salvos */}
                        {plans.filter(p => !plansSearchTerm || p.name.toLowerCase().includes(plansSearchTerm.toLowerCase())).map((plan) => (
                            <div key={plan.id} className="p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-sm truncate">{plan.name}</h4>
                                            {plan.is_active && <Badge variant="outline" className="border-green-300 text-green-700 shrink-0 text-[10px]">Ativo</Badge>}
                                            {!plan.is_active && <Badge variant="secondary" className="shrink-0 text-[10px]">Arquivado</Badge>}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {formatDate(plan.start_date)}
                                            {plan.end_date && ` → ${formatDate(plan.end_date)}`}
                                            {' '}• {plan.daily_calories?.toFixed(0) || 0} kcal/dia
                                        </p>
                                    </div>
                                    <div className="flex gap-1.5 shrink-0">
                                        {!plan.is_active && (
                                            <Button variant="default" size="icon" className="h-8 w-8" onClick={() => { handleSetActive(plan.id); setPlansModalOpen(false); }} title="Ativar">
                                                <RefreshCw className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { handleEdit(plan.id); setPlansModalOpen(false); }} title="Editar">
                                            <Edit className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleCopy(plan.id)} title="Enviar para paciente">
                                            <Send className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setPlanToDelete(plan.id); setDeleteDialogOpen(true); }} title="Deletar">
                                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default MealPlanList;
