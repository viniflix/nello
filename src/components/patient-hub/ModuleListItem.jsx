import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * ModuleListItem - Componente Compartilhado
 *
 * Layout vertical otimizado com:
 * - Bolinha de alerta apenas para itens críticos pendentes
 * - Checkmark verde para completos
 * - Design limpo e escaneável
 * - 100% de largura (lista vertical)
 */
const ModuleListItem = ({
    icon: Icon,
    title,
    description,
    status,
    onNavigate,
    isCritical = false,
    preview = null,
    highlight = false
}) => {
    const isComplete = status === 'completed';
    const showAlert = isCritical && !isComplete;

    return (
        <Card className={cn(
            "hover:shadow-md transition-all border-l-4",
            highlight
                ? "border-l-primary bg-primary/5"
                : "border-l-transparent hover:border-l-primary"
        )}>
            <CardContent className="p-0">
                <button
                    onClick={onNavigate}
                    className="w-full text-left p-4 flex items-start gap-4 hover:bg-[#fefae0]/30 transition-colors group"
                >
                    {/* Ícone + Indicadores */}
                    <div className="relative flex-shrink-0">
                        <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                            isComplete
                                ? "bg-green-50"
                                : highlight
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-primary/10"
                        )}>
                            <Icon className={cn(
                                "w-5 h-5",
                                isComplete
                                    ? "text-green-700"
                                    : highlight
                                        ? "text-primary-foreground"
                                        : "text-primary"
                            )} />
                        </div>

                        {/* Bolinha de Alerta - Apenas críticos pendentes */}
                        {showAlert && (
                            <div className="absolute -top-1 -right-1">
                                <div className="relative">
                                    <div className="w-3 h-3 bg-orange-500 rounded-full" />
                                    <div className="absolute inset-0 w-3 h-3 bg-orange-500 rounded-full animate-ping opacity-75" />
                                </div>
                            </div>
                        )}

                        {/* Checkmark - Completos */}
                        {isComplete && (
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-600 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs font-bold">✓</span>
                            </div>
                        )}
                    </div>

                    {/* Conteúdo */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-sm text-foreground">
                                    {title}
                                </h4>
                                {highlight && (
                                    <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                                        Ativo
                                    </span>
                                )}
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>

                        <p className="text-xs text-muted-foreground line-clamp-2">
                            {description}
                        </p>

                        {/* Preview */}
                        {preview && (
                            <div className="mt-2">
                                {preview}
                            </div>
                        )}

                        {/* Alerta Crítico */}
                        {showAlert && (
                            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#5f6f52] bg-[#c4661f] px-3 py-1.5 rounded-md hover:bg-[#c4661f]/90 transition-colors">
                                <span className="w-1.5 h-1.5 bg-[#5f6f52] rounded-full animate-pulse" />
                                Etapa essencial pendente
                            </div>
                        )}
                    </div>
                </button>
            </CardContent>
        </Card>
    );
};

export default ModuleListItem;
