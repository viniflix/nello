import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pencil, Trash2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const AnthropometryTable = ({ records = [], onEdit, onDelete, loading = false }) => {
    const getIMCCategory = (bmi) => {
        if (!bmi) return { label: 'N/A', short: 'N/A', variant: 'outline' };
        if (bmi < 18.5) return { label: 'Abaixo do peso', short: 'Abaixo', variant: 'secondary' };
        if (bmi < 25) return { label: 'Peso normal', short: 'Normal', variant: 'success' };
        if (bmi < 30) return { label: 'Sobrepeso', short: 'Sobrepeso', variant: 'warning' };
        return { label: 'Obesidade', short: 'Obesidade', variant: 'destructive' };
    };

    const getWeightTrend = (currentWeight, previousWeight) => {
        if (!previousWeight) return null;
        const diff = currentWeight - previousWeight;
        if (Math.abs(diff) < 0.1) return { icon: Minus, color: 'text-gray-500', text: 'Estável' };
        if (diff > 0) return { icon: TrendingUp, color: 'text-red-500', text: `+${diff.toFixed(1)} kg` };
        return { icon: TrendingDown, color: 'text-green-500', text: `${diff.toFixed(1)} kg` };
    };

    const formatDate = (dateString) => {
        try {
            return format(new Date(dateString), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
        } catch {
            return dateString;
        }
    };

    const formatDateNumeric = (dateString) => {
        try {
            return format(new Date(dateString), 'dd/MM/yyyy');
        } catch {
            return dateString;
        }
    };

    if (loading) {
        return (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
                Carregando registros...
            </div>
        );
    }

    if (records.length === 0) {
        return (
            <div className="border rounded-lg p-8 text-center">
                <p className="text-muted-foreground font-medium">
                    Nenhum registro encontrado
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                    Adicione o primeiro registro usando o formulário acima
                </p>
            </div>
        );
    }

    // Mobile: lista compacta em uma linha por registro (sem scroll horizontal)
    const mobileRow = (record, index) => {
        const bmi = record.bmi || (record.height
            ? (record.weight / Math.pow(record.height / 100, 2))
            : null);
        const imcCategory = getIMCCategory(bmi);
        const previousWeight = index < records.length - 1 ? records[index + 1].weight : null;
        const trend = getWeightTrend(record.weight, previousWeight);
        const TrendIcon = trend?.icon;
        return (
            <div
                key={record.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 py-3 last:border-b-0 text-sm"
            >
                <span className="font-medium text-foreground shrink-0">{formatDateNumeric(record.record_date)}</span>
                <span className="shrink-0"><span className="font-semibold">{record.weight}</span> kg</span>
                <span className="shrink-0 text-muted-foreground">{record.height ? `${record.height} cm` : 'N/A'}</span>
                <span className="shrink-0 font-semibold">{bmi ? bmi.toFixed(1) : 'N/A'}</span>
                <Badge variant={imcCategory.variant} className="text-[10px] px-1.5 py-0 shrink-0">
                    {imcCategory.short}
                </Badge>
                {trend && (
                    <span className={`flex items-center gap-0.5 shrink-0 ${trend.color}`}>
                        <TrendIcon className="w-3.5 h-3.5" />
                        <span className="text-xs">{trend.text}</span>
                    </span>
                )}
                <div className="flex gap-1 ml-auto shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(record)} className="h-7 w-7 p-0">
                        <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(record)} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>
        );
    };

    return (
        <>
            {/* Mobile: lista compacta */}
            <div className="md:hidden border rounded-lg overflow-hidden bg-card">
                <div className="px-3 py-2 border-b bg-muted/40 text-xs font-medium text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>Data</span>
                    <span>Peso</span>
                    <span>Alt.</span>
                    <span>IMC</span>
                    <span>Classif.</span>
                    <span className="ml-auto">Ações</span>
                </div>
                <div className="divide-y divide-border/60">
                    {records.map((record, index) => mobileRow(record, index))}
                </div>
            </div>

            {/* Desktop: tabela com data numérica e badge menor */}
            <div className="hidden md:block border rounded-lg overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Peso (kg)</TableHead>
                            <TableHead>Altura (cm)</TableHead>
                            <TableHead>IMC</TableHead>
                            <TableHead>Classificação</TableHead>
                            <TableHead>Tendência</TableHead>
                            <TableHead>Observações</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {records.map((record, index) => {
                            const bmi = record.bmi || (record.height
                                ? (record.weight / Math.pow(record.height / 100, 2))
                                : null);
                            const imcCategory = getIMCCategory(bmi);
                            const previousWeight = index < records.length - 1
                                ? records[index + 1].weight
                                : null;
                            const trend = getWeightTrend(record.weight, previousWeight);
                            const TrendIcon = trend?.icon;

                            return (
                                <TableRow key={record.id}>
                                    <TableCell className="font-medium whitespace-nowrap">
                                        {formatDateNumeric(record.record_date)}
                                    </TableCell>
                                    <TableCell>
                                        <span className="font-semibold">{record.weight}</span> kg
                                    </TableCell>
                                    <TableCell>
                                        {record.height ? `${record.height} cm` : 'N/A'}
                                    </TableCell>
                                    <TableCell>
                                        {bmi ? (
                                            <span className="font-semibold">{bmi.toFixed(1)}</span>
                                        ) : (
                                            <span className="text-muted-foreground">N/A</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={imcCategory.variant} className="text-xs">
                                            {imcCategory.label}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {trend && (
                                            <div className="flex items-center gap-1">
                                                <TrendIcon className={`w-4 h-4 ${trend.color}`} />
                                                <span className={`text-sm ${trend.color}`}>
                                                    {trend.text}
                                                </span>
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="max-w-xs">
                                        {record.notes ? (
                                            <span className="text-sm text-muted-foreground line-clamp-2">
                                                {record.notes}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">
                                                Sem observações
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onEdit(record)}
                                                className="h-8 w-8 p-0"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onDelete(record)}
                                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </>
    );
};

export default AnthropometryTable;
