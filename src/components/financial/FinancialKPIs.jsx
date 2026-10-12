import React from 'react';
import { ArrowUpRight, ArrowDownRight, Wallet, Clock3 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export default function FinancialKPIs({ summary, loading }) {
    const metrics = [
        { label: 'Saldo de caixa', value: summary?.netResult ?? 0, icon: Wallet, hero: true, details: [['Estornos registrados', summary?.refunds ?? 0]] },
        { label: 'Caixa recebido líquido', value: summary?.income ?? 0, icon: ArrowUpRight, details: [['Recebido bruto', summary?.grossIncome ?? 0], ['Lançado no mês, inclusive pendências', summary?.expectedIncome ?? 0]] },
        { label: 'Despesas pagas', value: summary?.expenses ?? 0, icon: ArrowDownRight, details: [['Total de despesas lançadas', summary?.expectedExpenses ?? 0]] },
        { label: 'A receber no período', value: summary?.pendingIncome ?? 0, icon: Clock3, details: [['Vencido', summary?.overdue ?? 0]] },
    ];
    return <section aria-label="Resumo financeiro do mês" className="space-y-3">
        <div className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {metrics.map(({ label, value, icon: Icon, hero, details }) => <article key={label} className={`min-w-0 rounded-2xl border p-5 shadow-sm ${hero ? 'border-primary bg-primary text-white min-[420px]:col-span-2 sm:col-span-1' : 'border-border bg-card text-card-foreground'}`}>
                <div className="flex items-start justify-between gap-2"><h2 className={`font-sans text-sm font-medium tracking-normal ${hero ? 'text-white/90' : 'text-muted-foreground'}`}>{label}</h2><Icon className={`h-5 w-5 shrink-0 ${hero ? 'text-white/80' : 'text-muted-foreground'}`} aria-hidden="true" /></div>
                {loading ? <div className={`my-4 h-9 w-32 max-w-full rounded-lg animate-pulse motion-reduce:animate-none ${hero ? 'bg-white/20' : 'bg-muted'}`} aria-label="Carregando resumo" role="status" /> : <p className={`mt-4 font-sans text-2xl font-semibold tracking-tight tabular-nums break-words xl:text-[1.75rem] ${hero && value < 0 ? 'text-white' : !hero && value < 0 ? 'text-destructive' : ''}`}>{formatCurrency(value)}</p>}
                {!loading && <dl className={`mt-3 space-y-1 text-xs leading-relaxed ${hero ? 'text-white/90' : 'text-muted-foreground'}`}>{details.map(([title, amount]) => <div key={title}><dt className="inline">{title}: </dt><dd className="inline tabular-nums">{formatCurrency(amount)}</dd></div>)}</dl>}
                {hero && !loading && value < 0 && <p className="mt-2 text-xs font-medium">Saídas superiores às entradas neste mês</p>}
            </article>)}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">Caixa considera a data do pagamento ou estorno. Valores lançados e pendências consideram a data da transação.</p>
    </section>;
}
