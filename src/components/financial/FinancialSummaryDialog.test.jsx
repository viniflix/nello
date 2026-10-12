import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import FinancialKPIs from './FinancialKPIs';
import { financialMetricRows } from './FinancialSummaryDialog';
import PendingPaymentsWidget from './PendingPaymentsWidget';

vi.mock('@/lib/supabase/financial-queries', () => ({ updateTransactionStatus: vi.fn(), rescheduleTransaction: vi.fn(), deleteTransaction: vi.fn() }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
afterEach(cleanup);
const rows = [
    { id: 1, type: 'income', status: 'paid', transaction_date: '2026-09-20', paid_at: '2026-10-02' },
    { id: 2, type: 'income', status: 'refunded', transaction_date: '2026-08-20', paid_at: '2026-08-20', refunded_at: '2026-10-03' },
    { id: 3, type: 'income', status: 'pending', transaction_date: '2026-10-12' },
    { id: 4, type: 'income', status: 'overdue', transaction_date: '2026-09-12' },
    { id: 5, type: 'expense', status: 'paid', transaction_date: '2026-10-12', paid_at: '2026-11-01' },
    { id: 6, type: 'expense', status: 'refunded', transaction_date: '2026-09-12', paid_at: '2026-09-12', refunded_at: '2026-10-08' },
];
describe('financial exploration preserves cash and competence scopes', () => {
    it('includes payments and refunds from earlier competencies but excludes unpaid and later payments', () => {
        expect(financialMetricRows(rows, 'income', '2026-10-01', '2026-10-31').map(r => r.id)).toEqual([1, 2]);
        expect(financialMetricRows(rows, 'expense', '2026-10-01', '2026-10-31').map(r => r.id)).toEqual([6]);
        expect(financialMetricRows(rows, 'balance', '2026-10-01', '2026-10-31').map(r => r.id)).toEqual([1, 2, 6]);
        expect(financialMetricRows(rows, 'pending', '2026-10-01', '2026-10-31').map(r => r.id)).toEqual([3]);
    });
    it('makes every metric an accessible whole-card action and prevents exploration while loading', () => {
        const inspect = vi.fn();
        const { rerender } = render(<FinancialKPIs summary={{}} onInspect={inspect} loading={false} />);
        for (const name of [/Entender meu caixa/, /Ver recebimentos/, /Explorar despesas/, /Ver pendências do mês/]) fireEvent.click(screen.getByRole('button', { name }));
        expect(inspect.mock.calls.map(call => call[0])).toEqual(['balance', 'income', 'expense', 'pending']);
        rerender(<FinancialKPIs summary={{}} onInspect={inspect} loading />);
        for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    });
    it('opens the complete receipt name without registering a payment', () => {
        const inspect = vi.fn(), update = vi.fn();
        const receipt = { id: 13, type: 'income', status: 'overdue', description: 'Synthetic consultation', patient: { name: 'Synthetic Patient' }, due_date: '2020-01-01', amount: 20 };
        render(<PendingPaymentsWidget payments={[receipt]} state="ready" onInspect={inspect} onUpdate={update} />);
        fireEvent.click(screen.getByRole('button', { name: /Abrir detalhes de Synthetic Patient: Synthetic consultation/ }));
        expect(inspect).toHaveBeenCalledWith(receipt);
        expect(update).not.toHaveBeenCalled();
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });
});
