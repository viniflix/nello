import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, AlertCircle, CheckCircle2, Info, Calculator } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * PlanTargetMonitor Component
 * 
 * Monitor que compara as calorias prescritas no plano alimentar
 * com a meta calculada no módulo de energia.
 * 
 * @param {number} targetCalories - Meta calculada (GET) do módulo de energia
 * @param {number} currentCalories - Calorias prescritas no plano atual
 * @param {string} patientId - ID do paciente (para navegação)
 * @param {object} energyCalculation - Dados do cálculo de energia (opcional, para tooltip)
 */
export default function PlanTargetMonitor({ 
    targetCalories, 
    currentCalories = 0, 
    patientId,
    energyCalculation = null 
}) {
    const navigate = useNavigate();

    // Se não houver meta calculada, mostrar botão para definir
    if (!targetCalories || targetCalories <= 0) {
        return (
            <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-yellow-600" />
                            <div>
                                <p className="text-sm font-semibold text-foreground">
                                    Gasto Energético não definido
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Defina o gasto energético para monitorar a meta do plano
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/energy-expenditure`)}
                            className="gap-2"
                        >
                            <Calculator className="w-4 h-4" />
                            Definir Gasto Energético
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Calcular diferença e percentual
    const difference = currentCalories - targetCalories;
    const differenceAbs = Math.abs(difference);
    const percentage = targetCalories > 0 ? Math.min(100, (currentCalories / targetCalories) * 100) : 0;

    // Determinar cor baseado na diferença
    let statusColor = 'text-green-600';
    let statusBg = 'bg-green-100 dark:bg-green-900/30';
    let statusBorder = 'border-green-500/50';
    let statusIcon = CheckCircle2;
    let statusText = 'Alinhado';

    if (differenceAbs <= 50) {
        // Dentro de 50kcal - Verde
        statusColor = 'text-green-600';
        statusBg = 'bg-green-100 dark:bg-green-900/30';
        statusBorder = 'border-green-500/50';
        statusIcon = CheckCircle2;
        statusText = 'Alinhado';
    } else if (differenceAbs <= 200) {
        // Dentro de 200kcal - Amarelo
        statusColor = 'text-yellow-600';
        statusBg = 'bg-yellow-100 dark:bg-yellow-900/30';
        statusBorder = 'border-yellow-500/50';
        statusIcon = AlertCircle;
        statusText = 'Próximo';
    } else {
        // Fora de 200kcal - Vermelho
        statusColor = 'text-red-600';
        statusBg = 'bg-red-100 dark:bg-red-900/30';
        statusBorder = 'border-red-500/50';
        statusIcon = AlertCircle;
        statusText = 'Desalinhado';
    }

    const StatusIcon = statusIcon;

    // Preparar breakdown para tooltip
    const getBreakdownContent = () => {
        if (!energyCalculation) return null;

        const protocolMap = {
            'harris-benedict': 'Harris-Benedict (1984)',
            'mifflin-st-jeor': 'Mifflin-St Jeor',
            'fao-who': 'FAO/WHO',
            'cunningham': 'Cunningham (Atletas)',
            'tinsley': 'Tinsley (Bodybuilding)'
        };

        return {
            protocol: protocolMap[energyCalculation.protocol] || energyCalculation.protocol,
            tmb: energyCalculation.tmb,
            activityLevel: energyCalculation.activity_level,
            get: energyCalculation.get,
            goalCalories: energyCalculation.get_with_activities || energyCalculation.get
        };
    };

    const breakdown = getBreakdownContent();

    return (
        <Card className={cn("sticky top-4 z-10", statusBorder, statusBg)}>
            <CardContent className="p-4">
                <div className="space-y-3">
                    {/* Header com Labels */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Target className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Prescrito:</span>
                            <span className="text-sm font-bold text-foreground">
                                {Math.round(currentCalories)} kcal
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Meta Calculada (GET):</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-primary">
                                    {Math.round(targetCalories)} kcal
                                </span>
                                {breakdown && (
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <button className="text-muted-foreground hover:text-foreground transition-colors">
                                                <Info className="w-3.5 h-3.5" />
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80 p-0" side="bottom" align="end">
                                            <div className="p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <Calculator className="w-4 h-4 text-primary" />
                                                    <h4 className="font-semibold text-sm">Cálculo de Energia</h4>
                                                </div>
                                                <div className="space-y-2 text-xs">
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Protocolo:</span>
                                                        <span className="font-medium">{breakdown.protocol}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">TMB:</span>
                                                        <span className="font-medium">{Math.round(breakdown.tmb)} kcal</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Nível de Atividade:</span>
                                                        <span className="font-medium">x{breakdown.activityLevel}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">GET Base:</span>
                                                        <span className="font-medium">{Math.round(breakdown.get)} kcal</span>
                                                    </div>
                                                    <div className="pt-2 border-t">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-muted-foreground">Meta Final:</span>
                                                            <span className="font-bold text-primary">
                                                                {Math.round(breakdown.goalCalories)} kcal
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                        <Progress 
                            value={percentage} 
                            className={cn(
                                "h-2",
                                differenceAbs <= 50 ? "bg-green-500" :
                                differenceAbs <= 200 ? "bg-yellow-500" :
                                "bg-red-500"
                            )}
                        />
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Progresso em relação à meta</span>
                            <span className={cn("font-semibold", statusColor)}>
                                {percentage.toFixed(1)}%
                            </span>
                        </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center justify-between">
                        <Badge 
                            variant="outline" 
                            className={cn(
                                "gap-1.5",
                                statusColor,
                                statusBorder
                            )}
                        >
                            <StatusIcon className="w-3 h-3" />
                            {statusText}
                        </Badge>
                        <span className={cn(
                            "text-sm font-semibold",
                            difference > 0 ? "text-red-600" : 
                            difference < 0 ? "text-blue-600" : 
                            "text-green-600"
                        )}>
                            {difference > 0 ? '+' : ''}{Math.round(difference)} kcal
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

