import React from 'react';
import { ArrowUpRight, ArrowDownRight, Wallet, Clock3, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export default function FinancialKPIs({ summary, loading, onInspect }) {
    const metrics = [
        { key: 'balance', label: 'Saldo de caixa', value: summary?.netResult ?? 0, icon: Wallet, details: [['Estornos registrados', summary?.refunds ?? 0]], action: 'Entender meu caixa' },
        { key: 'income', label: 'Caixa recebido líquido', value: summary?.income ?? 0, icon: ArrowUpRight, details: [['Recebido bruto', summary?.grossIncome ?? 0], ['Lançado no mês, inclusive pendências', summary?.expectedIncome ?? 0]], action: 'Ver recebimentos' },
        { key: 'expense', label: 'Despesas pagas', value: summary?.expenses ?? 0, icon: ArrowDownRight, details: [['Total de despesas lançadas', summary?.expectedExpenses ?? 0]], action: 'Explorar despesas' },
        { key: 'pending', label: 'A receber no período', value: summary?.pendingIncome ?? 0, icon: Clock3, details: [['Vencido', summary?.overdue ?? 0]], action: 'Ver pendências do mês' },
    ];
    return <section aria-label="Resumo financeiro do mês" className="space-y-3">
        <div className="financial-kpi-grid">{metrics.map(({ key, label, value, icon: Icon, details, action }, index) => <article key={key} className={`financial-kpi financial-kpi--${key} ${formatCurrency(value).length > 16 ? 'financial-kpi--wide-number' : ''}`} style={{ '--financial-order': index }}>
            {onInspect && <button type="button" disabled={loading} className="financial-kpi-target" aria-label={`${action}: ${label}`} onClick={event => onInspect(key, event.currentTarget)} />}
            <div className={`financial-kpi-content ${onInspect ? 'pointer-events-none relative' : 'relative'}`}>
                <h2 className="financial-kpi-label"><span><span className="financial-desktop-label">{label}</span><span className="financial-mobile-label" aria-hidden="true">{{ balance: 'Saldo de caixa', income: 'Recebido líquido', expense: 'Despesas pagas', pending: 'A receber' }[key]}</span></span><span className="financial-kpi-icon"><Icon className="h-5 w-5" aria-hidden="true" /></span></h2>
                {loading ? <div className="my-4 h-9 w-32 max-w-full rounded-lg bg-muted/30" aria-label="Carregando resumo" role="status" /> : <p className={`financial-kpi-value ${formatCurrency(value).length > 14 ? 'financial-kpi-value--long' : ''} ${formatCurrency(value).length > 15 ? 'financial-kpi-value--extra-long' : ''}`}>{formatCurrency(value)}</p>}
                {!loading && <dl className="financial-kpi-details">{details.map(([title, amount], detailIndex) => <div key={title} className={detailIndex ? 'financial-secondary-detail' : ''}><dt className="inline"><span className="financial-desktop-label">{title}: </span><span className="financial-mobile-label" aria-hidden="true">{{ balance: 'Estornos', income: detailIndex ? 'Lançado' : 'Bruto', expense: 'Lançado', pending: 'Vencido' }[key]}: </span></dt><dd className="inline tabular-nums">{formatCurrency(amount)}</dd></div>)}</dl>}
                {!loading && onInspect && <span className="financial-kpi-action"><span className="financial-desktop-label">{action}</span><span className="financial-mobile-label" aria-hidden="true">{{ balance: 'Ver saldo', income: 'Recebimentos', expense: 'Despesas', pending: 'Pendências' }[key]}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></span>}
                {key === 'balance' && !loading && value < 0 && <p className="mt-2 text-xs font-medium">Saídas superiores às entradas neste mês</p>}
            </div>
        </article>)}</div>
        <p className="text-xs leading-relaxed text-muted-foreground">Caixa considera a data do pagamento ou estorno. Valores lançados e pendências consideram a data da transação.</p>
    </section>;
}
