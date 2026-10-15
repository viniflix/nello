import { useCoordinatedLoader } from '@/hooks/useCoordinatedLoader';
import { observeResources } from '@/lib/utils/resourceReads';
import { useResourceSnapshot } from '@/hooks/useResourceSnapshot';
import { ResourceStatus } from '@/components/ui/resource-status';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { format, startOfMonth } from 'date-fns';
import Papa from 'papaparse';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/infrastructure/supabase/client';

// Components
import FinancialKPIs from '@/components/financial/FinancialKPIs';
import '@/components/financial/financial-workspace.css';
import FinancialToolbar from '@/components/financial/FinancialToolbar';
import FinancialCharts from '@/components/financial/FinancialCharts';
import TransactionList from '@/components/financial/TransactionList';
import TransactionDialog from '@/components/financial/TransactionDialog';
import ServicesManager from '@/components/financial/ServicesManager';
import PendingPaymentsWidget from '@/components/financial/PendingPaymentsWidget';
import TopPatientsWidget from '@/components/financial/TopPatientsWidget';
import FinancialGoal from '@/components/financial/FinancialGoal';
import TransactionDetails from '@/components/financial/TransactionDetails';
import FinancialSummaryDialog from '@/components/financial/FinancialSummaryDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/utils';

// Queries
import {
    getFinancialMonthRows,
    getPendingPayments,
    saveTransaction,
    saveMultipleTransactions,
    deleteTransaction,
    getProjectedCashFlow,
    getPatientsForAutocomplete,
    getServices,
    updateTransactionStatus,
    refundTransaction
} from '@/lib/supabase/financial-queries';
import { exportFinancialReport } from '@/lib/utils/exportUtils';
import { getClinicSettings } from '@/lib/supabase/profile-queries';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { Events, track } from '@/infrastructure/analytics/posthog';
import { readAgendaReturn } from '@/lib/agenda/navigation';
import { getFinancialTransactionById } from '@/lib/supabase/financial-queries';
import { summarizeFinancialTransactions, buildFinancialCashFlow, buildFinancialExpenseDistribution, formatFinancialDecimal } from '@/lib/utils/financial-math';

export default function FinancialPage() {
    const { user } = useAuth();
    return <FinancialPageContent key={user?.id || 'signed-out'} />;
}

function FinancialPageContent() {
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const agendaReturn = readAgendaReturn(location.state?.agendaReturn, user?.id);
    const agendaTransactionId = agendaReturn ? location.state?.agendaTransactionId : null;
    const [agendaLinkState, setAgendaLinkState] = useState('idle');
    const returnView = user?.id && location.state?.financialReturn?.userId === user.id ? location.state.financialReturn : null;

    // State
    const [selectedMonth, setSelectedMonth] = useState(() => /^\d{4}-(0[1-9]|1[0-2])$/.test(returnView?.month || '') ? new Date(returnView.month + '-02T12:00:00') : new Date());
    const monthKey = format(selectedMonth, 'yyyy-MM');
    const monthResource = useResourceSnapshot(JSON.stringify([user?.id, monthKey]), []);
    const { begin: beginMonth, succeed: confirmMonth, fail: failMonth } = monthResource;
    const monthRows = monthResource.data;
    const loading = monthResource.initialLoading;
    const loadError = Boolean(monthResource.error);
    const unavailable = loadError && !monthResource.hasSnapshot;
    const goalResource = useResourceSnapshot(JSON.stringify([user?.id, 'goal']), null);
    const { begin: beginGoal, succeed: confirmGoal, fail: failGoal } = goalResource;
    const monthlyGoal = goalResource.data;
    const goalState = goalResource.hasSnapshot ? 'ready' : goalResource.error ? 'error' : 'loading';
    const patientsResource = useResourceSnapshot(JSON.stringify([user?.id, 'patients']), []);
    const patients = patientsResource.data;
    const { begin: beginPatients, succeed: confirmPatients, fail: failPatients } = patientsResource;
    const servicesResource = useResourceSnapshot(JSON.stringify([user?.id, 'services']), []);
    const services = servicesResource.data;
    const { begin: beginServices, succeed: confirmServices, fail: failServices } = servicesResource;
    const projectionResource = useResourceSnapshot(JSON.stringify([user?.id, 'projection']), []);
    const projectedCashFlow = projectionResource.data;
    const { begin: beginProjection, succeed: confirmProjection, fail: failProjection } = projectionResource;
    const [rankingRevision, setRankingRevision] = useState(0);
    const pendingResource = useResourceSnapshot(JSON.stringify([user?.id, 'pending']), []);
    const pendingPayments = pendingResource.data;
    const { begin: beginPending, succeed: confirmPending, fail: failPending } = pendingResource;
    const transactionSaveLock = useRef(false);
    const mutationLock = useRef(false);
    const [mutationBusy, setMutationBusy] = useState(false);
    const [mutationError, setMutationError] = useState(false);
    const loadRequest = useRef(0);
    const auxiliaryRequest = useRef(0);
    const auxiliaryState = Object.fromEntries(Object.entries({ projection: projectionResource, patients: patientsResource, services: servicesResource, pending: pendingResource })
        .map(([key, resource]) => [key, resource.hasSnapshot ? 'ready' : resource.error ? 'error' : 'loading']));
    const auxiliaryReads = useMemo(() => ({
        projection: { begin: beginProjection, succeed: confirmProjection, fail: failProjection },
        patients: { begin: beginPatients, succeed: confirmPatients, fail: failPatients },
        services: { begin: beginServices, succeed: confirmServices, fail: failServices },
        pending: { begin: beginPending, succeed: confirmPending, fail: failPending }
    }), [beginProjection, confirmProjection, failProjection, beginPatients, confirmPatients, failPatients, beginServices, confirmServices, failServices, beginPending, confirmPending, failPending]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isServicesManagerOpen, setIsServicesManagerOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [paymentConfirm, setPaymentConfirm] = useState(null);
    const [refundConfirm, setRefundConfirm] = useState(null);
    const [filters, setFilters] = useState(() => ({ type: ['income', 'expense'].includes(returnView?.filters?.type) ? returnView.filters.type : null, status: ['paid', 'pending', 'overdue', 'refunded'].includes(returnView?.filters?.status) ? returnView.filters.status : null, search: typeof returnView?.filters?.search === 'string' ? returnView.filters.search : null }));
    const [workspaceView, setWorkspaceView] = useState(() => ['overview', 'history', 'analysis'].includes(returnView?.view) ? returnView.view : 'overview');
    const [metricView, setMetricView] = useState(null);
    const metricTrigger = useRef(null);
    const [inspectedTransaction, setInspectedTransaction] = useState(null);
    useEffect(() => { setInspectedTransaction(null); setAgendaLinkState('idle'); }, [user?.id]);
    useEffect(() => {
        if (!user?.id || !agendaTransactionId) return;
        let active = true;
        setAgendaLinkState('loading');
        getFinancialTransactionById(user.id, agendaTransactionId)
            .then(row => { if (active) { setInspectedTransaction(row); setAgendaLinkState('ready'); } })
            .catch(() => { if (active) setAgendaLinkState('error'); });
        const denied = [monthResource, goalResource, projectionResource, pendingResource, patientsResource, servicesResource].find(resource => ['forbidden', 'unauthenticated'].includes(resource.error?.kind));
    if (denied) return <ResourceStatus resource={denied} label="financeiro" onRetry={loadData} />;
    return () => { active = false; };
    }, [user?.id, agendaTransactionId]);
    const [goalRevision, setGoalRevision] = useState(0);
    const openFinancialSettings = () => navigate('/nutritionist/profile?tab=financial', { state: { financialReturn: { userId: user?.id, month: format(selectedMonth, 'yyyy-MM'), filters, view: workspaceView } } });
    const monthStartKey = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
    const monthEndKey = format(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0), 'yyyy-MM-dd');
    const summary = useMemo(() => summarizeFinancialTransactions(monthRows, monthStartKey, monthEndKey, format(new Date(), 'yyyy-MM-dd')), [monthRows, monthStartKey, monthEndKey]);
    const cashFlowData = useMemo(() => buildFinancialCashFlow(monthRows, monthStartKey, monthEndKey), [monthRows, monthStartKey, monthEndKey]);
    const expenseDistribution = useMemo(() => buildFinancialExpenseDistribution(monthRows, monthStartKey, monthEndKey), [monthRows, monthStartKey, monthEndKey]);
    const transactions = useMemo(() => monthRows.filter((row) =>
        (!filters.type || row.type === filters.type) &&
        (!filters.status || (filters.status === 'overdue'
            ? ['pending', 'overdue'].includes(row.status) && (row.status === 'overdue' || row.due_date < format(new Date(), 'yyyy-MM-dd'))
            : row.status === filters.status)) &&
        (!filters.search || String(row.description || '').toLocaleLowerCase('pt-BR').includes(filters.search.toLocaleLowerCase('pt-BR')))
    ).sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)) || b.id - a.id), [monthRows, filters]);

    const loadGoal = useCoordinatedLoader(useCallback(async () => {
        if (!user?.id) return;
        const ticket = beginGoal();
        try {
            const settings = await getClinicSettings(user.id), raw = settings.monthlyFinancialGoal;
            const value = raw == null || raw === '' ? null : Number(raw);
            if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error('Invalid financial goal');
            confirmGoal(ticket, value);
        } catch (error) { failGoal(ticket, error); }
    }, [user?.id, beginGoal, confirmGoal, failGoal]), goalResource.scopeKey, ['profile','clinical']);
    useEffect(() => { void loadGoal(); }, [loadGoal, goalRevision]);

    // Only transactions depend on the selected month.
    const loadData = useCoordinatedLoader(useCallback(async () => {
        if (!user?.id) return;
        const request = ++loadRequest.current;
        const started = performance.now();
        const ticket = beginMonth();
        try {
            const rows = await getFinancialMonthRows(user.id, new Date(monthKey + '-02T12:00:00'));
            if (request !== loadRequest.current) return;
            confirmMonth(ticket, rows);
            track(Events.DATA_LOAD_TIMING, { operation: 'financial_month', duration_ms: Math.round(performance.now() - started), result_count: rows.length });
        } catch (error) {
            if (request !== loadRequest.current) return;
            logDiagnostic('error', 'pages/nutritionist/tools/FinancialPage.jsx:112', 'Falha ao carregar lançamentos financeiros', { code: error?.code || 'unknown' });
            failMonth(ticket, error);
            toast({ title: 'Erro', description: 'Não foi possível carregar os dados financeiros.', variant: 'destructive' });
        }
    }, [user?.id, monthKey, toast, beginMonth, confirmMonth, failMonth]), monthResource.scopeKey, ['clinical']);

    const loadAuxiliaryData = useCoordinatedLoader(useCallback(async () => {
        if (!user?.id) return;
        const request = ++auxiliaryRequest.current;
        const tickets = Object.fromEntries(Object.entries(auxiliaryReads).map(([key, resource]) => [key, resource.begin()]));
        await observeResources({
            projection: () => getProjectedCashFlow(user.id, new Date()),
            patients: () => getPatientsForAutocomplete(user.id),
            services: () => getServices(user.id),
            pending: () => getPendingPayments(user.id),
        }, (key, response) => {
            if (request !== auxiliaryRequest.current) return;
            if (response.error) auxiliaryReads[key].fail(tickets[key], response.error);
            else auxiliaryReads[key].succeed(tickets[key], response.data);
        });
    }, [user?.id, auxiliaryReads]), patientsResource.scopeKey, ['clinical']);

    useEffect(() => {
        loadData();
        return () => { loadRequest.current += 1; };
    }, [loadData]);

    useEffect(() => { loadAuxiliaryData(); return () => { auxiliaryRequest.current += 1; }; }, [loadAuxiliaryData]);

    const refreshAfterMutation = async () => {
        await Promise.all([loadData(), loadAuxiliaryData()]);
        setRankingRevision(revision => revision + 1);
    };

    // Handlers
    const handleNewTransaction = () => {
        setEditingTransaction(null);
        setIsDialogOpen(true);
    };

    const handleEditTransaction = (transaction) => {
        setEditingTransaction(transaction);
        setIsDialogOpen(true);
    };

    const handleSaveTransaction = async (data) => {
        if (!monthResource.canAct) { toast({ title: 'Atualize os lançamentos antes de salvar', variant: 'destructive' }); return false; }
        if ((data.patient_id && !patientsResource.canAct) || (data.service_id && !servicesResource.canAct)) return false;
        if (transactionSaveLock.current) return false;
        transactionSaveLock.current = true;
        try {
            if (!user?.id) return false;

            // Handle multiple transactions (installments)
            if (data.multiple && data.transactions) {
                const transactionsWithNutritionist = data.transactions.map(t => ({
                    ...t,
                    nutritionist_id: user.id
                }));

                await saveMultipleTransactions(transactionsWithNutritionist);

                toast({
                    title: "Sucesso!",
                    description: `${data.transactions.length} parcelas criadas com sucesso.`
                });
            } else {
                // Single transaction
                await saveTransaction({
                    ...data,
                    nutritionist_id: user.id
                });

                toast({
                    title: "Sucesso!",
                    description: `Transação ${data.id ? 'atualizada' : 'criada'} com sucesso.`
                });
            }

            setIsDialogOpen(false);
            setEditingTransaction(null);
            await refreshAfterMutation();
            return true;
        } catch (error) {
            logDiagnostic('error', 'pages/nutritionist/tools/FinancialPage.jsx:192', 'Error saving transaction:', error);
            toast({
                title: "Erro",
                description: toPortugueseError(error, 'Não foi possível salvar a transação.'),
                variant: "destructive"
            });
            return false;
        } finally { transactionSaveLock.current = false; }
    };

    const runTransactionAction = async (operation, close, title) => {
        if (!monthResource.canAct) { setMutationError(true); return; }
        if (mutationLock.current) return;
        mutationLock.current = true; setMutationBusy(true); setMutationError(false);
        try {
            await operation();
        } catch (error) {
            logDiagnostic('warn', 'financial/transaction-action', 'Financial action not confirmed', { code: error?.code || 'unknown' });
            setMutationError(true);
            return;
        } finally { mutationLock.current = false; setMutationBusy(false); }
        close(null);
        toast({ title });
        await refreshAfterMutation();
    };
    const handleDeleteTransaction = id => runTransactionAction(() => deleteTransaction(id), setDeleteConfirm, 'Transação excluída');
    const handleConfirmPayment = id => runTransactionAction(() => updateTransactionStatus(id, 'paid'), setPaymentConfirm, 'Recebimento confirmado');
    const handleRefund = id => runTransactionAction(() => refundTransaction(id), setRefundConfirm, 'Estorno registrado');

    const handleExportCSV = () => {
        if (!monthResource.canAct) return;
        const csvData = monthRows.map(t => ({
            Competência: format(new Date(t.transaction_date + 'T00:00:00'), 'dd/MM/yyyy'),
            Tipo: t.type === 'income' ? 'Receita' : 'Despesa',
            Descrição: t.description,
            Categoria: t.category || '-',
            Paciente: t.patient?.name || '-',
            Valor: formatFinancialDecimal(t.amount),
            ValorLíquido: formatFinancialDecimal(t.net_amount ?? t.amount),
            Status: t.status === 'paid' ? 'Pago' : t.status === 'refunded' ? 'Estornado' : t.status === 'pending' ? 'Pendente' : 'Vencido',
            Pagamento: t.paid_at ? format(new Date(t.paid_at + 'T00:00:00'), 'dd/MM/yyyy') : '-',
            Estorno: t.refunded_at ? format(new Date(t.refunded_at + 'T00:00:00'), 'dd/MM/yyyy') : '-'
        }));

        const csv = Papa.unparse(csvData, { delimiter: ';' });
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `financeiro_nello_${format(selectedMonth, 'yyyy-MM')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
            title: "Exportado!",
            description: "Arquivo CSV baixado com sucesso."
        });
    };

    const handleExportReport = () => {
        if (!monthResource.canAct) return;
        try {
            exportFinancialReport(monthRows, 'csv');
            toast({
                title: "Exportado!",
                description: "Relatório completo exportado para contador."
            });
        } catch (error) {
            logDiagnostic('error', 'pages/nutritionist/tools/FinancialPage.jsx:281', 'Error exporting report:', error);
            toast({
                title: "Erro",
                description: toPortugueseError(error, "Não foi possível exportar o relatório."),
                variant: "destructive"
            });
        }
    };

    const handleGenerateReceipt = async (transaction) => {
        if (!monthResource.canAct) return;
        if (!user?.id) return;

        try {
            // Fetch nutritionist profile
            const { data: nutritionistProfile, error: nutritionistError } = await supabase
                .from('user_profiles')
                .select('name, crn, address, phone, email')
                .eq('id', user.id)
                .single();

            if (nutritionistError) {
                throw new Error('Não foi possível carregar os dados do nutricionista.');
            }

            // Fetch patient profile if patient_id exists
            let patientProfile = null;
            if (transaction.patient_id) {
                const { data: patient, error: patientError } = await supabase
                    .from('user_profiles')
                    .select('name, cpf')
                    .eq('id', transaction.patient_id)
                    .single();

                if (!patientError && patient) {
                    patientProfile = patient;
                }
            }

            // Generate receipt
            const { generateReceipt } = await import('@/lib/pdf/receiptGenerator');
            await generateReceipt(transaction, nutritionistProfile, patientProfile);

            toast({
                title: "Sucesso!",
                description: "Recibo gerado e baixado com sucesso."
            });
        } catch (error) {
            logDiagnostic('error', 'pages/nutritionist/tools/FinancialPage.jsx:328', 'Error generating receipt:', error);
            toast({
                title: "Erro",
                description: toPortugueseError(error, "Não foi possível gerar o recibo."),
                variant: "destructive"
            });
        }
    };

    const handleExportPDF = async () => {
        if (!monthResource.canAct) return;
        try {
            const { exportFinancialsToPdf } = await import('@/lib/pdfUtils');
            await exportFinancialsToPdf(monthRows, summary, format(selectedMonth, 'MMMM yyyy'));
            toast({
                title: "Exportado!",
                description: "Arquivo PDF gerado com sucesso."
            });
        } catch (error) {
            logDiagnostic('error', 'pages/nutritionist/tools/FinancialPage.jsx:346', 'Error exporting PDF:', error);
            toast({
                title: "Erro",
                description: "Não foi possível gerar o PDF.",
                variant: "destructive"
            });
        }
    };

    return (
        <div className="financial-workspace min-h-dvh min-w-0 bg-[#f7f8f5] dark:bg-background">
            {agendaReturn && <div className="mx-auto max-w-7xl px-4 pt-4">
                <Button variant="outline" className="min-h-11" onClick={() => navigate('/nutritionist/agenda', { state: { agendaReturn } })}>Voltar à agenda</Button>
                {agendaLinkState === 'loading' && <p role="status" className="mt-2 text-sm">Conferindo o lançamento do agendamento…</p>}
                {agendaLinkState === 'error' && <p role="alert" className="mt-2 text-sm text-destructive">O lançamento não está disponível nesta conta ou foi alterado. Volte à agenda para conferir o estado atual.</p>}
            </div>}
            <section aria-label="Gestão financeira" className="mx-auto w-full max-w-7xl min-w-0 space-y-5 px-4 py-5 md:px-8 md:py-7">
                <FinancialToolbar month={selectedMonth} onMonthChange={value => value && setSelectedMonth(new Date(value + '-02'))} onNew={handleNewTransaction} onSettings={openFinancialSettings} onServices={() => setIsServicesManagerOpen(true)} exportDisabled={!monthResource.canAct} onExportPDF={handleExportPDF} onExportCSV={handleExportCSV} onExportReport={handleExportReport} />
                <Tabs value={workspaceView} onValueChange={setWorkspaceView} className="space-y-5">
                    <TabsList className="financial-view-tabs grid h-auto w-full grid-cols-3 sm:w-auto sm:inline-flex"><TabsTrigger value="overview">Visão geral</TabsTrigger><TabsTrigger value="history">Movimentações</TabsTrigger><TabsTrigger value="analysis">Análises</TabsTrigger></TabsList>
                    {[monthResource,projectionResource,pendingResource,patientsResource,servicesResource,goalResource].some(resource=>resource.error||resource.refreshing)&&<div className="grid gap-x-4 sm:grid-cols-3">
                    <ResourceStatus resource={monthResource} label="lançamentos" onRetry={loadData} />
                    <ResourceStatus resource={projectionResource} label="projeção" onRetry={loadAuxiliaryData} />
                    <ResourceStatus resource={pendingResource} label="cobranças" onRetry={loadAuxiliaryData} />
                    <ResourceStatus resource={patientsResource} label="pacientes" onRetry={loadAuxiliaryData} />
                    <ResourceStatus resource={servicesResource} label="serviços" onRetry={loadAuxiliaryData} />
                    <ResourceStatus resource={goalResource} label="meta" onRetry={() => setGoalRevision(value => value + 1)} />
                    </div>}
                    {!unavailable && <FinancialKPIs summary={summary} loading={loading} onInspect={(kind, target) => { metricTrigger.current = target; setMetricView(kind); }} />}
                    <TabsContent value="overview" className="space-y-5">
                        <div className="financial-overview-grid"><div className="financial-panel financial-panel--flow"><FinancialCharts view="cash" cashFlowData={cashFlowData} expenseDistribution={expenseDistribution} projectedCashFlow={projectedCashFlow} loading={loading} loadError={unavailable} projectionState={auxiliaryState.projection} onRetry={loadData} onProjectionRetry={loadAuxiliaryData} /></div><div className="financial-panel financial-panel--pending"><PendingPaymentsWidget payments={pendingPayments} readOnly={!pendingResource.canAct} state={auxiliaryState.pending} onRetry={loadAuxiliaryData} onUpdate={refreshAfterMutation} onInspect={setInspectedTransaction} /></div></div>
                        <FinancialGoal goal={monthlyGoal} state={goalState} income={summary.income} loading={loading} incomeUnavailable={unavailable} onSettings={openFinancialSettings} onRetry={() => setGoalRevision(v => v + 1)} />
                        <div className="financial-history-heading flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Últimas movimentações</h2><Button variant="ghost" aria-label="Abrir histórico completo" onClick={() => setWorkspaceView('history')}><span className="financial-desktop-label">Abrir histórico completo</span><span className="financial-mobile-label" aria-hidden="true">Ver histórico</span></Button></div>
                        <TransactionList key={workspaceView} pageSize={workspaceView === 'overview' ? 6 : 20} transactions={transactions} totalCount={monthRows.length} loading={loading} loadError={unavailable} onRetry={loadData} onNew={handleNewTransaction} onEdit={handleEditTransaction} onDelete={id => setDeleteConfirm(id)} onGenerateReceipt={handleGenerateReceipt} onConfirmPayment={setPaymentConfirm} onRefund={setRefundConfirm} filters={filters} onFiltersChange={setFilters} />
                    </TabsContent>
                    <TabsContent value="history" className="space-y-5"><TransactionList key={workspaceView} pageSize={workspaceView === 'overview' ? 6 : 20} transactions={transactions} totalCount={monthRows.length} loading={loading} loadError={unavailable} onRetry={loadData} onNew={handleNewTransaction} onEdit={handleEditTransaction} onDelete={id => setDeleteConfirm(id)} onGenerateReceipt={handleGenerateReceipt} onConfirmPayment={setPaymentConfirm} onRefund={setRefundConfirm} filters={filters} onFiltersChange={setFilters} /></TabsContent>
                    <TabsContent value="analysis">
                        <Tabs defaultValue="cash" className="space-y-4"><TabsList className="grid h-auto w-full grid-cols-3 sm:inline-flex sm:w-auto"><TabsTrigger value="cash">Caixa e projeção</TabsTrigger><TabsTrigger value="patients">Por paciente</TabsTrigger><TabsTrigger value="services">Serviços</TabsTrigger></TabsList>
                            <TabsContent value="cash"><FinancialCharts view="analysis" cashFlowData={cashFlowData} expenseDistribution={expenseDistribution} projectedCashFlow={projectedCashFlow} loading={loading} loadError={unavailable} projectionState={auxiliaryState.projection} onRetry={loadData} onProjectionRetry={loadAuxiliaryData} /></TabsContent>
                            <TabsContent value="patients"><TopPatientsWidget nutritionistId={user?.id} refreshKey={rankingRevision} /></TabsContent>
                            <TabsContent value="services"><section aria-label="Catálogo de serviços" className="rounded-2xl bg-card p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Serviços do consultório</h2><p className="mt-1 text-sm text-muted-foreground">Preços cadastrados. Alterar um serviço não recalcula lançamentos anteriores.</p></div><Button variant="outline" onClick={() => setIsServicesManagerOpen(true)}>Gerenciar Serviços</Button></div>{auxiliaryState.services === 'error' ? <div role="alert" className="mt-4 text-sm">Catálogo indisponível. <Button variant="outline" onClick={loadAuxiliaryData}>Tentar carregar serviços</Button></div> : auxiliaryState.services === 'loading' ? <p role="status" className="mt-4 text-sm">Carregando serviços…</p> : !services.length ? <p className="mt-4 text-sm text-muted-foreground">Nenhum serviço cadastrado.</p> : <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{services.map(service => <li key={service.id} className="rounded-xl bg-muted/50 p-4"><p className="break-words text-sm font-medium">{service.name}</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatCurrency(service.price)}</p>{service.description && <p className="mt-2 break-words text-sm text-muted-foreground">{service.description}</p>}</li>)}</ul>}</section></TabsContent>
                        </Tabs>
                    </TabsContent>
                </Tabs>
            </section>

            <FinancialSummaryDialog kind={metricView} summary={summary} rows={monthRows} start={monthStartKey} end={monthEndKey} onClose={() => setMetricView(null)} onReturnFocus={() => metricTrigger.current?.focus()} onTransaction={row => { setMetricView(null); setInspectedTransaction(row); }} />
            <TransactionDetails transaction={inspectedTransaction} onClose={() => setInspectedTransaction(null)} />
            {/* Transaction Dialog */}
            <TransactionDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                transaction={editingTransaction}
                patients={patients}
                services={services}
                nutritionistId={user?.id}
                onSave={handleSaveTransaction}
                auxiliaryState={auxiliaryState} onAuxiliaryRetry={loadAuxiliaryData}
            />

            {/* Services Manager */}
            <ServicesManager
                open={isServicesManagerOpen}
                onOpenChange={(open) => {
                    setIsServicesManagerOpen(open);
                    // Reload services when manager closes
                    if (!open && user?.id) {
                        loadAuxiliaryData();
                    }
                }}
                nutritionistId={user?.id}
            />

            {/* Delete Confirmation */}
            <AlertDialog open={!!paymentConfirm} onOpenChange={(open) => { if (!open && !mutationLock.current) { setPaymentConfirm(null); setMutationError(false); } }}>
                <AlertDialogContent className="financial-dialog">
                    <AlertDialogHeader><AlertDialogTitle>Confirmar recebimento</AlertDialogTitle><AlertDialogDescription>O valor entrará no caixa de hoje. Confirme apenas após receber o pagamento.</AlertDialogDescription></AlertDialogHeader>
                    <p role="alert" className={mutationError ? 'text-sm text-destructive' : 'hidden'}>{mutationError ? 'Não foi possível confirmar a alteração. Confira o estado da transação antes de tentar novamente.' : ''}</p><AlertDialogFooter><AlertDialogCancel disabled={mutationBusy}>Voltar</AlertDialogCancel><AlertDialogAction disabled={mutationBusy} onClick={event => { event.preventDefault(); return  handleConfirmPayment(paymentConfirm); }}>{mutationBusy ? 'Confirmando…' : 'Confirmar'}</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={!!refundConfirm} onOpenChange={(open) => { if (!open && !mutationLock.current) { setRefundConfirm(null); setMutationError(false); } }}>
                <AlertDialogContent className="financial-dialog">
                    <AlertDialogHeader><AlertDialogTitle>Registrar estorno integral</AlertDialogTitle><AlertDialogDescription>O estorno será deduzido do caixa de hoje e manterá o histórico do pagamento original.</AlertDialogDescription></AlertDialogHeader>
                    <p role="alert" className={mutationError ? 'text-sm text-destructive' : 'hidden'}>{mutationError ? 'Não foi possível confirmar a alteração. Confira o estado da transação antes de tentar novamente.' : ''}</p><AlertDialogFooter><AlertDialogCancel disabled={mutationBusy}>Voltar</AlertDialogCancel><AlertDialogAction disabled={mutationBusy} onClick={event => { event.preventDefault(); return  handleRefund(refundConfirm); }}>{mutationBusy ? 'Registrando…' : 'Registrar estorno'}</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open && !mutationLock.current) { setDeleteConfirm(null); setMutationError(false); } }}>
                <AlertDialogContent className="financial-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <p role="alert" className={mutationError ? 'text-sm text-destructive' : 'hidden'}>{mutationError ? 'Não foi possível confirmar a alteração. Confira o estado da transação antes de tentar novamente.' : ''}</p><AlertDialogFooter>
                        <AlertDialogCancel disabled={mutationBusy}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={mutationBusy}
                            onClick={event => { event.preventDefault(); void handleDeleteTransaction(deleteConfirm); }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
