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
    ArrowRight,
    Circle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

/**
 * PatientJourneyWidget v3.1 - Design Alinhado com Paleta do Projeto
 *
 * Paleta: Verde #5f6f52, Verde claro #a9b388, Bege #fefae0, Laranja #c4661f
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
            isComplete: modulesStatus.anthropometry === 'completed',
            route: `/nutritionist/patients/${patientId}/anthropometry`
        },
        {
            id: 'energy_calculation',
            title: 'Cálculo de Necessidades',
            description: 'VET e distribuição de macros',
            icon: Calculator,
            isComplete: modulesStatus.energy_expenditure === 'completed',
            route: `/nutritionist/patients/${patientId}/energy-expenditure`
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
                    "w-full text-left transition-all duration-300",
                    "bg-gradient-to-r from-[#fefae0]/70 via-[#f9ebc7]/60 to-[#fefae0]/70",
                    "border border-[#a9b388]/40 rounded-lg",
                    "hover:shadow-md hover:border-[#a9b388]/60 hover:scale-[1.005]",
                    "px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3",
                    "group"
                )}
            >
                {/* Indicador Pulsante */}
                <div className="flex-shrink-0">
                    <div className="relative w-2 h-2">
                        <div className="absolute inset-0 bg-[#5f6f52] rounded-full animate-pulse" />
                        <div className="absolute inset-0 bg-[#5f6f52] rounded-full animate-ping opacity-40" />
                    </div>
                </div>

                {/* Conteúdo Principal */}
                <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 min-w-0">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-sm font-bold text-[#5f6f52] truncate">
                                Jornada Clínica
                            </span>
                            <span className="px-1.5 py-0.5 rounded-full bg-[#a9b388]/20 text-[10px] sm:text-xs font-semibold text-[#5f6f52] border border-[#a9b388]/30 whitespace-nowrap">
                                {completedCount}/{totalCount}
                            </span>
                        </div>

                        {/* Barra de Progresso */}
                        <div className="flex items-center gap-2">
                            <div className="flex-1 relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-gray-100 to-gray-200 shadow-inner">
                                <div
                                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#5f6f52] via-[#6d7e5f] to-[#7a8d6c] shadow-sm transition-all duration-700 ease-out"
                                    style={{ width: `${progressPercentage}%` }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
                                </div>
                            </div>
                            <span className="text-xs font-bold text-[#5f6f52] min-w-[2rem] text-right">
                                {progressPercentage}%
                            </span>
                        </div>
                    </div>

                    {/* Próxima Ação - Desktop */}
                    {nextStep && (
                        <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/60 border border-[#a9b388]/30">
                            <Circle className="w-2.5 h-2.5 text-[#c4661f] fill-[#c4661f]" />
                            <span className="text-[10px] text-gray-600">Próximo:</span>
                            <span className="text-[10px] font-semibold text-[#5f6f52] truncate max-w-[100px]">{nextStep.title}</span>
                        </div>
                    )}

                    {/* Ícone Expandir */}
                    <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-[#5f6f52] transition-colors flex-shrink-0" />
                </div>
            </button>
        );
    }

    // ============================================================
    // RENDER - MODO EXPANDIDO
    // ============================================================

    return (
        <div className="bg-gradient-to-r from-[#fefae0]/70 via-[#f9ebc7]/60 to-[#fefae0]/70 border border-[#a9b388]/40 rounded-lg shadow-md overflow-hidden">
            {/* Header Colapsável */}
            <button
                onClick={() => setIsExpanded(false)}
                className="w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between hover:bg-[#a9b388]/10 transition-all group"
            >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className="w-2 h-2 bg-[#5f6f52] rounded-full flex-shrink-0" />
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[#5f6f52] truncate">
                            Guia de Atendimento
                        </h3>
                        <p className="text-[10px] text-gray-600 mt-0.5 truncate">
                            Siga estas etapas para avaliação completa
                        </p>
                    </div>
                </div>
                <ChevronUp className="w-4 h-4 text-gray-400 group-hover:text-[#5f6f52] transition-colors flex-shrink-0" />
            </button>

            {/* Barra de Progresso no Modo Expandido */}
            <div className="px-3 sm:px-4 pb-2">
                <div className="flex items-center gap-2">
                    <div className="flex-1 relative h-1.5 rounded-full overflow-hidden bg-gradient-to-r from-gray-100 to-gray-200 shadow-inner">
                        <div
                            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#5f6f52] via-[#6d7e5f] to-[#7a8d6c] transition-all duration-700"
                            style={{ width: `${progressPercentage}%` }}
                        />
                    </div>
                    <span className="text-[10px] font-bold text-gray-700 min-w-[2.5rem] text-right">
                        {progressPercentage}%
                    </span>
                </div>
            </div>

            {/* Conteúdo Expandido - Steps */}
            <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2">
                {criticalSteps.map((step, index) => {
                    const Icon = step.icon;
                    const isNext = step.id === nextStep?.id;

                    return (
                        <div
                            key={step.id}
                            className={cn(
                                "flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg transition-all duration-300",
                                "border",
                                step.isComplete
                                    ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 shadow-sm"
                                    : isNext
                                        ? "bg-white border-[#c4661f] shadow-sm ring-1 ring-[#c4661f]/20"
                                        : "bg-white/60 border-gray-200 hover:border-gray-300"
                            )}
                        >
                            {/* Ícone com Estado */}
                            <div className={cn(
                                "w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all",
                                "border",
                                step.isComplete
                                    ? "bg-gradient-to-br from-green-400 to-emerald-500 border-green-500 shadow-md"
                                    : isNext
                                        ? "bg-gradient-to-br from-[#c4661f] to-[#d4764f] border-[#c4661f] shadow-sm"
                                        : "bg-gray-100 border-gray-300"
                            )}>
                                {step.isComplete ? (
                                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" strokeWidth={2.5} />
                                ) : (
                                    <Icon className={cn(
                                        "w-3.5 h-3.5 sm:w-4 sm:h-4",
                                        isNext ? "text-white" : "text-gray-500"
                                    )} />
                                )}
                            </div>

                            {/* Informações da Etapa */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                    <span className={cn(
                                        "text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded",
                                        step.isComplete
                                            ? "bg-green-100 text-green-700"
                                            : isNext
                                                ? "bg-orange-100 text-[#c4661f]"
                                                : "bg-gray-100 text-gray-600"
                                    )}>
                                        ETAPA {index + 1}
                                    </span>
                                    {step.isComplete && (
                                        <span className="text-[9px] sm:text-[10px] font-semibold text-green-600">✓ Concluída</span>
                                    )}
                                    {isNext && !step.isComplete && (
                                        <span className="text-[9px] sm:text-[10px] font-semibold text-[#c4661f] animate-pulse">• Pendente</span>
                                    )}
                                </div>
                                <h4 className={cn(
                                    "text-xs sm:text-sm font-bold mb-0.5 truncate",
                                    step.isComplete ? "text-green-800" : "text-gray-800"
                                )}>
                                    {step.title}
                                </h4>
                                <p className="text-[10px] sm:text-xs text-gray-600 truncate">
                                    {step.description}
                                </p>
                            </div>

                            {/* Botão de Ação */}
                            <div className="flex-shrink-0">
                                {isNext && !step.isComplete && (
                                    <Button
                                        size="sm"
                                        onClick={() => navigate(step.route)}
                                        className={cn(
                                            "h-7 sm:h-8 px-2 sm:px-3 text-[10px] sm:text-xs font-semibold",
                                            "bg-gradient-to-r from-[#5f6f52] to-[#6d7e5f] hover:from-[#4a5841] hover:to-[#5f6f52]",
                                            "shadow-sm hover:shadow-md transition-all"
                                        )}
                                    >
                                        <span className="hidden sm:inline">Iniciar</span>
                                        <span className="sm:hidden">▶</span>
                                        <ArrowRight className="ml-0.5 sm:ml-1 w-3 h-3 hidden sm:inline" />
                                    </Button>
                                )}

                                {step.isComplete && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => navigate(step.route)}
                                        className="h-7 sm:h-8 px-2 sm:px-3 text-[10px] sm:text-xs font-medium border-green-300 text-green-700 hover:bg-green-50"
                                    >
                                        <span className="hidden sm:inline">Revisar</span>
                                        <span className="sm:hidden">↻</span>
                                    </Button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PatientJourneyWidget;
