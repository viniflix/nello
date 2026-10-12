import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import PendingPaymentsWidget from './PendingPaymentsWidget';
import TransactionDialog from './TransactionDialog';
import TransactionList from './TransactionList';
import { formatFinancialAxis } from '@/lib/utils/financial-presentation';
import { isFinancialTransactionOverdue } from '@/lib/utils/financial-math';
const mutations = vi.hoisted(() => ({ updateTransactionStatus: vi.fn(), rescheduleTransaction: vi.fn(), deleteTransaction: vi.fn() }));
vi.mock('@/lib/supabase/financial-queries', () => mutations);
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/storage/verifiedUpload', () => ({ uploadVerifiedFile: vi.fn() }));
beforeEach(() => { cleanup(); vi.clearAllMocks(); vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });

describe('financial workspace confidence and recovery', () => {
    it('distinguishes failed global pending from a genuine empty result', () => {
        const retry = vi.fn();
        const { rerender } = render(<PendingPaymentsWidget state="error" onRetry={retry} />);
        expect(screen.getByRole('alert')).toHaveTextContent('não significa');
        expect(screen.queryByText(/Nenhuma cobrança/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Tentar carregar cobranças' }));
        expect(retry).toHaveBeenCalledOnce();
        rerender(<PendingPaymentsWidget state="ready" payments={[]} />);
        expect(screen.getByText(/Nenhuma cobrança em aberto/)).toBeVisible();
    });
    it('waits for the mutation, prevents concurrent confirmation and refreshes all consumers', async () => {
        let finish; mutations.updateTransactionStatus.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const update = vi.fn();
        render(<PendingPaymentsWidget state="ready" payments={[{ id: 1, amount: 17, description: 'Synthetic', status: 'overdue', due_date: '2020-01-01' }]} onUpdate={update} />);
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar recebimento' }));
        const confirm = screen.getByRole('alertdialog').querySelector('button:last-child');
        fireEvent.click(confirm); fireEvent.click(confirm);
        expect(mutations.updateTransactionStatus).toHaveBeenCalledOnce();
        expect(update).not.toHaveBeenCalled();
        finish(); await waitFor(() => expect(update).toHaveBeenCalledOnce());
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    it('does not treat a failed mutation as paid or close its recovery dialog', async () => {
        mutations.updateTransactionStatus.mockRejectedValue(new Error('timeout'));
        const update = vi.fn();
        render(<PendingPaymentsWidget state="ready" payments={[{ id: 1, amount: 17, description: 'Synthetic', status: 'overdue', transaction_date: '2026-10-01' }]} onUpdate={update} />);
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar recebimento' }));
        fireEvent.click(screen.getByRole('alertdialog').querySelector('button:last-child'));
        await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
        expect(screen.getByRole('alertdialog')).toBeVisible();
        expect(update).not.toHaveBeenCalled();
    });
    it('does not invent overdue status from a missing due date', () => {
        expect(isFinancialTransactionOverdue({ status: 'pending', transaction_date: '2020-01-01' }, '2026-10-11')).toBe(false);
        expect(isFinancialTransactionOverdue({ status: 'overdue', due_date: '2030-01-01' }, '2026-10-11')).toBe(true);
        expect(isFinancialTransactionOverdue({ status: 'paid', due_date: '2020-01-01' }, '2026-10-11')).toBe(false);
    });
    it('preserves cents, negative values and localizes compact chart labels', () => {
        expect(formatFinancialAxis(0.25)).toMatch(/0,25/);
        expect(formatFinancialAxis(-25.5)).toMatch(/-.*25,50/);
        expect(formatFinancialAxis(1000000)).toMatch(/mi/);
    });
    it('keeps entered values after a failed save and locks duplicate submissions', async () => {
        let finish; const save = vi.fn(() => new Promise(resolve => { finish = resolve; }));
        render(<TransactionDialog open transaction={{ id: 1, type: 'income', category: 'consulta', description: 'Synthetic', amount: 17, status: 'paid', transaction_date: '2026-10-01' }} onOpenChange={vi.fn()} patients={[]} services={[]} nutritionistId="synthetic-owner" onSave={save} />);
        fireEvent.change(screen.getByLabelText(/Descrição/), { target: { value: 'Synthetic save' } });
        fireEvent.change(screen.getByLabelText(/Valor.*R\$/), { target: { value: '17' } });
        const button = screen.getByRole('button', { name: 'Atualizar', exact: true });
        fireEvent.click(button); fireEvent.click(button);
        expect(save).toHaveBeenCalledOnce();
        finish(false); await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
        expect(screen.getByLabelText(/Descrição/)).toHaveValue('Synthetic save');
        expect(screen.getByLabelText(/Valor.*R\$/)).toHaveValue(17);
    });
    it('paginates rendering without changing filtered totals and exposes the full description', () => {
        const rows = Array.from({ length: 21 }, (_, i) => ({ id: i + 1, description: `Synthetic ${i + 1}`, amount: 1, status: 'paid', type: 'income', transaction_date: '2026-10-01' }));
        render(<TransactionList transactions={rows} totalCount={100} filters={{}} onFiltersChange={vi.fn()} onEdit={vi.fn()} />);
        expect(screen.getByRole('status')).toHaveTextContent('21 de 100');
        expect(screen.queryByRole('button', { name: 'Synthetic 21', exact: true })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
        fireEvent.click(screen.getByRole('button', { name: 'Synthetic 21', exact: true }));
        expect(screen.getByRole('dialog')).toHaveTextContent('Synthetic 21');
        expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
    });
});
