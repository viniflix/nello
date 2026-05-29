import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { ArrowLeft, Plus, Copy, FileText, Download, RefreshCw, Utensils, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import MealPlanForm from '@/components/meal-plan/MealPlanForm';
import CopyModelDialog from '@/components/meal-plan/CopyModelDialog';
import TemplateManagerDialog from '@/components/meal-plan/TemplateManagerDialog';
import MealPlanViewer from '@/components/meal-plan/MealPlanViewer';
import MealPlanList from '@/components/meal-plan/MealPlanList';
import { useMealPlanController } from '@/hooks/useMealPlanController';
import { useAuth } from '@/contexts/AuthContext';
import PlanTargetMonitor from '@/components/meal-plan/PlanTargetMonitor';
import NotificationCenter from '@/components/meal-plan/NotificationCenter';
import { useMealPlan } from '@/hooks/useMealPlan';
import { MealPlanAlertsBar } from '@/components/anamnesis/MealPlanAlertsBar';
import { patientHubRoute } from '@/lib/utils/patientRoutes';
import { supabase } from '@/lib/customSupabaseClient';



const MealPlanPage = () => {
    const { patientId, paramValue } = useResolvedPatientId();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user } = useAuth();

    const [nutritionistId, setNutritionistId] = useState(null);
    const { plans, activePlan, pendingDrafts, loading, isFetching, loadPlans, invalidatePlans } = useMealPlan(patientId, nutritionistId);

    const {
        submitting, setSubmitting,
        patientName,
        referenceValues,
        showForm, setShowForm,
        editingPlan, setEditingPlan,
        deleteDialogOpen, setDeleteDialogOpen,
        planToDelete, setPlanToDelete,
        copyModelDialogOpen, setCopyModelDialogOpen,
        planToCopy, setPlanToCopy,
        exportDialogOpen, setExportDialogOpen,
        templateManagerOpen, setTemplateManagerOpen,
        saveTemplateDialogOpen, setSaveTemplateDialogOpen,
        templateName, setTemplateName,
        templateTags, setTemplateTags,
        discardAllDraftsDialogOpen, setDiscardAllDraftsDialogOpen,
        newPlanChoiceOpen, setNewPlanChoiceOpen,
        plansModalOpen, setPlansModalOpen,
        plansSearchTerm, setPlansSearchTerm,
        pendingDraft, setPendingDraft,
        discardingDraft,
        draftToDelete, setDraftToDelete,
        mealPlanVersions,
        selectedVersionId, setSelectedVersionId,
        restoringVersion,
        versionsExpanded, setVersionsExpanded,
        energyCalculation,
        syncFlags, setSyncFlags,
        
        handleDiscardPendingDraft,
        handleDiscardAllDrafts,
        handleResumePendingDraft,
        handleMarkMealPlanAsReviewed,
        handleSubmit,
        handleSaveDraft,
        handleEdit,
        handleArchive,
        handleSetActive,
        handleCopy,
        handleCopyToPatient,
        handleGenerateShoppingList,
        handleExportPDF,
        handleDelete,
        handleSaveAsTemplate,
        handleRestoreVersion,
        
        formatDate,
        getDaysLabel,
        formatRelativeTime,
        currentMetrics,
        baseMetrics,
        buildDelta
    } = useMealPlanController({
        patientId,
        nutritionistId,
        paramValue,
        plans,
        activePlan,
        pendingDrafts,
        loadPlans,
        invalidatePlans,
        user
    });

    // Obter ID do nutricionista
    useEffect(() => {
        const getNutritionistId = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setNutritionistId(user.id);
            }
        };
        getNutritionistId();
    }, []);

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-10 w-32" />
                </div>
                <Skeleton className="h-12 w-64" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                    <Skeleton className="h-[400px] w-full" />
                    <div className="md:col-span-2 space-y-4">
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-32 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (showForm) {
        return (
            <div className="container mx-auto px-4 py-8 max-w-6xl">
                <div className="mb-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                            setShowForm(false);
                            setEditingPlan(null);
                        }}
                    >
                        <ArrowLeft className="w-4 h-4 shrink-0" />
                        Voltar
                    </Button>
                </div>

                <MealPlanForm
                    patientId={patientId}
                    patientSlugOrId={paramValue}
                    nutritionistId={nutritionistId}
                    initialData={editingPlan}
                    pendingDraft={!editingPlan ? pendingDraft : null}
                    onSubmit={handleSubmit}
                    onSaveDraft={handleSaveDraft}
                    onCancel={() => {
                        setShowForm(false);
                        setEditingPlan(null);
                        setPendingDraft(null);
                    }}
                    onDraftDiscarded={() => setPendingDraft(null)}
                    loading={submitting}
                />
            </div>
        );
    }

    return (
        <div className={`container mx-auto px-4 py-6 sm:py-8 max-w-6xl transition-opacity duration-200 ${isFetching ? 'opacity-70 pointer-events-none' : 'opacity-100'}`}>
            {/* Sprint D: Barra de alertas clínicos da anamnese */}
            <MealPlanAlertsBar patientId={patientId} />

            {/* Header */}
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(patientHubRoute({ id: patientId, slug: paramValue }, 'nutrition'))}
                        className="gap-2 -ml-2 shrink-0 text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10 font-bold"
                    >
                        <ArrowLeft className="w-4 h-4 shrink-0" />
                        Voltar
                    </Button>
                    <Button variant="outline" size="sm" onClick={loadPlans} className="flex-shrink-0 border-2 font-bold h-9">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Atualizar
                    </Button>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
                            <Utensils className="w-6 h-6 sm:w-8 sm:h-8 text-[#5f6f52]" />
                            <span className="truncate">Planos Alimentares</span>
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Gerencie os planos alimentares do paciente
                        </p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        {activePlan && plans.length > 0 && (
                            <Button size="sm" variant="outline" onClick={() => setPlansModalOpen(true)} className="flex-1 sm:flex-initial gap-2 border-2 h-10 font-bold">
                                <FolderOpen className="h-4 w-4" />
                                Meus Planos
                                <Badge variant="outline" className="ml-1 h-5 min-w-[20px] px-1 justify-center border-[#5f6f52] text-[#5f6f52] font-black">{plans.length}</Badge>
                            </Button>
                        )}
                        <Button 
                            size="sm" 
                            onClick={() => setNewPlanChoiceOpen(true)} 
                            className="flex-1 sm:flex-initial h-10 px-6 font-bold bg-primary hover:bg-primary/90 text-white transition-all active:scale-95 shadow-sm"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Novo Plano
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-[3px]">
                {/* Centro de Notificações Inteligentes */}
                {!showForm && (
                    <NotificationCenter 
                        isDiscarding={discardingDraft}
                        pendingDrafts={pendingDrafts}
                        syncFlags={syncFlags}
                        onDiscardDraft={(draft) => setDraftToDelete(draft)}
                        onDiscardAllDrafts={() => setDiscardAllDraftsDialogOpen(true)}
                        onResumeDraft={handleResumePendingDraft}
                        onMarkAsReviewed={handleMarkMealPlanAsReviewed}
                        onReviewNow={() => {
                            if (activePlan?.id) {
                                handleEdit(activePlan.id);
                            } else {
                                setShowForm(true);
                            }
                        }}
                    />
                )}

                {/* Target Monitor - Status do GET vs Plano */}
                <PlanTargetMonitor
                    targetCalories={energyCalculation?.final_planned_kcal ?? energyCalculation?.get_with_activities ?? energyCalculation?.get ?? energyCalculation?.get_result ?? null}
                    currentCalories={activePlan?.daily_calories || 0}
                    patientId={patientId}
                    patientSlugOrId={paramValue}
                    energyCalculation={energyCalculation}
                />

                <MealPlanViewer
                    patientId={patientId}
                    patientSlugOrId={paramValue}
                    activePlan={activePlan}
                    referenceValues={referenceValues}
                    mealPlanVersions={mealPlanVersions}
                    versionsExpanded={versionsExpanded}
                    setVersionsExpanded={setVersionsExpanded}
                    selectedVersionId={selectedVersionId}
                    setSelectedVersionId={setSelectedVersionId}
                    restoringVersion={restoringVersion}
                    handleRestoreVersion={handleRestoreVersion}
                    currentMetrics={currentMetrics}
                    baseMetrics={baseMetrics}
                    buildDelta={buildDelta}
                    handleEdit={handleEdit}
                    setExportDialogOpen={setExportDialogOpen}
                    handleGenerateShoppingList={handleGenerateShoppingList}
                    handleCopy={handleCopy}
                    setSaveTemplateDialogOpen={setSaveTemplateDialogOpen}
                    handleArchive={handleArchive}
                    formatDate={formatDate}
                    getDaysLabel={getDaysLabel}
                />

                <MealPlanList
                    activePlan={activePlan}
                    plans={plans}
                    pendingDrafts={pendingDrafts}
                    plansModalOpen={plansModalOpen}
                    setPlansModalOpen={setPlansModalOpen}
                    plansSearchTerm={plansSearchTerm}
                    setPlansSearchTerm={setPlansSearchTerm}
                    handleResumePendingDraft={handleResumePendingDraft}
                    setDraftToDelete={setDraftToDelete}
                    handleSetActive={handleSetActive}
                    handleEdit={handleEdit}
                    handleCopy={handleCopy}
                    setPlanToDelete={setPlanToDelete}
                    setDeleteDialogOpen={setDeleteDialogOpen}
                    setShowForm={setShowForm}
                    setPendingDraft={setPendingDraft}
                    setEditingPlan={setEditingPlan}
                    setTemplateManagerOpen={setTemplateManagerOpen}
                    discardingDraft={discardingDraft}
                    formatDate={formatDate}
                    getDaysLabel={getDaysLabel}
                    formatRelativeTime={formatRelativeTime}
                />
            </div>

            {/* Dialog de Confirmação de Exclusão de Rascunho */}
            <AlertDialog open={!!draftToDelete} onOpenChange={(open) => !open && setDraftToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Descarte de Rascunho</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja descartar o rascunho <strong>"{draftToDelete?.name || 'Novo Plano'}"</strong>?
                            {draftToDelete && (
                                <div className="mt-4 p-3 bg-muted rounded-md text-sm space-y-1">
                                    <p className="font-semibold text-foreground">Conteúdo do rascunho:</p>
                                    <ul className="list-disc list-inside text-muted-foreground">
                                        <li>{draftToDelete.meals?.length || 0} refeições configuradas</li>
                                        <li>
                                            {(draftToDelete.meals || []).reduce((acc, meal) => acc + (meal.items?.length || 0), 0)} alimentos adicionados
                                        </li>
                                    </ul>
                                </div>
                            )}
                            <p className="mt-4 text-destructive font-medium">Esta ação não pode ser desfeita.</p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDraftToDelete(null)}>
                            Manter rascunho
                        </AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={async () => {
                                const id = draftToDelete.id;
                                setDraftToDelete(null);
                                await handleDiscardPendingDraft(id);
                            }} 
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            {discardingDraft ? 'Descartando...' : 'Descartar rascunho'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Dialog de Descartar TODOS os Rascunhos */}
            <AlertDialog open={discardAllDraftsDialogOpen} onOpenChange={setDiscardAllDraftsDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-destructive">Descartar TODOS os Rascunhos?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação removerá permanentemente os <strong>{pendingDrafts.length} rascunhos</strong> deste paciente.
                            Planos alimentares já ativos ou arquivados não serão afetados.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDiscardAllDraftsDialogOpen(false)}>
                            Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleDiscardAllDrafts} 
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            {discardingDraft ? 'Descartando...' : 'Descartar Tudo'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Dialog de Confirmação de Exclusão */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja deletar este plano alimentar? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPlanToDelete(null)}>
                            Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive">
                            Deletar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Dialog de Copiar Modelo */}
            <CopyModelDialog
                isOpen={copyModelDialogOpen}
                onClose={() => {
                    setCopyModelDialogOpen(false);
                    setPlanToCopy(null);
                }}
                planId={planToCopy?.id}
                planName={planToCopy?.name}
                onCopy={handleCopyToPatient}
            />

            {/* Dialog: Salvar como Template */}
            <Dialog open={saveTemplateDialogOpen} onOpenChange={setSaveTemplateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Salvar Plano como Modelo</DialogTitle>
                        <DialogDescription>
                            Salve este plano como um template para reutilizar em outros pacientes.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label htmlFor="template-name" className="text-sm font-medium">
                                Nome do Modelo <span className="text-destructive">*</span>
                            </label>
                            <Input
                                id="template-name"
                                placeholder="Ex: Hipertrofia 3000kcal"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                disabled={submitting}
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="template-tags" className="text-sm font-medium">
                                Tags (separadas por vírgula)
                            </label>
                            <Input
                                id="template-tags"
                                placeholder="Ex: hipertrofia, ganho de peso, 3000kcal"
                                value={templateTags}
                                onChange={(e) => setTemplateTags(e.target.value)}
                                disabled={submitting}
                            />
                            <p className="text-xs text-muted-foreground">
                                Use tags para facilitar a busca dos templates
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSaveTemplateDialogOpen(false);
                                setTemplateName('');
                                setTemplateTags('');
                            }}
                            disabled={submitting}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSaveAsTemplate}
                            disabled={submitting || !templateName.trim()}
                        >
                            {submitting ? 'Salvando...' : 'Salvar Modelo'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog de Exportação PDF */}
            <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Exportar Plano Alimentar</DialogTitle>
                        <DialogDescription>
                            Escolha o formato de exportação para PDF
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 py-4">
                        <Card
                            className="cursor-pointer hover:bg-accent/50 transition-colors border-2 hover:border-primary"
                            onClick={() => handleExportPDF(false)}
                        >
                            <CardContent className="flex items-start gap-3 p-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <h4 className="text-sm font-semibold leading-none">Plano Simples</h4>
                                    <p className="text-xs text-muted-foreground">
                                        Macronutrientes básicos (calorias, proteínas, carboidratos e gorduras)
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card
                            className="cursor-pointer hover:bg-accent/50 transition-colors border-2 hover:border-primary"
                            onClick={() => handleExportPDF(true)}
                        >
                            <CardContent className="flex items-start gap-3 p-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                                    <Download className="h-5 w-5" />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <h4 className="text-sm font-semibold leading-none">Plano Completo</h4>
                                    <p className="text-xs text-muted-foreground">
                                        Macros + micronutrientes (fibras, vitaminas, minerais)
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <DialogFooter className="sm:justify-start">
                        <Button variant="ghost" onClick={() => setExportDialogOpen(false)} className="w-full sm:w-auto">
                            Cancelar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* ── Modal: Escolha para Novo Plano ──────────────────────────────── */}
            <Dialog open={newPlanChoiceOpen} onOpenChange={setNewPlanChoiceOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="w-5 h-5 text-primary" />
                            Novo Plano Alimentar
                        </DialogTitle>
                        <DialogDescription>
                            Como deseja criar o novo plano?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 gap-3 py-2">
                        <Card
                            className="cursor-pointer hover:bg-accent/50 transition-colors border-2 hover:border-primary"
                            onClick={() => {
                                setNewPlanChoiceOpen(false);
                                setPendingDraft(null);
                                setEditingPlan(null);
                                setShowForm(true);
                            }}
                        >
                            <CardContent className="flex items-start gap-3 p-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Plus className="h-5 w-5" />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <h4 className="text-sm font-semibold leading-none">Criar do zero</h4>
                                    <p className="text-xs text-muted-foreground">
                                        Montar um novo plano personalizado, adicionando refeições e alimentos manualmente.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card
                            className="cursor-pointer hover:bg-accent/50 transition-colors border-2 hover:border-primary"
                            onClick={() => {
                                setNewPlanChoiceOpen(false);
                                setTemplateManagerOpen(true);
                            }}
                        >
                            <CardContent className="flex items-start gap-3 p-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                                    <Copy className="h-5 w-5" />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <h4 className="text-sm font-semibold leading-none">Usar protocolo</h4>
                                    <p className="text-xs text-muted-foreground">
                                        Importar um plano do banco de protocolos e adaptá-lo para este paciente.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Modal: Importar Protocolo de Dieta ────────────────────── */}
            <TemplateManagerDialog
                open={templateManagerOpen}
                onOpenChange={setTemplateManagerOpen}
                patientId={patientId}
                nutritionistId={nutritionistId}
                onTemplateApplied={(newPlan) => {
                    loadPlans();
                    if (newPlan?.id) {
                        toast({ title: 'Protocolo aplicado!', description: 'O plano foi importado e ativado para o paciente.' });
                    }
                }}
            />

        </div>
    );
};

export default MealPlanPage;
