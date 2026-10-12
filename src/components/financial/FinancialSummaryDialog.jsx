import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { civilDate } from './TransactionDetails';
import { isFinancialTransactionOverdue } from '@/lib/utils/financial-math';
import { getTodayIsoDate } from '@/lib/utils/date';

const titles = { balance: 'Saldo de caixa', income: 'Caixa recebido líquido', expense: 'Despesas pagas', pending: 'A receber no período' };
export function financialMetricRows(rows, kind, start, end) {
    const inPeriod = value => Boolean(value && value >= start && value <= end);
    return rows.filter(row => kind === 'pending'
        ? row.type === 'income' && ['pending', 'overdue'].includes(row.status) && inPeriod(row.transaction_date)
        : (kind === 'balance' || row.type === (kind === 'income' ? 'income' : 'expense')) &&
          ((['paid', 'refunded'].includes(row.status) && inPeriod(row.paid_at)) || (row.status === 'refunded' && inPeriod(row.refunded_at))));
}
export default function FinancialSummaryDialog({ kind, summary, rows, start, end, onClose, onTransaction, onReturnFocus }) {
    const [visibleCount, setVisibleCount] = useState(20);
    useEffect(() => { setVisibleCount(20); }, [kind, start, end]);
    if (!kind) return null;
    const selected = financialMetricRows(rows, kind, start, end);
    const fields = kind === 'balance' || kind === 'income'
        ? [['Recebido bruto, após estornos', summary.grossIncome], ['Taxas de recebimento', summary.grossIncome - summary.income], ['Caixa recebido líquido', summary.income], ...(kind === 'balance' ? [['Despesas pagas', summary.expenses], ['Saldo de caixa do período', summary.netResult]] : [['Receitas lançadas pela competência, inclusive pendências', summary.expectedIncome]])]
        : kind === 'expense' ? [['Despesas pagas no período', summary.expenses], ['Despesas lançadas pela competência', summary.expectedExpenses]]
            : [['A receber pela competência', summary.pendingIncome], ['Vencido', summary.overdue]];
    return <Dialog open onOpenChange={open => !open && onClose()}>
        <DialogContent onCloseAutoFocus={event => { if (onReturnFocus) { event.preventDefault(); onReturnFocus(); } }} className="financial-dialog financial-summary-dialog flex max-h-[90dvh] max-w-3xl flex-col overflow-hidden p-0">
            <DialogHeader className="financial-dialog-header"><DialogTitle>{titles[kind]}</DialogTitle><DialogDescription>{kind === 'pending' ? 'Receitas em aberto com competência no mês selecionado. Valores brutos.' : 'Pagamentos e estornos na data efetiva, inclusive lançamentos de outras competências. O resultado do período não representa saldo bancário.'}</DialogDescription></DialogHeader>
            <div className="financial-dialog-body min-h-0 overflow-y-auto">
                <dl className="grid gap-3 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="rounded-xl bg-muted/50 p-4"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 break-words text-lg font-semibold tabular-nums">{formatCurrency(value)}</dd></div>)}</dl>
                <h3 className="mb-2 mt-6 text-sm font-semibold">Lançamentos que compõem esta visão ({selected.length})</h3>
                <p className="mb-3 text-xs text-muted-foreground">Valores abaixo são brutos. Taxas e estornos estão detalhados em cada lançamento.</p>
                {selected.length ? <ul className="space-y-2">{selected.slice(0, visibleCount).map(row => <li key={row.id}><button type="button" onClick={() => onTransaction(row)} className="financial-summary-row flex w-full items-center justify-between gap-3 rounded-xl bg-muted/30 p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="min-w-0"><span className="block break-words text-sm font-medium">{row.description || 'Sem descrição'}</span><span className="mt-1 block text-xs text-muted-foreground">Competência {civilDate(row.transaction_date)} · {row.status === 'refunded' ? 'Estornado' : isFinancialTransactionOverdue(row, getTodayIsoDate()) ? 'Vencido' : row.status === 'paid' ? 'Pago' : 'Pendente'}</span></span><span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(row.amount)}</span></button></li>)}</ul> : <p className="py-4 text-sm text-muted-foreground">Nenhum lançamento compõe este indicador no período selecionado.</p>}
                {selected.length > visibleCount && <Button variant="outline" className="mt-4 w-full" onClick={() => setVisibleCount(count => count + 20)}>Mostrar mais lançamentos ({Math.min(visibleCount, selected.length)} de {selected.length})</Button>}
            </div>
            <DialogFooter className="financial-dialog-footer"><Button variant="outline" onClick={onClose}>Voltar ao painel</Button></DialogFooter>
        </DialogContent>
    </Dialog>;
}
