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
        if (!bmi) return { label: 'N/A', variant: 'outline' };
        if (bmi < 18.5) return { label: 'Abaixo do peso', variant: 'secondary' };
        if (bmi < 25) return { label: 'Peso normal', variant: 'success' };
        if (bmi < 30) return { label: 'Sobrepeso', variant: 'warning' };
        return { label: 'Obesidade', variant: 'destructive' };
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

    return (
        <div className="border rounded-lg overflow-hidden">
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
                                <TableCell className="font-medium">
                                    {formatDate(record.record_date)}
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
                                    <Badge variant={imcCategory.variant}>
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
    );
};

export default AnthropometryTable;
