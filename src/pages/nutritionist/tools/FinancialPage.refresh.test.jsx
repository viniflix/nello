import {invalidateDomain} from '@/infrastructure/realtime/events';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FinancialPage from './FinancialPage';
const mocks = vi.hoisted(() => ({ rows: vi.fn(), lookup: vi.fn(), services: vi.fn(), userId: 'synthetic-finance', event: null, toast: vi.fn(), rpc: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/infrastructure/analytics/posthog', () => ({ track: vi.fn(), Events: {} }));
vi.mock('@/lib/supabase/profile-queries', () => ({ getClinicSettings: async () => ({ monthlyFinancialGoal: 100 }) }));
vi.mock('@/lib/supabase/financial-queries', () => ({ getFinancialMonthRows: mocks.rows, getPendingPayments: async () => [], getProjectedCashFlow: async () => [], getPatientsForAutocomplete: async () => [], getServices: mocks.services, saveService: vi.fn(), deleteService: vi.fn(), saveTransaction: vi.fn(), saveMultipleTransactions: vi.fn(), deleteTransaction: vi.fn(), updateTransactionStatus: vi.fn(), refundTransaction: vi.fn(), getFinancialTransactionById: mocks.lookup }));
vi.mock('@/components/financial/FinancialToolbar', () => ({ default: ({ onMonthChange, exportDisabled, onServices }) => <><button onClick={onServices}>Services probe</button><button onClick={() => onMonthChange('2027-02')}>Next month</button><button disabled={exportDisabled}>Export probe</button></> }));
vi.mock('@/components/financial/FinancialKPIs', () => ({ default: ({ summary, loading }) => <p>{loading ? 'Initial KPI' : `Income ${summary.income}`}</p> }));
vi.mock('@/components/financial/TransactionList', () => ({ default: ({ transactions, loading, loadError }) => <div>{loading ? 'Initial list' : loadError ? 'Failed list' : transactions.map(row => <p key={row.id}>{row.description}</p>)}</div> }));
vi.mock('@/components/financial/FinancialCharts', () => ({ default: () => null }));
vi.mock('@/components/financial/PendingPaymentsWidget', () => ({ default: () => null }));
vi.mock('@/components/financial/FinancialGoal', () => ({ default: () => null }));
vi.mock('@/components/financial/FinancialSummaryDialog', () => ({ default: () => null }));
vi.mock('@/components/financial/TransactionDialog', () => ({ default: () => null }));
const row = { id: 1, description: 'Synthetic transaction', amount: 17, type: 'income', status: 'paid', transaction_date: '2026-10-13' };
describe('Finance same-month confirmed snapshots', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.userId = 'synthetic-finance'; mocks.services.mockResolvedValue([]); mocks.rows.mockResolvedValue([row]); mocks.lookup.mockResolvedValue(row); });
  it('keeps transactions and KPIs during a background refresh and disables export', async () => {
    render(<MemoryRouter><FinancialPage /></MemoryRouter>); await screen.findByText('Synthetic transaction');
    mocks.rows.mockReturnValue(new Promise(() => {})); await act(async () => { invalidateDomain('synthetic-finance', 'clinical'); await new Promise(resolve => setTimeout(resolve, 130)); });
    expect(screen.getByText('Synthetic transaction')).toBeInTheDocument();
    expect(screen.queryByText('Initial KPI')).not.toBeInTheDocument();
    expect(screen.queryByText(/Atualizando/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export probe' })).toBeDisabled();
  });
  it('keeps the confirmed list after a transient error, but removes it after 403', async () => {
    render(<MemoryRouter><FinancialPage /></MemoryRouter>); await screen.findByText('Synthetic transaction');
    mocks.rows.mockRejectedValue({ code: 'NETWORK_FAILURE' }); await act(async () => { invalidateDomain('synthetic-finance', 'clinical'); await new Promise(resolve => setTimeout(resolve, 130)); });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('Synthetic transaction')).toBeInTheDocument();
    mocks.rows.mockRejectedValue({ status: 403 }); await act(async () => { invalidateDomain('synthetic-finance', 'clinical'); await new Promise(resolve => setTimeout(resolve, 130)); });
    await waitFor(() => expect(screen.queryByText('Synthetic transaction')).not.toBeInTheDocument());
  });
  it('does not label a previous snapshot with a new month', async () => {
    render(<MemoryRouter><FinancialPage /></MemoryRouter>); await screen.findByText('Synthetic transaction');
    mocks.rows.mockReturnValue(new Promise(() => {})); fireEvent.click(screen.getByText('Next month'));
    expect(screen.queryByText('Synthetic transaction')).not.toBeInTheDocument();
    expect(screen.getByText('Initial KPI')).toBeInTheDocument();
  });
});

const agendaEntry = { pathname: '/nutritionist/financial', state: { agendaReturn: { userId: 'synthetic-finance', date: '2026-10-13', view: 'today' }, agendaTransactionId: 1 } };
const refreshFinance = async () => { await act(async () => { invalidateDomain('synthetic-finance', 'clinical'); await new Promise(resolve => setTimeout(resolve, 130)); }); };

describe('Finance private detail authorization', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.userId = 'synthetic-finance'; mocks.services.mockResolvedValue([]); mocks.rows.mockResolvedValue([row]); mocks.lookup.mockResolvedValue(row); });
  it('closes the real agenda transaction detail and removes the workspace after a month read is forbidden', async () => {
    render(<MemoryRouter initialEntries={[agendaEntry]}><FinancialPage /></MemoryRouter>);
    await screen.findByRole('dialog', { name: 'Detalhes da transação' });
    mocks.rows.mockRejectedValue({ status: 403 }); await refreshFinance();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Gestão financeira' })).not.toBeInTheDocument();
  });
  it.each([401, 403])('blocks the financial workspace when the agenda detail read returns %i', async status => {
    mocks.lookup.mockRejectedValue({ status });
    render(<MemoryRouter initialEntries={[agendaEntry]}><FinancialPage /></MemoryRouter>);
    await screen.findByRole('alert');
    expect(screen.queryByRole('region', { name: 'Gestão financeira' })).not.toBeInTheDocument();
  });
  it('does not reopen a late agenda detail after financial access is denied', async () => {
    let resolveDetail; mocks.lookup.mockReturnValue(new Promise(resolve => { resolveDetail = resolve; }));
    render(<MemoryRouter initialEntries={[agendaEntry]}><FinancialPage /></MemoryRouter>);
    await screen.findByText('Synthetic transaction');
    mocks.rows.mockRejectedValue({ status: 403 }); await refreshFinance();
    await screen.findByRole('alert');
    await act(async () => { resolveDetail(row); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('keeps authorized detail and the confirmed list through a transient month failure', async () => {
    render(<MemoryRouter initialEntries={[agendaEntry]}><FinancialPage /></MemoryRouter>);
    await screen.findByRole('dialog', { name: 'Detalhes da transação' });
    mocks.rows.mockRejectedValue({ code: 'NETWORK_FAILURE' }); await refreshFinance();
    await screen.findByRole('alert', { hidden: true });
    expect(screen.getByRole('dialog', { name: 'Detalhes da transação' })).toBeInTheDocument();
    expect(screen.getAllByText('Synthetic transaction').length).toBeGreaterThan(0);
  });
});

it('removes the entire authorized financial snapshot when an auxiliary service read is forbidden', async () => {
  mocks.userId = 'synthetic-finance'; mocks.rows.mockResolvedValue([row]); mocks.lookup.mockResolvedValue(row); mocks.services.mockResolvedValue([]);
  render(<MemoryRouter initialEntries={[agendaEntry]}><FinancialPage /></MemoryRouter>);
  await screen.findByRole('dialog', { name: 'Detalhes da transação' });
  mocks.services.mockRejectedValue({ status: 403 }); await refreshFinance();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.queryByRole('region', { name: 'Gestão financeira' })).not.toBeInTheDocument();
  expect(screen.queryByText('Synthetic transaction')).not.toBeInTheDocument();
});
it('does not publish the prior owner agenda detail after the authenticated owner changes', async () => {
  mocks.userId = 'synthetic-finance'; mocks.rows.mockResolvedValue([row]); mocks.services.mockResolvedValue([]);
  let resolveDetail; mocks.lookup.mockReturnValue(new Promise(resolve => { resolveDetail = resolve; }));
  const view = render(<MemoryRouter initialEntries={[agendaEntry]}><FinancialPage /></MemoryRouter>);
  await screen.findByText('Synthetic transaction');
  mocks.userId = 'second-finance'; mocks.rows.mockResolvedValue([{ ...row, description: 'Second owner transaction' }]);
  view.rerender(<MemoryRouter initialEntries={[agendaEntry]}><FinancialPage /></MemoryRouter>);
  await screen.findByText('Second owner transaction');
  await act(async () => { resolveDetail(row); });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Synthetic transaction')).not.toBeInTheDocument();
});
it('cancels a pending agenda detail when returning to the agenda', async () => {
  mocks.userId = 'synthetic-finance'; mocks.rows.mockResolvedValue([row]); mocks.services.mockResolvedValue([]);
  let resolveDetail; mocks.lookup.mockReturnValue(new Promise(resolve => { resolveDetail = resolve; }));
  render(<MemoryRouter initialEntries={[agendaEntry]}><FinancialPage /></MemoryRouter>);
  await screen.findByText('Synthetic transaction');
  fireEvent.click(screen.getByRole('button', { name: 'Voltar à agenda' }));
  await act(async () => { resolveDetail(row); });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});


describe('Finance descendant authorization and access revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.userId = 'synthetic-finance'; mocks.rows.mockResolvedValue([row]);
    mocks.lookup.mockResolvedValue(row); mocks.services.mockResolvedValue([]); mocks.rpc.mockResolvedValue({ data: [], error: null });
  });
  it.each([401, 403])('removes the workspace when the real services manager read returns %i', async status => {
    render(<MemoryRouter><FinancialPage /></MemoryRouter>);
    await screen.findByText('Synthetic transaction');
    mocks.services.mockRejectedValue({ status });
    fireEvent.click(screen.getByRole('button', { name: 'Services probe' }));
    await waitFor(() => expect(document.querySelector('section[aria-label="Gestão financeira"]')).toBeNull());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Synthetic transaction')).not.toBeInTheDocument();
  });
  it.each([401, 403])('removes the workspace when the real patient ranking returns %i', async status => {
    mocks.rpc.mockResolvedValue({ data: null, error: { status } });
    render(<MemoryRouter><FinancialPage /></MemoryRouter>);
    await screen.findByText('Synthetic transaction');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Análises' }), { button: 0, ctrlKey: false });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Por paciente' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(document.querySelector('section[aria-label="Gestão financeira"]')).toBeNull());
    expect(screen.queryByText('Synthetic transaction')).not.toBeInTheDocument();
  });
  it.each(['pending', 'unavailable'])('clears open private detail immediately on access revocation with %s revalidation', async result => {
    render(<MemoryRouter initialEntries={[agendaEntry]}><FinancialPage /></MemoryRouter>);
    await screen.findByRole('dialog', { name: 'Detalhes da transação' });
    mocks.lookup.mockReturnValue(new Promise(() => {}));
    mocks.rows.mockImplementation(() => result === 'pending' ? new Promise(() => {}) : Promise.reject({ status: 503 }));
    await act(async () => { invalidateDomain('synthetic-finance', 'access'); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Synthetic transaction')).not.toBeInTheDocument();

  });
});
