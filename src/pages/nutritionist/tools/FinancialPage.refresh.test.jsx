import {invalidateDomain} from '@/infrastructure/realtime/events';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FinancialPage from './FinancialPage';
const mocks = vi.hoisted(() => ({ rows: vi.fn(), event: null, toast: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'synthetic-finance' } }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: {} }));
vi.mock('@/infrastructure/analytics/posthog', () => ({ track: vi.fn(), Events: {} }));
vi.mock('@/lib/supabase/profile-queries', () => ({ getClinicSettings: async () => ({ monthlyFinancialGoal: 100 }) }));
vi.mock('@/lib/supabase/financial-queries', () => ({ getFinancialMonthRows: mocks.rows, getPendingPayments: async () => [], getProjectedCashFlow: async () => [], getPatientsForAutocomplete: async () => [], getServices: async () => [], saveTransaction: vi.fn(), saveMultipleTransactions: vi.fn(), deleteTransaction: vi.fn(), updateTransactionStatus: vi.fn(), refundTransaction: vi.fn(), getFinancialTransactionById: vi.fn() }));
vi.mock('@/components/financial/FinancialToolbar', () => ({ default: ({ onMonthChange, exportDisabled }) => <><button onClick={() => onMonthChange('2027-02')}>Next month</button><button disabled={exportDisabled}>Export probe</button></> }));
vi.mock('@/components/financial/FinancialKPIs', () => ({ default: ({ summary, loading }) => <p>{loading ? 'Initial KPI' : `Income ${summary.income}`}</p> }));
vi.mock('@/components/financial/TransactionList', () => ({ default: ({ transactions, loading, loadError }) => <div>{loading ? 'Initial list' : loadError ? 'Failed list' : transactions.map(row => <p key={row.id}>{row.description}</p>)}</div> }));
vi.mock('@/components/financial/FinancialCharts', () => ({ default: () => null }));
vi.mock('@/components/financial/PendingPaymentsWidget', () => ({ default: () => null }));
vi.mock('@/components/financial/TopPatientsWidget', () => ({ default: () => null }));
vi.mock('@/components/financial/FinancialGoal', () => ({ default: () => null }));
vi.mock('@/components/financial/TransactionDetails', () => ({ default: () => null }));
vi.mock('@/components/financial/FinancialSummaryDialog', () => ({ default: () => null }));
vi.mock('@/components/financial/TransactionDialog', () => ({ default: () => null }));
vi.mock('@/components/financial/ServicesManager', () => ({ default: () => null }));
const row = { id: 1, description: 'Synthetic transaction', amount: 17, type: 'income', status: 'paid', transaction_date: '2026-10-13' };
describe('Finance same-month confirmed snapshots', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rows.mockResolvedValue([row]); });
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
