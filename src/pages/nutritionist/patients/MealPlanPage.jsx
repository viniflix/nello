import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { ArrowLeft, Plus, Copy, FileText, Download, RefreshCw, Utensils, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import WorkingDraftRecovery from '@/components/meal-plan/WorkingDraftRecovery';
import { getMealPlanById } from '@/lib/supabase/meal-plan-queries';
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
import { useMealPlanSession, isMealPlanSession, latestAppliedAt, sessionWasSuperseded } from '@/hooks/useMealPlanSession';
import { sessionMatchesAppliedPlan } from '@/lib/utils/appliedMealPlanSession';
import { ShadowRecovery } from '@/components/ui/shadow-save-status';



const MealPlanPage = () => {
    const resolvedPatient = useResolvedPatientId();
    const { user } = useAuth();
    return <MealPlanPageContent key={`${user?.id || 'anonymous'}:${resolvedPatient.paramValue}`} resolvedPatient={resolvedPatient} />;
};

const MealPlanPageContent = ({ resolvedPatient }) => {
    const { patientId, paramValue } = resolvedPatient;
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { toast } = useToast();
    const { user } = useAuth();
    const quickEntryHandledRef = useRef(false);
    const beforeCloseRef = useRef(null);

    const [nutritionistId, setNutritionistId] = useState(null);
    // Keep only navigation identifiers across access-triggered data reloads.
    // The preview reloads its protected data on remount and cannot cross scopes.
    const [planPreview, setPlanPreview] = useState(null);
    const previewScope = `${nutritionistId}:${patientId}`;
    const [workingDraft, setWorkingDraft] = useState(null);
    const [restoredSession, setRestoredSession] = useState(null);
    const automaticSessionRef = useRef(false);
    const [sessionError, setSessionError] = useState(false);
    const [sessionOpening, setSessionOpening] = useState(false);
    const [supersededSession, setSupersededSession] = useState(null);
    const [completedSession, setCompletedSession] = useState(false);
    const [sessionRestoreNumber, setSessionRestoreNumber] = useState(0);
    const session = useMealPlanSession({ ownerId: nutritionistId, patientId });
    const sessionScopeRef = useRef('');
    sessionScopeRef.current = `${nutritionistId}:${patientId}`;
    useEffect(() => () => { sessionScopeRef.current = ''; }, []);
    const { plans, activePlan, pendingDrafts, loading, isFetching, error: plansError, loadPlans, invalidatePlans } = useMealPlan(patientId, nutritionistId);

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

    const resumeWorkingDraft = async row => {
        const scope = sessionScopeRef.current;
        const planId = row.payload?.context?.planId || row.draft_key.split(':')[2];
        let plan = null;
        if (planId !== 'new') {
            const result = await getMealPlanById(planId);
            if (sessionScopeRef.current !== scope) return;
            if (result.error || !result.data || result.data.patient_id !== patientId) throw new Error('Plan unavailable');
            plan = result.data;
        }
        // Preserve any current edit before switching to another confirmed copy.
        if (showForm && beforeCloseRef.current) {
            const closed = await beforeCloseRef.current();
            if (sessionScopeRef.current !== scope) return;
            if (closed === false) throw new Error('Current edit unconfirmed');
        }
        setPendingDraft(plan?.is_draft ? plan : null);
        setEditingPlan(plan?.is_draft ? null : plan);
        setWorkingDraft(row);
        setRestoredSession(null);
        setSessionRestoreNumber(value => value + 1);
        setShowForm(true);
    };

    useEffect(() => { setPlanPreview(null); automaticSessionRef.current = false; setRestoredSession(null); setSessionError(false); setSessionOpening(false); setSupersededSession(null); setCompletedSession(false); }, [nutritionistId, patientId]);
    const restoreSavedSession = async (saved, cancelled = () => false, automatic = false, onAccepted = () => {}) => {
        const scope = sessionScopeRef.current;
        let plan = null;
        if (saved.planId) {
            const result = await getMealPlanById(saved.planId);
            if (result.error || !result.data || result.data.patient_id !== patientId) throw new Error('Session plan unavailable');
            plan = result.data;
        }
        if (cancelled() || sessionScopeRef.current !== scope) return false;
        // Consuming recovery changes the effect dependency. Mark acceptance before
        // that render so its cleanup cannot leave the page in the opening state.
        if (automatic) { onAccepted(); setSessionOpening(false); }
        if (automatic && (sessionWasSuperseded(saved, plans, session.lastSavedAt, plan) || sessionMatchesAppliedPlan(saved, plan))) {
            // Preserve the copy for explicit recovery; the newer applied plan wins.
            setSupersededSession(saved);
            setCompletedSession(sessionMatchesAppliedPlan(saved, plan));
            session.restore();
            return true;
        }
        session.restore();
        setSupersededSession(null);
        setCompletedSession(false);
        setPendingDraft(plan?.is_draft ? plan : null);
        setEditingPlan(plan?.is_draft ? null : plan);
        setWorkingDraft(null);
        setRestoredSession(saved);
        setSessionRestoreNumber(value => value + 1);
        setShowForm(true);
        toast({ title: 'Sua edição foi retomada', description: saved.baseRevision && plan?.updated_at !== saved.baseRevision ? 'O plano foi atualizado após essa sessão. Restauramos sua edição para revisão antes de aplicar.' : 'Restauramos o plano e os campos em andamento da sessão salva.' });
        return true;
    };
    useEffect(() => {
        const saved = session.recovery?.payload;
        if (!session.ready || loading || isFetching || plansError || !isMealPlanSession(saved) || automaticSessionRef.current || session.recovery.conflict) return;
        automaticSessionRef.current = true;
        setSessionOpening(true);
        let cancelled = false;
        let completed = false;
        const resume = async () => {
            try {
                completed = await restoreSavedSession(saved, () => cancelled, true, () => { completed = true; });
            } catch { if (!cancelled) { completed = true; setSessionError(true); } }
            finally { if (!cancelled) setSessionOpening(false); }
        };
        void resume();
        return () => { cancelled = true; if (!completed) automaticSessionRef.current = false; };
    // Recovery is read once per patient; status changes must not cancel the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session.ready, session.recovery, loading, isFetching, plansError, patientId, nutritionistId]);

    useEffect(() => { if (session.status === 'idle') setSupersededSession(null); }, [session.status]);

    // Obter ID do nutricionista
    useEffect(() => { if (!showForm) { setWorkingDraft(null); setRestoredSession(null); } }, [showForm]);

    useEffect(() => {
        const getNutritionistId = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setNutritionistId(user.id);
            }
        };
        getNutritionistId();
    }, []);

    // Entrada rápida vinda do Hub: retoma o rascunho, ajusta o plano vigente
    // ou abre um plano novo sem passar pelo modal intermediário.
    useEffect(() => {
        if (searchParams.get('quick') !== '1') {
            quickEntryHandledRef.current = false;
            return;
        }
        if (quickEntryHandledRef.current || loading || isFetching || !patientId || !nutritionistId || !session.ready || isMealPlanSession(session.recovery?.payload)) return;

        quickEntryHandledRef.current = true;
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('quick');
        setSearchParams(nextParams, { replace: true });

        const openDirectly = async () => {
            const appliedAt = latestAppliedAt(plans);
            const recentDraft = pendingDrafts.find(draft => !appliedAt || Date.parse(draft.updated_at || draft.created_at) > Date.parse(appliedAt));
            if (recentDraft) {
                await handleResumePendingDraft(recentDraft);
                return;
            }
            if (plans.some(plan => !plan.is_draft && !plan.is_template)) {
                setShowForm(false);
                return;
            }
            setPendingDraft(null);
            setEditingPlan(null);
            setShowForm(true);
        };
        void openDirectly();
    }, [
        activePlan, handleEdit, handleResumePendingDraft, isFetching, loading,
        nutritionistId, patientId, pendingDrafts, plans, searchParams, setEditingPlan,
        setPendingDraft, setSearchParams, setShowForm,
        session.ready, session.recovery,
    ]);

    if (loading || !session.ready || sessionOpening || (isMealPlanSession(session.recovery?.payload) && !plansError && !automaticSessionRef.current && !sessionError && !session.recovery.conflict)) {
        return (
            <div className="container mx-auto px-4 py-6 max-w-[1440px] space-y-6">
                <div className="flex flex-wrap gap-3 items-center justify-between">
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

    if (plansError && !isFetching) {
        return <div className="container mx-auto max-w-6xl px-4 py-8">
            <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                Não foi possível carregar o plano completo. Confira a conexão e tente novamente.
                <Button type="button" variant="outline" onClick={() => loadPlans()}>Tentar novamente</Button>
            </AlertDescription></Alert>
        </div>;
    }

    if (showForm) {
        return (
            <div className="container mx-auto px-4 py-8 max-w-6xl">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <div className="mr-auto"><h1 className="text-2xl font-semibold">Montar plano alimentar</h1><p className="text-sm text-muted-foreground">Organize as refeições, confira as porções e salve o plano ao concluir.</p></div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={() => { void beforeCloseRef.current?.(); }}
                    >
                        <ArrowLeft className="w-4 h-4 shrink-0" />
                        Voltar
                    </Button>
                </div>

                <details className="mb-4 rounded border p-3 text-sm"><summary className="cursor-pointer font-medium">Rascunhos e recuperação · últimas edições salvas</summary>
                    {(session.snapshots || []).map((saved, index) => <Button key={index} type="button" variant="outline" size="sm" className="m-1" onClick={() => { void beforeCloseRef.current?.().then(closed => { if (closed !== false) return restoreSavedSession(saved); }).catch(() => setSessionError(true)); }}>Recuperar estado {index + 1}{saved.savedAt ? ` · ${formatDate(saved.savedAt)}` : ''}</Button>)}
                    <WorkingDraftRecovery ownerId={nutritionistId} patientId={patientId} onResume={resumeWorkingDraft} maxDrafts={Math.max(0, 3 - (session.snapshots?.length || 0))} />
                    <p className="mt-3 text-xs text-muted-foreground">O rascunho atual é retomado automaticamente. Use os estados abaixo apenas para recuperar outra edição.</p>
                <Button type="button" variant="ghost" size="sm" className="mb-3" onClick={async () => {
                    if (!window.confirm('Descartar esta sessão de edição? O plano já aplicado será preservado.')) return;
                    if (await session.discard()) { setShowForm(false); setEditingPlan(null); setPendingDraft(null); }
                }}>Descartar sessão de edição</Button>
                </details>
                {sessionError && <p role="alert" className="mb-3 text-sm text-destructive">Não foi possível abrir a sessão. O rascunho foi preservado; tente novamente.</p>}
                {session.recovery?.conflict && <ShadowRecovery recovery={session.recovery} onRestore={() => { void restoreSavedSession(session.recovery.payload).catch(() => setSessionError(true)); }} onDiscard={() => { void session.discardRecovery(); }} />}

                <MealPlanForm
                    key={`meal-plan-editor-${sessionRestoreNumber}`}
                    patientId={patientId}
                    patientSlugOrId={paramValue}
                    nutritionistId={nutritionistId}
                    initialData={editingPlan}
                    recoveryDraft={workingDraft}
                    restoredSession={restoredSession}
                    baselineAppliedAt={latestAppliedAt(plans)}
                    session={{ ...session, reopen: () => restoreSavedSession(session.recovery.payload).catch(() => setSessionError(true)) }}
                    beforeCloseRef={beforeCloseRef}
                    pendingDraft={!editingPlan ? pendingDraft : null}
                    onSubmit={async (...args) => {
                        const saved = await handleSubmit(...args);
                        if (saved) {
                            setRestoredSession(null);
                            setWorkingDraft(null);
                        }
                        return saved;
                    }}
                    onSaveDraft={handleSaveDraft}
                    onSaved={() => {
                        automaticSessionRef.current = true;
                        setShowForm(false);
                        setEditingPlan(null);
                        setPendingDraft(null);
                        setRestoredSession(null);
                        setWorkingDraft(null);
                    }}
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
            {supersededSession && <p role="status" className="mb-3 text-sm text-muted-foreground">{completedSession ? 'Esta edição já corresponde ao plano salvo. Mantivemos a listagem dos planos.' : 'Há um plano aplicado mais recente. A edição anterior não foi reaberta automaticamente.'}</p>}
            {Boolean(session.snapshots?.length) && <details className="mb-4 rounded border p-3 text-sm"><summary className="cursor-pointer font-medium">Últimos estados salvos (até 3)</summary>
                {session.snapshots.map((saved, index) => <Button key={index} type="button" variant="outline" size="sm" className="m-1" onClick={() => { void restoreSavedSession(saved).catch(() => setSessionError(true)); }}>Recuperar estado {index + 1}{saved.savedAt ? ` · ${formatDate(saved.savedAt)}` : ''}</Button>)}
            </details>}
            {sessionError && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">A sessão salva foi preservada, mas não pôde ser aberta. Recarregue para tentar novamente.</p>}
            {session.recovery?.conflict && <ShadowRecovery recovery={session.recovery} onRestore={() => { void restoreSavedSession(session.recovery.payload).catch(() => setSessionError(true)); }} onDiscard={() => { void session.discardRecovery(); }} />}

            {/* Header */}
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-wrap gap-3 items-center justify-between">
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
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0 flex-[1_1_20rem]">
                        <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
                            <Utensils className="h-6 w-6 shrink-0 text-[#5f6f52] sm:h-8 sm:w-8" />
                            <span className="min-w-0 break-words leading-tight">Planos Alimentares</span>
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Confira o plano atual, acompanhe a análise e organize as próximas edições.
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
                            className="flex-1 sm:flex-initial h-10 px-6 font-bold bg-primary hover:bg-primary/90 text-white transition-colors motion-reduce:transition-none shadow-sm"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Novo Plano
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-5">
                <WorkingDraftRecovery ownerId={nutritionistId} patientId={patientId} onResume={resumeWorkingDraft} maxDrafts={Math.max(0, 3 - (session.snapshots?.length || 0))} />
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

                <MealPlanList key={patientId}
                    previewState={planPreview?.scope === previewScope ? planPreview : { id: null, fromList: false }}
                    setPreviewState={value => setPlanPreview({ ...value, scope: previewScope })}
                    patientId={patientId}
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

            {/* Confirmação de arquivamento auditável */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>ARQUIVAR PLANO ALIMENTAR</AlertDialogTitle>
                        <AlertDialogDescription>
                            O plano deixará de aparecer como ativo, mas continuará preservado no histórico clínico e na auditoria.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPlanToDelete(null)}>
                            Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive">
                            Arquivar plano
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
                        <Card as="button" type="button"
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

                        <Card as="button" type="button"
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
                        <Card as="button" type="button"
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

                        <Card as="button" type="button"
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
