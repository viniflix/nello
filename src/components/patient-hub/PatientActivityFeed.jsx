import React, { useState, useEffect } from 'react';
import { formatDistanceToNow, subDays, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    Utensils,
    Weight,
    Trophy,
    Calendar,
    MessageSquare,
    FileText,
    ChevronDown,
    Filter,
    Loader2
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const ActivityItem = ({ activity }) => {
    const getActivityIcon = (type) => {
        switch (type) {
            case 'meal':
                return <Utensils className="w-4 h-4 text-orange-500" />;
            case 'weight':
                return <Weight className="w-4 h-4 text-blue-500" />;
            case 'achievement':
                return <Trophy className="w-4 h-4 text-yellow-500" />;
            case 'appointment':
                return <Calendar className="w-4 h-4 text-purple-500" />;
            case 'message':
                return <MessageSquare className="w-4 h-4 text-green-500" />;
            case 'anamnese':
                return <FileText className="w-4 h-4 text-indigo-500" />;
            default:
                return <FileText className="w-4 h-4 text-gray-500" />;
        }
    };

    const formatTimestamp = (timestamp) => {
        try {
            return formatDistanceToNow(new Date(timestamp), {
                addSuffix: true,
                locale: ptBR
            });
        } catch {
            return 'Data inválida';
        }
    };

    return (
        <div className="flex gap-3 p-3 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer group">
            <div className="flex-shrink-0 mt-1">
                <div className="p-2 rounded-full bg-background border border-border group-hover:border-primary/50 transition-colors">
                    {getActivityIcon(activity.type)}
                </div>
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {activity.title}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(activity.timestamp)}
                    </span>
                </div>
                {activity.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                        {activity.description}
                    </p>
                )}
                {activity.metadata && activity.metadata.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                        {activity.metadata.map((meta, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                                {meta}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const PatientActivityFeed = ({
    patientId,
    activities = [],
    loading = false,
    onLoadMore,
    onFilterChange
}) => {
    const [filterType, setFilterType] = useState('all');
    const [filterPeriod, setFilterPeriod] = useState('all');
    const [displayedCount, setDisplayedCount] = useState(10); // Paginação client-side

    // Aplicar filtros nas atividades
    const getFilteredActivities = () => {
        let filtered = [...activities];

        // Filtro por tipo
        if (filterType !== 'all') {
            filtered = filtered.filter(activity => activity.type === filterType);
        }

        // Filtro por período
        if (filterPeriod !== 'all') {
            const now = new Date();
            let cutoffDate;

            switch (filterPeriod) {
                case '7d':
                    cutoffDate = subDays(now, 7);
                    break;
                case '30d':
                    cutoffDate = subDays(now, 30);
                    break;
                case '3m':
                    cutoffDate = subMonths(now, 3);
                    break;
                default:
                    cutoffDate = null;
            }

            if (cutoffDate) {
                filtered = filtered.filter(activity => {
                    const activityDate = new Date(activity.timestamp);
                    return activityDate >= cutoffDate;
                });
            }
        }

        return filtered;
    };

    const filteredActivities = getFilteredActivities();
    const displayedActivities = filteredActivities.slice(0, displayedCount);
    const hasMore = filteredActivities.length > displayedCount;

    // Resetar contador ao mudar filtros
    useEffect(() => {
        setDisplayedCount(10);
    }, [filterType, filterPeriod]);

    // Notificar mudanças de filtro para o componente pai
    useEffect(() => {
        if (onFilterChange) {
            onFilterChange({ type: filterType, period: filterPeriod });
        }
    }, [filterType, filterPeriod, onFilterChange]);

    const handleTypeChange = (value) => {
        setFilterType(value);
    };

    const handlePeriodChange = (value) => {
        setFilterPeriod(value);
    };

    const handleLoadMore = () => {
        setDisplayedCount(prev => prev + 10);
    };

    return (
        <Card className="bg-card shadow-lg border-border">
            <CardHeader>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <CardTitle className="text-xl font-bold text-foreground">
                            Feed de Atividades
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            {filteredActivities.length} {filteredActivities.length === 1 ? 'atividade' : 'atividades'}
                            {filterPeriod !== 'all' && ` nos últimos ${
                                filterPeriod === '7d' ? '7 dias' :
                                filterPeriod === '30d' ? '30 dias' : '3 meses'
                            }`}
                        </p>
                    </div>

                    {/* Filtros */}
                    <div className="flex gap-2 w-full md:w-auto">
                        <Select value={filterType} onValueChange={handleTypeChange}>
                            <SelectTrigger className="flex-1 md:w-[140px] h-9">
                                <Filter className="w-4 h-4 mr-2" />
                                <SelectValue placeholder="Tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                <SelectItem value="meal">Refeições</SelectItem>
                                <SelectItem value="weight">Peso</SelectItem>
                                <SelectItem value="achievement">Conquistas</SelectItem>
                                <SelectItem value="appointment">Consultas</SelectItem>
                                <SelectItem value="message">Mensagens</SelectItem>
                                <SelectItem value="anamnese">Anamnese</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={filterPeriod} onValueChange={handlePeriodChange}>
                            <SelectTrigger className="flex-1 md:w-[120px] h-9">
                                <SelectValue placeholder="Período" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tudo</SelectItem>
                                <SelectItem value="7d">7 dias</SelectItem>
                                <SelectItem value="30d">30 dias</SelectItem>
                                <SelectItem value="3m">3 meses</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>

            <CardContent>
                {loading ? (
                    <div className="flex flex-col justify-center items-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                        <p className="text-sm text-muted-foreground">Carregando atividades...</p>
                    </div>
                ) : displayedActivities.length > 0 ? (
                    <>
                        <div className="space-y-1 divide-y divide-border">
                            {displayedActivities.map((activity) => (
                                <ActivityItem key={activity.id} activity={activity} />
                            ))}
                        </div>

                        {/* Botão Carregar Mais - paginação client-side */}
                        {hasMore && (
                            <div className="mt-6 text-center">
                                <Button
                                    variant="outline"
                                    onClick={handleLoadMore}
                                    className="w-full md:w-auto"
                                >
                                    <ChevronDown className="w-4 h-4 mr-2" />
                                    Carregar Mais ({filteredActivities.length - displayedCount} restantes)
                                </Button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                        <p className="text-muted-foreground font-medium mb-1">
                            Nenhuma atividade encontrada
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {filterType !== 'all' || filterPeriod !== 'all'
                                ? 'Tente ajustar os filtros acima'
                                : 'Este paciente ainda não possui atividades registradas'
                            }
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default PatientActivityFeed;
