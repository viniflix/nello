import React from 'react';
import { CheckCircle2, AlertCircle, Circle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const StatusDashboard = ({ modulesStatus = {} }) => {
    // Calcular estatísticas
    const modules = Object.values(modulesStatus);
    const completed = modules.filter(status => status === 'completed').length;
    const pending = modules.filter(status => status === 'pending').length;
    const notStarted = modules.filter(status => status === 'not_started' || !status).length;
    const total = modules.length || 7; // Total de módulos esperados

    const completionPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    {/* Título e Progresso */}
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-sm font-semibold text-foreground">
                                Status Geral dos Módulos
                            </h3>
                            <Badge variant="outline" className="bg-background">
                                {completionPercentage}% Completo
                            </Badge>
                        </div>

                        {/* Barra de Progresso */}
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500"
                                style={{ width: `${completionPercentage}%` }}
                            />
                        </div>
                    </div>

                    {/* Badges de Status */}
                    <div className="flex gap-3">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 border border-green-200 rounded-lg">
                            <CheckCircle2 className="h-4 w-4 text-green-700" />
                            <div className="flex flex-col">
                                <span className="text-xs text-green-600 font-medium">Completos</span>
                                <span className="text-lg font-bold text-green-700 leading-none">{completed}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-100 border border-yellow-200 rounded-lg">
                            <AlertCircle className="h-4 w-4 text-yellow-700" />
                            <div className="flex flex-col">
                                <span className="text-xs text-yellow-600 font-medium">Pendentes</span>
                                <span className="text-lg font-bold text-yellow-700 leading-none">{pending}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg">
                            <Circle className="h-4 w-4 text-gray-700" />
                            <div className="flex flex-col">
                                <span className="text-xs text-gray-600 font-medium">Não Iniciados</span>
                                <span className="text-lg font-bold text-gray-700 leading-none">{notStarted}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mensagem de Incentivo */}
                {pending > 0 && (
                    <div className="mt-3 pt-3 border-t border-primary/20">
                        <p className="text-xs text-muted-foreground">
                            💡 <strong>{pending} módulo{pending > 1 ? 's' : ''}</strong> {pending > 1 ? 'precisam' : 'precisa'} de atenção
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default StatusDashboard;
