import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Edit, Trash2, Search, X, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils';

const STATUS_COLORS = {
    paid: 'success',
    pending: 'warning',
    overdue: 'destructive'
};

const STATUS_LABELS = {
    paid: 'Pago',
    pending: 'Pendente',
    overdue: 'Vencido'
};

const TYPE_LABELS = {
    income: 'Receita',
    expense: 'Despesa'
};

export default function TransactionList({ 
    transactions, 
    loading, 
    onEdit, 
    onDelete,
    onGenerateReceipt,
    filters,
    onFiltersChange 
}) {
    const [localSearch, setLocalSearch] = useState(filters?.search || '');

    const handleSearchChange = (value) => {
        setLocalSearch(value);
        onFiltersChange({ ...filters, search: value });
    };

    const handleFilterChange = (key, value) => {
        onFiltersChange({ ...filters, [key]: value === 'all' ? null : value });
    };

    const clearFilters = () => {
        setLocalSearch('');
        onFiltersChange({ type: null, status: null, search: null });
    };

    const hasActiveFilters = filters?.type || filters?.status || filters?.search;

    return (
        <Card className="overflow-hidden">
            <CardHeader className="pb-2">
                <CardTitle className="text-base md:text-lg break-words">Histórico de Transações</CardTitle>
            </CardHeader>
            <CardContent>
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4 min-w-0">
                    <div className="flex-1 relative min-w-0">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por descrição..."
                            value={localSearch}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="pl-9 min-w-0"
                        />
                    </div>
                    <Select 
                        value={filters?.type || 'all'} 
                        onValueChange={(value) => handleFilterChange('type', value)}
                    >
                        <SelectTrigger className="w-full sm:w-[180px]">
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
                        <SelectTrigger className="w-full sm:w-[180px]">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os status</SelectItem>
                            <SelectItem value="paid">Pago</SelectItem>
                            <SelectItem value="pending">Pendente</SelectItem>
                            <SelectItem value="overdue">Vencido</SelectItem>
                        </SelectContent>
                    </Select>
                    {hasActiveFilters && (
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={clearFilters}
                            className="flex-shrink-0"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                {/* Table */}
                {loading ? (
                    <div className="text-center py-8 text-muted-foreground">
                        Carregando transações...
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        Nenhuma transação encontrada.
                    </div>
                ) : (
                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[100px]">Data</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="w-[120px]">Categoria</TableHead>
                                    <TableHead className="w-[150px]">Paciente</TableHead>
                                    <TableHead className="w-[120px] text-right">Valor</TableHead>
                                    <TableHead className="w-[100px]">Status</TableHead>
                                    <TableHead className="w-[100px] text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.map((transaction) => (
                                    <TableRow key={transaction.id}>
                                        <TableCell className="font-medium">
                                            {format(new Date(transaction.transaction_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                                        </TableCell>
                                        <TableCell className="max-w-[200px] truncate">
                                            {transaction.description}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                {transaction.category || 
                                                 (transaction.type === 'income' ? 'Receita' : 'Despesa')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="max-w-[150px] truncate">
                                            {transaction.patient?.name || '-'}
                                        </TableCell>
                                        <TableCell className={`text-right font-semibold ${
                                            transaction.type === 'income' 
                                                ? 'text-green-600' 
                                                : 'text-red-600'
                                        }`}>
                                            {transaction.type === 'income' ? '+' : '-'}
                                            {formatCurrency(transaction.amount)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={STATUS_COLORS[transaction.status] || 'default'}>
                                                {STATUS_LABELS[transaction.status] || transaction.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end gap-2">
                                                {transaction.type === 'income' && transaction.status === 'paid' && onGenerateReceipt && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => onGenerateReceipt(transaction)}
                                                        className="h-8 w-8"
                                                        title="Gerar Recibo"
                                                    >
                                                        <Printer className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onEdit(transaction)}
                                                    className="h-8 w-8"
                                                    title="Editar"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => onDelete(transaction.id)}
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    title="Excluir"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

