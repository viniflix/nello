import { format, parseISO, startOfWeek } from 'date-fns';

const cents = (value) => Math.round(Number(value || 0) * 100);
const money = (value) => Math.round(value) / 100;
const inMonth = (date, start, end) => Boolean(date && date >= start && date <= end);

/** Caixa usa paid_at/refunded_at; competência usa transaction_date. */
export function summarizeFinancialTransactions(rows, start, end, today) {
  let income = 0;
  let grossIncome = 0;
  let expenses = 0;
  let expectedIncome = 0;
  let expectedExpenses = 0;
  let pendingIncome = 0;
  let pendingExpenses = 0;
  let overdue = 0;
  let refunds = 0;
  for (const row of rows) {
    const amount = cents(row.amount);
    const isIncome = row.type === 'income';
    const isPaid = row.status === 'paid' || row.status === 'refunded';
    const isOpen = row.status === 'pending' || row.status === 'overdue';
    if (isPaid && inMonth(row.paid_at, start, end)) {
      if (isIncome) { income += cents(row.net_amount ?? row.amount); grossIncome += amount; }
      else expenses += amount;
    }
    if (row.status === 'refunded' && inMonth(row.refunded_at, start, end)) {
      if (isIncome) { income -= amount; grossIncome -= amount; }
      else expenses -= amount;
      refunds += amount;
    }
    if (inMonth(row.transaction_date, start, end) && row.status !== 'refunded') {
      if (isIncome) expectedIncome += amount;
      else expectedExpenses += amount;
      if (isOpen) {
        if (isIncome) {
          pendingIncome += amount;
          if (row.status === 'overdue' || (row.due_date && row.due_date < today)) overdue += amount;
        } else pendingExpenses += amount;
      }
    }
  }
  return {
    income: money(income), grossIncome: money(grossIncome), netIncome: money(income), expenses: money(expenses),
    netResult: money(income - expenses), expectedIncome: money(expectedIncome),
    expectedExpenses: money(expectedExpenses), pendingIncome: money(pendingIncome),
    pendingExpenses: money(pendingExpenses), overdue: money(overdue), refunds: money(refunds),
  };
}

export function buildFinancialCashFlow(rows, start, end, aggregation = 'day') {
  const grouped = new Map();
  const add = (date, type, amount) => {
    if (!inMonth(date, start, end)) return;
    const key = aggregation === 'week' ? format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd') : date;
    const point = grouped.get(key) || { date: key, income: 0, expenses: 0 };
    point[type === 'income' ? 'income' : 'expenses'] += amount;
    grouped.set(key, point);
  };
  for (const row of rows) {
    const amount = cents(row.amount);
    if (row.status === 'paid' || row.status === 'refunded') add(row.paid_at, row.type,
      row.type === 'income' ? cents(row.net_amount ?? row.amount) : amount);
    if (row.status === 'refunded') add(row.refunded_at, row.type, -amount);
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date)).map((point) => ({
    date: point.date, income: money(point.income), expenses: money(point.expenses),
  }));
}

export function buildFinancialExpenseDistribution(rows, start, end) {
  const grouped = new Map();
  for (const row of rows) {
    if (row.type !== 'expense') continue;
    const category = row.category || 'outros';
    const amount = cents(row.amount);
    if (['paid', 'refunded'].includes(row.status) && inMonth(row.paid_at, start, end)) {
      grouped.set(category, (grouped.get(category) || 0) + amount);
    }
    if (row.status === 'refunded' && inMonth(row.refunded_at, start, end)) {
      grouped.set(category, (grouped.get(category) || 0) - amount);
    }
  }
  return [...grouped.entries()].filter(([, value]) => value > 0).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1).replaceAll('_', ' '), value: money(value),
  }));
}
