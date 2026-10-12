import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Search, X, Printer, CheckCircle2, RotateCcw } from 'lucide-react';
import TransactionDetails, { civilDate } from './TransactionDetails';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils';

const STATUS_COLORS = {
    paid: 'success',
    pending: 'warning',
    overdue: 'destructive',
    refunded: 'secondary'
};

const STATUS_LABELS = {
    paid: 'Pago',
    pending: 'Pendente',
    overdue: 'Vencido',
    refunded: 'Estornado'
};

const TYPE_LABELS = {
    income: 'Receita',
    expense: 'Despesa'
};

export default function TransactionList({
    transactions,
    loading,
    loadError,
    onRetry,
    onNew,
    onEdit,
    onDelete,
    onGenerateReceipt,
    onConfirmPayment,
    onRefund,
    filters,
    onFiltersChange,
    pageSize = 20,
    totalCount = transactions.length
}) {
    const [page, setPage] = useState(1);
    const [details, setDetails] = useState(null);
    const pageCount = Math.max(1, Math.ceil(transactions.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const pageRows = transactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const handleSearchChange = (value) => {
        setPage(1);
        onFiltersChange({ ...filters, search: value });
    };

    const handleFilterChange = (key, value) => {
        setPage(1);
        onFiltersChange({ ...filters, [key]: value === 'all' ? null : value });
    };

    const clearFilters = () => {
        setPage(1);
        onFiltersChange({ type: null, status: null, search: null });
    };

    const hasActiveFilters = filters?.type || filters?.status || filters?.search;

    return (
        <>
        <Card className="min-w-0 overflow-hidden rounded-2xl bg-card shadow-sm">
            <CardHeader className="pb-3">
                <CardTitle className="font-sans text-base font-semibold text-foreground break-words">Histórico de Transações</CardTitle>
            </CardHeader>
            <CardContent>
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4 min-w-0">
                    <div className="flex-1 relative min-w-0">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            aria-label="Buscar transações" placeholder="Buscar por descrição..."
                            value={filters?.search || ''}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="h-11 pl-9 min-w-0"
                        />
                    </div>
                    <Select
                        value={filters?.type || 'all'}
                        onValueChange={(value) => handleFilterChange('type', value)}
                    >
                        <SelectTrigger aria-label="Filtro de transações" className="min-h-11 w-full sm:w-[160px]">
                            <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os tipos</SelectItem>
                            <SelectItem value="income">Receita</SelectItem>
                            <SelectItem value="expense">Despesa</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select
                        value={filters?.status || 'all'}
                        onValueChange={(value) => handleFilterChange('status', value)}
                    >
                        <SelectTrigger aria-label="Filtrar por status" className="min-h-11 w-full sm:w-[160px]">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os status</SelectItem>
                            <SelectItem value="paid">Pago</SelectItem>
                            <SelectItem value="pending">Pendente</SelectItem>
                            <SelectItem value="overdue">Vencido</SelectItem>
                            <SelectItem value="refunded">Estornado</SelectItem>
                        </SelectContent>
                    </Select>
                    {hasActiveFilters && (
                        <Button
                            variant="outline"
                            size="icon"
                            aria-label="Limpar filtros" onClick={clearFilters}
                            className="h-11 w-11 flex-shrink-0"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                <p className="mb-3 text-xs text-muted-foreground">Busca pela descrição dos lançamentos do mês. Inclui competência, pagamento ou estorno no período selecionado.</p>
                {!loading && !loadError && <p role="status" className="mb-3 text-xs text-muted-foreground">{transactions.length} de {totalCount} lançamentos do mês{hasActiveFilters ? ' · filtros ativos' : ''}. A exportação inclui o mês completo.</p>}
                {/* Table */}
                {loading ? (
                    <div className="text-center py-8 text-muted-foreground">
                        Carregando transações...
                    </div>
                ) : loadError ? (<div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">Histórico indisponível. <Button variant="outline" size="sm" onClick={onRetry}>Tentar novamente</Button></div>) : transactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <p>{hasActiveFilters ? 'Nenhuma transação corresponde aos filtros.' : 'Nenhuma transação registrada neste mês.'}</p>
                        <Button variant="outline" className="mt-3" onClick={hasActiveFilters ? clearFilters : onNew}>{hasActiveFilters ? 'Limpar filtros' : 'Registrar primeira transação'}</Button>
                    </div>
                ) : (
                    <div className="rounded-md border overflow-x-auto">
                        <Table aria-label="Histórico de transações" mobileLabels={["Competência", "Pagamento", "Descrição", "Categoria", "Paciente", "Valor", "Status", "Ações"]}>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[100px]">Competência</TableHead>
                                    <TableHead className="w-[100px]">Pagamento</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="w-[120px]">Categoria</TableHead>
                                    <TableHead className="w-[150px]">Paciente</TableHead>
                                    <TableHead className="w-[120px] text-right">Valor</TableHead>
                                    <TableHead className="w-[100px]">Status</TableHead>
                                    <TableHead className="w-[160px] text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pageRows.map((transaction) => (
                                    <TableRow key={transaction.id}>
                                        <TableCell className="font-medium">
                                            {civilDate(transaction.transaction_date)}
                                        </TableCell>
                                        <TableCell>{civilDate(transaction.paid_at)}</TableCell>
                                        <TableCell className="max-w-[260px]">
                                            <button type="button" onClick={() => setDetails(transaction)} className="min-h-11 max-w-full break-words text-left font-medium text-foreground hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{transaction.description || 'Sem descrição'}</button>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                {transaction.category ||
                                                 (transaction.type === 'income' ? 'Receita' : 'Despesa')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="max-w-[150px] break-words">
                                            {transaction.patient?.name || '-'}
                                        </TableCell>
                                        <TableCell className={`text-right font-semibold tabular-nums ${
                                            transaction.type === 'income'
                                                ? 'text-primary dark:text-green-300'
                                                : 'text-destructive dark:text-red-300'
                                        }`}>
                                            {transaction.type === 'income' ? '+' : '-'}
                                            {formatCurrency(transaction.amount)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={STATUS_COLORS[transaction.status] || 'default'}>
                                                {transaction.status === 'refunded' ? `Estornado ${transaction.refunded_at || ''}` :
                                                    transaction.status === 'pending' && transaction.due_date && transaction.due_date < format(new Date(), 'yyyy-MM-dd')
                                                        ? 'Vencido' : STATUS_LABELS[transaction.status] || transaction.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap justify-end gap-2">
                                                {transaction.status !== 'refunded' && <Button variant="ghost" className="h-11 px-3" onClick={() => onEdit(transaction)} aria-label="Editar">Editar</Button>}
                                                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Mais ações da transação"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
                                                        <DropdownMenuItem className="min-h-11" onClick={() => setDetails(transaction)}><Eye className="mr-2 h-4 w-4" />Ver detalhes</DropdownMenuItem>
                                                        {transaction.type === 'income' && ['pending', 'overdue'].includes(transaction.status) && onConfirmPayment && <DropdownMenuItem className="min-h-11" onClick={() => onConfirmPayment(transaction.id)}><CheckCircle2 className="mr-2 h-4 w-4" />Confirmar recebimento</DropdownMenuItem>}
                                                        {transaction.type === 'income' && transaction.status === 'paid' && onGenerateReceipt && <DropdownMenuItem className="min-h-11" onClick={() => onGenerateReceipt(transaction)}><Printer className="mr-2 h-4 w-4" />Gerar Recibo</DropdownMenuItem>}
                                                        {transaction.status === 'paid' && onRefund && <DropdownMenuItem className="min-h-11" onClick={() => onRefund(transaction.id)}><RotateCcw className="mr-2 h-4 w-4" />Registrar estorno</DropdownMenuItem>}
                                                        {!['paid', 'refunded'].includes(transaction.status) && <DropdownMenuItem className="min-h-11 text-destructive" onClick={() => onDelete(transaction.id)}><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
                {!loading && !loadError && transactions.length > pageSize && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Página {currentPage} de {pageCount} · {pageSize} por página</p><div className="flex gap-2"><Button variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>}
            </CardContent>
        </Card>
        <TransactionDetails transaction={details} onClose={() => setDetails(null)} />
        </>
    );
}

