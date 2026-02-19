import React from 'react';
import { format } from 'date-fns';
import { Pencil, Trash2, TrendingUp, TrendingDown, Minus, Eye } from 'lucide-react';
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

const AnthropometryTable = ({ records = [], onEdit, onDelete, onView, highlightSections = [], loading = false }) => {
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

    const formatDateNumeric = (dateString) => {
        try {
            return format(new Date(dateString), 'dd/MM/yyyy');
        } catch {
            return dateString;
        }
    };

    const getFilledCount = (obj) => Object.values(obj || {}).filter((v) => v !== null && v !== undefined && v !== '').length;

    const getSectionSummary = (record) => {
        const sections = [
            Boolean(record?.weight || record?.height),
            getFilledCount(record?.circumferences) > 0,
            getFilledCount(record?.skinfolds) > 0 || getFilledCount(record?.bioimpedance) > 0,
            getFilledCount(record?.bone_diameters) > 0,
            Array.isArray(record?.photos) && record.photos.length > 0
        ];
        const total = sections.filter(Boolean).length;
        return `${total}/5 seções`;
    };

    const getRecordSections = (record) => ({
        basico: Boolean(record?.weight || record?.height),
        circunferencias: getFilledCount(record?.circumferences) > 0,
        dobras: getFilledCount(record?.skinfolds) > 0 || getFilledCount(record?.bioimpedance) > 0,
        diametros: getFilledCount(record?.bone_diameters) > 0,
        fotos: Array.isArray(record?.photos) && record.photos.length > 0
    });

    const sectionBadgeClass = (isPresent, key) => {
        if (!isPresent) return 'bg-muted/30 text-muted-foreground border-border';
        if (highlightSections.length === 0) return 'bg-primary/15 text-primary border-primary/30';
        if (highlightSections.includes(key)) return 'bg-[#5f6f52]/15 text-[#5f6f52] border-[#5f6f52]/30';
        return 'bg-muted/40 text-muted-foreground border-border';
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

    // Mobile: cards compactos e legíveis (sem scroll horizontal)
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
                className="rounded-lg border bg-card p-3"
            >
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                        {formatDateNumeric(record.record_date)}
                    </span>
                    <Badge variant={imcCategory.variant} className="text-[10px] px-1.5 py-0 h-5 whitespace-nowrap">
                        {imcCategory.short}
                    </Badge>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2">
                    <div>
                        <p className="text-[10px] text-muted-foreground">Peso</p>
                        <p className="text-sm font-semibold">{record.weight} kg</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-muted-foreground">Altura</p>
                        <p className="text-sm font-semibold">{record.height ? `${record.height} cm` : 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-muted-foreground">IMC</p>
                        <p className="text-sm font-semibold">{bmi ? bmi.toFixed(1) : 'N/A'}</p>
                    </div>
                </div>

                <p className="mt-2 text-[11px] text-muted-foreground">
                    {getSectionSummary(record)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(getRecordSections(record)).map(([key, enabled]) => (
                        <Badge key={`${record.id}-${key}`} variant="outline" className={`text-[10px] h-5 ${sectionBadgeClass(enabled, key)}`}>
                            {key === 'basico' && 'Básico'}
                            {key === 'circunferencias' && 'Circ.'}
                            {key === 'dobras' && 'Dobras'}
                            {key === 'diametros' && 'Diâm.'}
                            {key === 'fotos' && 'Fotos'}
                        </Badge>
                    ))}
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                    {trend ? (
                        <span className={`flex items-center gap-1 ${trend.color}`}>
                            <TrendIcon className="w-3.5 h-3.5" />
                            <span className="text-xs">{trend.text}</span>
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">Sem tendência</span>
                    )}

                    <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => onView?.(record)} className="h-8 w-8 p-0">
                            <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onEdit(record)} className="h-8 w-8 p-0">
                            <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onDelete(record)} className="h-8 w-8 p-0 text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {record.notes ? (
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                        {record.notes}
                    </p>
                ) : (
                    <p className="mt-2 text-[11px] text-muted-foreground italic">
                        Sem observações
                    </p>
                )}
            </div>
        );
    };

    return (
        <>
            {/* Mobile: lista compacta */}
            <div className="md:hidden space-y-2">
                <div className="px-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    Histórico de registros
                </div>
                <div className="space-y-2">
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
                                        <p className="mt-1 text-[11px] text-muted-foreground">
                                            {getSectionSummary(record)}
                                        </p>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {Object.entries(getRecordSections(record)).map(([key, enabled]) => (
                                                <Badge key={`${record.id}-${key}`} variant="outline" className={`text-[10px] h-5 ${sectionBadgeClass(enabled, key)}`}>
                                                    {key === 'basico' && 'Básico'}
                                                    {key === 'circunferencias' && 'Circ.'}
                                                    {key === 'dobras' && 'Dobras'}
                                                    {key === 'diametros' && 'Diâm.'}
                                                    {key === 'fotos' && 'Fotos'}
                                                </Badge>
                                            ))}
                                        </div>
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
                                                onClick={() => onView?.(record)}
                                                className="h-8 w-8 p-0"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Button>
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
