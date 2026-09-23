import { describe, expect, it } from 'vitest';
import { buildFinancialCashFlow, buildFinancialExpenseDistribution, summarizeFinancialTransactions } from './financial-math';

const start = '2026-09-01';
const end = '2026-09-30';
const today = '2026-09-23';

describe('financial cash and competence', () => {
  const rows = [
    { id: 1, type: 'income', amount: '100.00', net_amount: '97.00', status: 'paid', transaction_date: '2026-08-30', paid_at: '2026-09-02' },
    { id: 2, type: 'income', amount: '200.00', status: 'pending', transaction_date: '2026-09-04', due_date: '2026-09-28' },
    { id: 3, type: 'income', amount: '50.00', status: 'pending', transaction_date: '2026-09-05', due_date: '2026-09-10' },
    { id: 4, type: 'expense', amount: '30.00', status: 'paid', transaction_date: '2026-09-06', paid_at: '2026-09-06', category: 'aluguel' },
    { id: 5, type: 'income', amount: '40.00', net_amount: '40.00', status: 'refunded', transaction_date: '2026-08-10', paid_at: '2026-08-10', refunded_at: '2026-09-09' },
    { id: 6, type: 'expense', amount: '10.00', status: 'refunded', transaction_date: '2026-08-11', paid_at: '2026-08-11', refunded_at: '2026-09-11', category: 'aluguel' },
  ];

  it('separates received cash, launched amounts, overdue claims and refunds', () => {
    expect(summarizeFinancialTransactions(rows, start, end, today)).toMatchObject({
      income: 57, grossIncome: 60, expenses: 20, netResult: 37,
      expectedIncome: 250, pendingIncome: 250, overdue: 50, refunds: 50,
    });
  });

  it('keeps payments and reversals on their actual dates', () => {
    expect(buildFinancialCashFlow(rows, start, end)).toEqual([
      { date: '2026-09-02', income: 97, expenses: 0 },
      { date: '2026-09-06', income: 0, expenses: 30 },
      { date: '2026-09-09', income: -40, expenses: 0 },
      { date: '2026-09-11', income: 0, expenses: -10 },
    ]);
    expect(buildFinancialExpenseDistribution(rows, start, end)).toEqual([{ name: 'Aluguel', value: 20 }]);
  });
});
