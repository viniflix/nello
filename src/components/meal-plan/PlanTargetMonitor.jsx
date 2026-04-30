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
const PlanTargetMonitor = ({ 
    targetCalories, 
    currentCalories = 0, 
    patientId,
    patientSlugOrId,
    energyCalculation = null 
}) {
    const navigate = useNavigate();
    const patientSegment = patientSlugOrId ?? patientId;

    // Se não houver meta calculada, mostrar botão para definir
    if (!targetCalories || targetCalories <= 0) {
        return (
            <Card className="border-dashed border-2 border-amber-200 bg-amber-50 shadow-sm">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
                        <div className="flex flex-col md:flex-row items-center gap-4">
                            <div className="p-3 bg-amber-100 rounded-2xl shadow-sm border border-amber-200">
                                <Calculator className="w-6 h-6 text-amber-600" />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">Monitoramento Indisponível</h4>
                                <p className="text-xs text-amber-700/80 font-medium">O gasto energético (GET) não foi calculado para este paciente.</p>
                            </div>
                        </div>
                        <Button
                            variant="default"
                            size="lg"
                            onClick={() => navigate(`/nutritionist/patients/${patientSegment}/energy-expenditure`)}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-12 px-6 rounded-xl shadow-md transition-all active:scale-95"
                        >
                            <Target className="w-4 h-4 mr-2" />
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
    let cardBg = 'bg-green-50/30';

    if (differenceAbs <= 50) {
        // Dentro de 50kcal - Verde
        statusColor = 'text-green-600';
        statusBg = 'bg-green-100 dark:bg-green-900/30';
        statusBorder = 'border-green-500/50';
        statusIcon = CheckCircle2;
        statusText = 'Alinhado';
        cardBg = 'bg-green-50/30';
    } else if (differenceAbs <= 200) {
        // Dentro de 200kcal - Amarelo
        statusColor = 'text-yellow-600';
        statusBg = 'bg-yellow-100 dark:bg-yellow-900/30';
        statusBorder = 'border-yellow-500/50';
        statusIcon = AlertCircle;
        statusText = 'Próximo';
        cardBg = 'bg-yellow-50/30';
    } else {
        // Fora de 200kcal - Vermelho
        statusColor = 'text-red-600';
        statusBg = 'bg-red-100 dark:bg-red-900/30';
        statusBorder = 'border-red-500/50';
        statusIcon = AlertCircle;
        cardBg = 'bg-red-50/50';
    }

    const dotColor = differenceAbs <= 50 ? "bg-green-500" :
                    differenceAbs <= 200 ? "bg-yellow-500" :
                    "bg-red-500";

    const StatusIcon = statusIcon;

    // Preparar breakdown para tooltip
    const getBreakdownContent = () => {
        if (!energyCalculation) return null;

        const protocolMap = {
            'harris': 'Harris-Benedict (1984)',
            'harris-benedict': 'Harris-Benedict (1984)',
            'mifflin': 'Mifflin-St Jeor',
            'mifflin-st-jeor': 'Mifflin-St Jeor',
            'fao': 'FAO/WHO',
            'fao-who': 'FAO/WHO',
            'cunningham': 'Cunningham (Atletas)',
            'tinsley': 'Tinsley (Bodybuilding)'
        };
        const protocol = energyCalculation.tmb_protocol || energyCalculation.protocol;
        return {
            protocol: protocolMap[protocol] || protocol,
            tmb: energyCalculation.tmb_result ?? energyCalculation.tmb,
            activityLevel: energyCalculation.activity_factor ?? energyCalculation.activity_level,
            get: energyCalculation.get_result ?? energyCalculation.get,
            goalCalories: energyCalculation.final_planned_kcal ?? energyCalculation.get_with_activities ?? energyCalculation.get ?? energyCalculation.get_result
        };
    };

    const breakdown = getBreakdownContent();

    return (
        <Card className={cn("border-border shadow-sm overflow-hidden transition-colors duration-300", cardBg)}>
            <CardContent className="p-0">
                <div className="flex flex-col md:flex-row items-center">
                    {/* Status Indicator Bar */}
                    <div className={cn("w-full md:w-3 h-3 md:h-auto self-stretch", statusBg.replace('bg-', 'bg-opacity-80 bg-'))} />
                    
                    <div className="flex-1 p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className={cn("p-2 rounded-xl bg-white shadow-sm border", statusBorder)}>
                                    <StatusIcon className={cn("w-5 h-5", statusColor)} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-foreground uppercase tracking-tight">Status do Plano:&nbsp;&nbsp;&nbsp;{statusText}</h3>
                                    <p className="text-xs text-muted-foreground font-medium">Calorias prescritas vs. Gasto Energético (GET)</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                <div className="text-right">
                                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider mb-0.5">Diferença</p>
                                    <p className={cn(
                                        "text-lg font-black drop-shadow-sm leading-none",
                                        difference > 0 ? "text-red-500" : 
                                        difference < 0 ? "text-blue-500" : 
                                        "text-green-500"
                                    )}>
                                        {difference > 0 ? '+' : ''}{Math.round(difference)} <span className="text-[10px] font-bold">kcal</span>
                                    </p>
                                </div>

                                <div className="h-10 w-px bg-border/60" />

                                <div className="text-right">
                                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider mb-0.5">Alinhamento</p>
                                    <p className={cn("text-lg font-black leading-none", statusColor)}>
                                        {percentage.toFixed(1)}%
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Progress and Targets */}
                        <div className="flex flex-col sm:flex-row items-center gap-4 lg:gap-8 min-h-[40px]">
                            {/* Flexible Progress Bar */}
                            <div className="flex-1 w-full order-1 sm:order-1">
                                <div className="relative h-3.5 w-full bg-muted rounded-full overflow-hidden shadow-inner border border-black/5">
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all duration-1000 ease-out",
                                            dotColor
                                        )}
                                        style={{ width: `${percentage}%` }}
                                    />
                                    {/* Target Line marker */}
                                    <div className="absolute top-0 bottom-0 w-1 bg-white/40 left-[100%] ml-[-3px] z-10 shadow-sm" />
                                </div>
                            </div>

                            {/* Right-aligned Measurements */}
                            <div className="flex items-center gap-x-6 gap-y-2 shrink-0 order-2 sm:order-2 ml-0 sm:ml-auto px-1">
                                <div className="flex items-center gap-2">
                                    <div className={cn("w-2.5 h-2.5 rounded-full border border-black/5 shadow-sm", dotColor)} />
                                    <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">Plano: {Math.round(currentCalories)} <span className="text-[10px] font-medium ml-0.5">kcal</span></span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm border border-black/5" />
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-bold text-foreground whitespace-nowrap">Meta: {Math.round(targetCalories)} <span className="text-[10px] font-medium ml-0.5">kcal</span></span>
                                        {breakdown && (
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <button className="text-muted-foreground hover:text-foreground transition-all hover:scale-110">
                                                        <Info className="w-3.5 h-3.5" />
                                                    </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-80 p-0 border-none shadow-2xl rounded-2xl overflow-hidden" side="bottom" align="end">
                                                    <div className="p-5 space-y-4 bg-white/95 backdrop-blur-md">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="p-2 bg-primary/10 rounded-xl">
                                                                <Calculator className="w-4 h-4 text-primary" />
                                                            </div>
                                                            <h4 className="font-black text-sm uppercase tracking-tight">Cálculo de Energia</h4>
                                                        </div>
                                                        <div className="space-y-3">
                                                            {[
                                                                { label: 'Protocolo', val: breakdown.protocol, bold: true },
                                                                { label: 'TMB', val: `${Math.round(breakdown.tmb)} kcal` },
                                                                { label: 'Atividade', val: `x${breakdown.activityLevel}` },
                                                                { label: 'GET Base', val: `${Math.round(breakdown.get)} kcal` }
                                                            ].map(item => (
                                                                <div key={item.label} className="flex justify-between items-center text-xs pb-2 border-b border-border/40 last:border-0 last:pb-0">
                                                                    <span className="text-muted-foreground font-medium">{item.label}</span>
                                                                    <span className={cn("text-foreground", item.bold ? "font-bold" : "font-semibold")}>{item.val}</span>
                                                                </div>
                                                            ))}
                                                            <div className="pt-2">
                                                                <div className="flex justify-between items-center bg-muted/40 p-2.5 rounded-xl border border-border/50">
                                                                    <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Meta Final</span>
                                                                    <span className="font-black text-primary text-base">
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
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default React.memo(PlanTargetMonitor);
