import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    FileText,
    BarChart3,
    Calculator,
    Utensils,
    ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

/**
 * PatientJourneyWidget v2 - Versão Discreta e Colapsável
 *
 * Design minimalista que funciona como um "assistente discreto",
 * não como um componente proeminente que obstrui conteúdo.
 */
const PatientJourneyWidget = ({
    patientId,
    modulesStatus = {},
    latestMetrics = {}
}) => {
    const navigate = useNavigate();
    const [isExpanded, setIsExpanded] = useState(false);

    // ============================================================
    // REGRAS DE NEGÓCIO - Caminho Crítico
    // ============================================================

    const criticalSteps = [
        {
            id: 'anamnesis',
            title: 'Anamnese',
            description: 'Histórico clínico e alergias',
            icon: FileText,
            isComplete: modulesStatus.anamnese === 'completed',
            route: `/nutritionist/patients/${patientId}/anamnese`
        },
        {
            id: 'anthropometry',
            title: 'Avaliação Antropométrica',
            description: 'Peso, altura e medidas',
            icon: BarChart3,
            isComplete: modulesStatus.anthropometry === 'completed' && latestMetrics?.weight,
            route: `/nutritionist/patients/${patientId}/anthropometry`
        },
        {
            id: 'energy_calculation',
            title: 'Cálculo de Necessidades',
            description: 'VET e distribuição de macros',
            icon: Calculator,
            isComplete: modulesStatus.meal_plan === 'completed' || modulesStatus.prescriptions === 'completed',
            route: `/nutritionist/patients/${patientId}/meal-plan`
        },
        {
            id: 'diet_plan',
            title: 'Plano Alimentar',
            description: 'Prescrição dietética vigente',
            icon: Utensils,
            isComplete: modulesStatus.meal_plan === 'completed',
            route: `/nutritionist/patients/${patientId}/meal-plan`
        }
    ];

    const completedCount = criticalSteps.filter(s => s.isComplete).length;
    const totalCount = criticalSteps.length;
    const progressPercentage = Math.round((completedCount / totalCount) * 100);
    const isComplete = completedCount === totalCount;
    const nextStep = criticalSteps.find(s => !s.isComplete);

    // Se tudo completo, não exibir o widget
    if (isComplete) return null;

    // ============================================================
    // RENDER - MODO COLAPSADO (Padrão)
    // ============================================================

    if (!isExpanded) {
        return (
            <button
                onClick={() => setIsExpanded(true)}
                className={cn(
                    "w-full text-left transition-all",
                    "bg-gradient-to-r from-amber-50 to-orange-50",
                    "border border-amber-200 rounded-lg",
                    "hover:shadow-md hover:border-amber-300",
                    "px-4 py-3 flex items-center gap-3"
                )}
            >
                {/* Indicador de Alerta */}
                <div className="flex-shrink-0">
                    <div className="relative">
                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                        <div className="absolute inset-0 w-2 h-2 bg-orange-500 rounded-full animate-ping opacity-75" />
                    </div>
                </div>

                {/* Conteúdo Principal */}
                <div className="flex-1 flex items-center justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-foreground">
                                Jornada Clínica
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {completedCount}/{totalCount} completas
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Progress value={progressPercentage} className="h-1.5 flex-1 max-w-xs" />
                            <span className="text-xs font-medium text-orange-700">
                                {progressPercentage}%
                            </span>
                        </div>
                    </div>

                    {/* Próxima Ação */}
                    {nextStep && (
                        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Próximo:</span>
                            <span className="font-medium text-foreground">{nextStep.title}</span>
                        </div>
                    )}

                    {/* Ícone Expandir */}
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
            </button>
        );
    }

    // ============================================================
    // RENDER - MODO EXPANDIDO
    // ============================================================

    return (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg shadow-sm">
            {/* Header Colapsável */}
            <button
                onClick={() => setIsExpanded(false)}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-amber-100/50 transition-colors rounded-t-lg"
            >
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-orange-500 rounded-full" />
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">
                            Guia de Consulta
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Etapas essenciais para uma avaliação completa
                        </p>
                    </div>
                </div>
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
            </button>

            {/* Conteúdo Expandido */}
            <div className="px-4 pb-4 space-y-2">
                {criticalSteps.map((step, index) => {
                    const Icon = step.icon;
                    const isNext = step.id === nextStep?.id;

                    return (
                        <div
                            key={step.id}
                            className={cn(
                                "flex items-center gap-3 p-3 rounded-lg transition-all",
                                step.isComplete
                                    ? "bg-white/50 border border-green-200"
                                    : isNext
                                        ? "bg-white border-2 border-orange-300 shadow-sm"
                                        : "bg-white/30 border border-amber-100"
                            )}
                        >
                            {/* Ícone da Etapa */}
                            <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                                step.isComplete
                                    ? "bg-green-100"
                                    : isNext
                                        ? "bg-orange-100"
                                        : "bg-gray-100"
                            )}>
                                {step.isComplete ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-700" />
                                ) : (
                                    <Icon className={cn(
                                        "w-4 h-4",
                                        isNext ? "text-orange-700" : "text-gray-500"
                                    )} />
                                )}
                            </div>

                            {/* Informações da Etapa */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={cn(
                                        "text-xs font-medium",
                                        step.isComplete ? "text-green-700" : "text-foreground"
                                    )}>
                                        {index + 1}. {step.title}
                                    </span>
                                    {step.isComplete && (
                                        <span className="text-xs text-green-600">✓</span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                    {step.description}
                                </p>
                            </div>

                            {/* Botão de Ação */}
                            {!step.isComplete && isNext && (
                                <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => navigate(step.route)}
                                    className="flex-shrink-0 h-8 text-xs"
                                >
                                    Iniciar
                                    <ArrowRight className="ml-1 w-3 h-3" />
                                </Button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PatientJourneyWidget;
