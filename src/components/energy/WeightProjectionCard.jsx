import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * WeightProjectionCard Component
 * 
 * Calcula e exibe projeção de mudança de peso baseado no déficit/superávit calórico diário.
 * 
 * @param {number} dailyDeficit - Déficit calórico diário (negativo = déficit, positivo = superávit)
 */
export default function WeightProjectionCard({ dailyDeficit = 0 }) {
    // 1kg de gordura ≈ 7700 kcal
    const CALORIES_PER_KG = 7700;

    const projections = useMemo(() => {
        if (!dailyDeficit || dailyDeficit === 0) {
            return {
                weeklyMin: 0,
                weeklyMax: 0,
                weeklyAvg: 0,
                monthlyEstimate: 0,
                isLoss: false,
                isGain: false
            };
        }

        const isLoss = dailyDeficit < 0;
        const weeklyChange = (Math.abs(dailyDeficit) * 7) / CALORIES_PER_KG;
        
        // Variação de +/- 10% para account for metabolic adaptation
        const variation = weeklyChange * 0.1;
        const weeklyMin = Math.max(0, weeklyChange - variation);
        const weeklyMax = weeklyChange + variation;
        
        // Estimativa mensal (aproximada, não precisa de range)
        const monthlyEstimate = (weeklyChange * 4.33); // ~4.33 semanas por mês

        return {
            weeklyMin,
            weeklyMax,
            weeklyAvg: weeklyChange,
            monthlyEstimate,
            isLoss,
            isGain: !isLoss
        };
    }, [dailyDeficit]);

    if (dailyDeficit === 0) {
        return (
            <Card className="border-dashed">
                <CardContent className="p-4">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Minus className="w-4 h-4" />
                        <p className="text-sm">Ajuste o slider para ver a projeção</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn(
            "border-2",
            projections.isLoss 
                ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20" 
                : "border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20"
        )}>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    {projections.isLoss ? (
                        <TrendingDown className="w-5 h-5 text-green-600" />
                    ) : (
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                    )}
                    Projeção de Mudança de Peso
                </CardTitle>
                <CardDescription className="text-xs">
                    Baseado em {Math.abs(dailyDeficit)} kcal {projections.isLoss ? 'de déficit' : 'de superávit'} diário
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Ritmo Semanal com Range */}
                <div className={cn(
                    "p-4 rounded-lg",
                    projections.isLoss 
                        ? "bg-green-100 dark:bg-green-900/30" 
                        : "bg-blue-100 dark:bg-blue-900/30"
                )}>
                    <p className="text-xs text-muted-foreground mb-2 text-center">Ritmo Estimado</p>
                    <p className={cn(
                        "text-2xl font-bold text-center",
                        projections.isLoss ? "text-green-700 dark:text-green-400" : "text-blue-700 dark:text-blue-400"
                    )}>
                        {projections.isLoss ? '-' : '+'}{projections.weeklyMin.toFixed(2)}kg - {projections.weeklyMax.toFixed(2)}kg
                    </p>
                    <p className="text-xs text-center text-muted-foreground mt-1">por semana</p>
                </div>

                {/* Estimativa Mensal */}
                <div className={cn(
                    "p-3 rounded-lg text-center",
                    projections.isLoss 
                        ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" 
                        : "bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800"
                )}>
                    <p className="text-xs text-muted-foreground mb-1">Em 1 mês</p>
                    <p className={cn(
                        "text-xl font-semibold",
                        projections.isLoss ? "text-green-700 dark:text-green-400" : "text-blue-700 dark:text-blue-400"
                    )}>
                        ~{projections.isLoss ? '-' : '+'}{projections.monthlyEstimate.toFixed(1)} kg
                    </p>
                </div>
                
                {/* Disclaimer Clínico */}
                <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground text-center leading-relaxed">
                        <span className="font-medium">⚠️ Estimativa matemática.</span> Resultados variam conforme adesão, metabolismo e adaptação metabólica.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

