import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FinancialGoal from './FinancialGoal';

describe('financial goal evidence', () => {
    it('does not present a fallback amount while settings or receipts are loading', () => {
        const { rerender } = render(<FinancialGoal state="loading" income={0} />);
        expect(screen.getByRole('status')).toHaveTextContent('Carregando');
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        rerender(<FinancialGoal state="ready" goal={2500} income={0} loading />);
        expect(screen.queryByText(/2.500/)).not.toBeInTheDocument();
    });
    it.each([null, 0])('keeps an absent or zero goal without dividing by it (%s)', goal => {
        render(<FinancialGoal state="ready" goal={goal} income={600} />);
        expect(screen.getByText(/Sem meta definida/)).toBeVisible();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
    it('distinguishes unavailable settings from unavailable receipts and allows recovery', () => {
        const retry = vi.fn();
        const { rerender } = render(<FinancialGoal state="error" onRetry={retry} />);
        fireEvent.click(screen.getByRole('button', { name: 'Tentar carregar meta' }));
        expect(retry).toHaveBeenCalledOnce();
        rerender(<FinancialGoal state="ready" goal={2500} income={0} incomeUnavailable />);
        expect(screen.getByText(/Progresso indisponível/)).toBeVisible();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
    it('shows the actual surplus while keeping the visual progress bounded', () => {
        const settings = vi.fn();
        render(<FinancialGoal state="ready" goal={2500} income={3000} onSettings={settings} />);
        expect(screen.getByText(/Superou em/)).toHaveTextContent('500,00');
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
        fireEvent.click(screen.getByRole('button', { name: 'Editar meta' }));
        expect(settings).toHaveBeenCalledOnce();
    });
});
