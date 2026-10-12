import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto rounded-2xl">
            <DialogHeader><DialogTitle>Detalhes da transação</DialogTitle><DialogDescription>Consulta dos dados registrados. Nenhuma alteração é feita nesta tela.</DialogDescription></DialogHeader>
            <dl className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className={label === 'Descrição' ? 'sm:col-span-2' : ''}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium tabular-nums">{value}</dd></div>)}</dl>
            {transaction.attachment_url && <PrivateFileLink bucket="financial-docs" value={transaction.attachment_url} className="break-words [&_button]:min-h-11 dark:[&_button]:text-green-300">Abrir comprovante</PrivateFileLink>}
        </DialogContent>
    </Dialog>;
}
