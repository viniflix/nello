import React, { useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { ChevronDown, Clock3, CheckCircle2, Calendar, Trash2 } from 'lucide-react';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import { getTodayIsoDate } from '@/lib/utils/date';
import { isFinancialTransactionOverdue } from '@/lib/utils/financial-math';
import { toCents, fromCents } from '@/lib/utils/money';
import { updateTransactionStatus, rescheduleTransaction, deleteTransaction } from '@/lib/supabase/financial-queries';
import { useToast } from '@/components/ui/use-toast';

export default function PendingPaymentsWidget({ payments = [], state = 'loading', onRetry, onUpdate, onInspect }) {
    const { toast } = useToast();
    const [action, setAction] = useState(null);
    const [date, setDate] = useState('');
    const [visibleCount, setVisibleCount] = useState(5);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState(false);
    const lock = useRef(false);
    const today = getTodayIsoDate();
    const overdue = payments.filter(row => isFinancialTransactionOverdue(row, today)).length;
    const total = fromCents(payments.reduce((sum, row) => sum + toCents(row.amount), 0));
    const run = async () => {
        if (!action || lock.current) return;
        if (action.type === 'reschedule' && !date) return;
        lock.current = true; setBusy(true); setActionError(false);
        try {
            if (action.type === 'paid') await updateTransactionStatus(action.id, 'paid');
            else if (action.type === 'delete') await deleteTransaction(action.id);
            else await rescheduleTransaction(action.id, date);
            setAction(null); setDate('');

            toast({ title: action.type === 'paid' ? 'Recebimento confirmado' : action.type === 'delete' ? 'Cobrança excluída' : 'Cobrança reagendada' });
        } catch {
            setActionError(true); return;
        } finally { lock.current = false; setBusy(false); }
        await onUpdate?.();
    };
    const closeAction = () => { if (!lock.current) { setAction(null); setActionError(false); setDate(''); } };
    const feedback = actionError && <p role="alert" className="text-sm text-destructive">Não foi possível concluir a alteração. Confira o estado da cobrança antes de tentar novamente.</p>;
    return <>
        <Card id="pending-payments" className="min-w-0 rounded-2xl bg-card shadow-sm">
            <CardContent className="p-4 sm:p-5">
                {state === 'loading' ? <p role="status" className="text-sm text-muted-foreground">Carregando cobranças em aberto…</p>
                    : state === 'error' ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Cobranças em aberto indisponíveis. Isso não significa que não há pendências.</span><Button variant="outline" onClick={onRetry}>Tentar carregar cobranças</Button></div>
                    : payments.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary dark:text-green-300" aria-hidden="true" />Nenhuma cobrança em aberto · todos os períodos</p>
                        : <details open={overdue > 0} className="group min-w-0">
                            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                                <span className="flex min-w-0 flex-wrap items-center gap-2"><Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="font-medium">Cobranças em aberto</span><Badge variant={overdue ? 'warning' : 'outline'}>{payments.length}{overdue ? ` · ${overdue} vencidas` : ''}</Badge></span>
                                <span className="flex items-center gap-3"><span className="font-semibold tabular-nums">{formatCurrency(total)}</span><ChevronDown className="h-4 w-4 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></span>
                            </summary>
                            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">Valor bruto em aberto · todos os períodos, inclusive vencimentos futuros. Este painel não acompanha os filtros do mês.</p>
                            <ul className="space-y-2">{payments.slice(0, visibleCount).map(row => {
                                const late = isFinancialTransactionOverdue(row, today);
                                const days = row.due_date ? Math.max(0, differenceInCalendarDays(new Date(), parseISO(row.due_date + 'T00:00:00'))) : 0;
                                return <li key={row.id} className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-border bg-background/40 p-3 sm:flex-row sm:items-center">
                                    <div className="min-w-0 flex-1">{onInspect ? <button type="button" className="financial-pending-name text-left" aria-label={`Abrir detalhes de ${row.patient?.name || 'recebimento'}: ${row.description || 'Cobrança sem descrição'}`} onClick={() => onInspect(row)}><span className="block break-words text-sm font-medium">{row.description || 'Cobrança sem descrição'}</span><span className="mt-1 block break-words text-xs">{row.patient?.name || 'Sem paciente vinculado'}</span></button> : <p className="break-words text-sm font-medium">{row.description || 'Cobrança sem descrição'}</p>}<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{!onInspect && <span className="break-words">{row.patient?.name || 'Sem paciente vinculado'}</span>}<span>{row.due_date ? `Vence ${format(parseISO(row.due_date), 'dd/MM/yyyy')}` : `Sem vencimento definido · competência ${format(parseISO(row.transaction_date), 'dd/MM/yyyy')}`}</span><span className="font-medium tabular-nums text-foreground">{formatCurrency(row.amount)}</span>{late && <span className="font-medium text-destructive">{days ? `${days} ${days === 1 ? 'dia em atraso' : 'dias em atraso'}` : 'Vencida'}</span>}</div></div>
                                    <div className="flex flex-wrap items-center gap-1"><Button size="sm" variant="outline" disabled={busy} className="min-h-11 gap-1.5" onClick={() => setAction({ type: 'paid', id: row.id })}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Confirmar recebimento</Button><Button size="icon" variant="ghost" disabled={busy} className="h-11 w-11" aria-label="Reagendar cobrança" onClick={() => { setDate(row.due_date || row.transaction_date); setAction({ type: 'reschedule', id: row.id }); }}><Calendar className="h-4 w-4" aria-hidden="true" /></Button><Button size="icon" variant="ghost" disabled={busy} className="h-11 w-11 text-destructive" aria-label="Excluir cobrança pendente" onClick={() => setAction({ type: 'delete', id: row.id })}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button></div>
                                </li>;
                            })}</ul>
                            {visibleCount < payments.length && <Button variant="ghost" className="mt-3 min-h-11" onClick={() => setVisibleCount(count => count + 10)}>Mostrar mais cobranças ({payments.length - visibleCount})</Button>}
                        </details>}
            </CardContent>
        </Card>
        <AlertDialog open={Boolean(action && action.type !== 'reschedule')} onOpenChange={open => !open && closeAction()}><AlertDialogContent className="financial-dialog"><AlertDialogHeader><AlertDialogTitle>{action?.type === 'delete' ? 'Excluir cobrança pendente' : 'Confirmar recebimento'}</AlertDialogTitle><AlertDialogDescription>{action?.type === 'delete' ? 'Esta ação exclui a transação permanentemente. Confira a cobrança antes de confirmar.' : 'A cobrança será marcada como paga na data de hoje. Confira o recebimento antes de confirmar.'}</AlertDialogDescription></AlertDialogHeader>{feedback}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); run(); }} className={action?.type === 'delete' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}>{busy ? 'Salvando…' : action?.type === 'delete' ? 'Excluir cobrança' : 'Confirmar recebimento'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        <Dialog open={action?.type === 'reschedule'} onOpenChange={open => !open && closeAction()}><DialogContent className="financial-dialog"><DialogHeader><DialogTitle>Reagendar cobrança</DialogTitle></DialogHeader><div className="space-y-3"><Label htmlFor="reschedule-date">Nova data de vencimento</Label><DateInputWithCalendar id="reschedule-date" value={date} onChange={setDate} disabled={busy} min={today} />{feedback}</div><DialogFooter><Button variant="outline" disabled={busy} onClick={closeAction}>Cancelar</Button><Button disabled={busy || !date} onClick={run}>{busy ? 'Salvando…' : 'Reagendar'}</Button></DialogFooter></DialogContent></Dialog>
    </>;
}
