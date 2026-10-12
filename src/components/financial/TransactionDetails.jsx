import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { PrivateFileLink } from '@/components/ui/private-file-link';
import { formatCurrency } from '@/lib/utils';
import { netAfterFee } from '@/lib/utils/money';

export const civilDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : 'Não informado';
const methods = { pix: 'PIX', credit: 'Cartão de crédito', debit: 'Cartão de débito', cash: 'Dinheiro', transfer: 'Transferência', other: 'Outro' };
const statuses = { paid: 'Pago', pending: 'Pendente', overdue: 'Vencido', refunded: 'Estornado' };

export default function TransactionDetails({ transaction, onClose }) {
    if (!transaction) return null;
    const rows = [
        ['Tipo', transaction.type === 'income' ? 'Receita' : 'Despesa'],
        ['Descrição', transaction.description || 'Sem descrição'],
        ['Categoria', transaction.category || 'Não informada'],
        ['Paciente', transaction.patient?.name || 'Sem paciente vinculado'],
        ['Valor bruto', formatCurrency(transaction.amount)],
        ['Taxa', `${transaction.fee_percentage || 0}%`],
        ['Valor após taxa', formatCurrency(netAfterFee(transaction.amount, transaction.fee_percentage || 0))],
        ['Competência', civilDate(transaction.transaction_date)],
        ['Pagamento', civilDate(transaction.paid_at)],
        ['Vencimento', civilDate(transaction.due_date)],
        ['Estorno', civilDate(transaction.refunded_at)],
        ['Método de pagamento', methods[transaction.payment_method] || 'Não informado'],
        ['Status registrado', statuses[transaction.status] || 'Não informado'],
    ];
    return <Dialog open onOpenChange={open => !open && onClose()}>
        <DialogContent className="financial-dialog financial-details-dialog flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden p-0">
            <DialogHeader className="financial-dialog-header"><DialogTitle>Detalhes da transação</DialogTitle><DialogDescription>Consulta dos dados registrados. Nenhuma alteração é feita nesta tela.</DialogDescription></DialogHeader>
            <div className="financial-dialog-body min-h-0 overflow-y-auto">
            <p className="my-2 rounded-xl bg-muted/50 p-4 text-3xl font-semibold tabular-nums">{formatCurrency(transaction.amount)}<span className="mt-1 block text-xs font-normal text-muted-foreground">Valor bruto · {statuses[transaction.status] || 'Status não informado'}</span></p>
            <dl className="grid min-w-0 grid-cols-2 gap-4">{rows.map(([label, value]) => <div key={label} className={['Descrição', 'Paciente', 'Método de pagamento'].includes(label) ? 'col-span-2 sm:col-span-1' : ''}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium tabular-nums">{value}</dd></div>)}</dl>
            {transaction.attachment_url && <PrivateFileLink bucket="financial-docs" value={transaction.attachment_url} className="break-words [&_button]:min-h-11 dark:[&_button]:text-green-300">Abrir comprovante</PrivateFileLink>}
            </div>
        <DialogFooter className="financial-dialog-footer"><Button variant="outline" onClick={onClose}>Fechar detalhes</Button></DialogFooter>
        </DialogContent>
    </Dialog>;
}
