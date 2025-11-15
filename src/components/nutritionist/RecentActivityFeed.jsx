import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { getComprehensiveActivityFeed } from '@/lib/supabase/patient-queries';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    Utensils,
    Weight,
    FileText,
    BookOpen,
    Clipboard,
    Calendar,
    MessageSquare,
    Trophy,
    Loader2,
    ChevronDown,
    User
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ActivityIcon = ({ type }) => {
    const iconClass = "h-5 w-5";

    switch (type) {
        case 'meal':
            return <Utensils className={`${iconClass} text-secondary`} />;
        case 'anthropometry':
            return <Weight className={`${iconClass} text-primary`} />;
        case 'anamnesis':
            return <FileText className={`${iconClass} text-primary`} />;
        case 'meal_plan':
            return <BookOpen className={`${iconClass} text-primary`} />;
        case 'prescription':
            return <Clipboard className={`${iconClass} text-primary`} />;
        case 'appointment':
            return <Calendar className={`${iconClass} text-secondary`} />;
        case 'message':
            return <MessageSquare className={`${iconClass} text-neutral-600`} />;
        case 'achievement':
            return <Trophy className={`${iconClass} text-secondary`} />;
        default:
            return <User className={`${iconClass} text-muted-foreground`} />;
    }
};

const RecentActivityFeed = ({ limit = 10, showHeader = true }) => {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [displayCount, setDisplayCount] = useState(limit);
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchActivities = async () => {
            if (!user?.id) return;

            setLoading(true);
            const { data, error } = await getComprehensiveActivityFeed(user.id, 50);

            if (error) {
                console.error('Erro ao buscar atividades:', error);
                setActivities([]);
            } else {
                setActivities(data || []);
            }
            setLoading(false);
        };

        fetchActivities();
    }, [user]);

    const handleLoadMore = () => {
        setDisplayCount(prev => prev + 10);
    };

    const handleActivityClick = (activity) => {
        // Navegar para a página do paciente
        if (activity.patient_id) {
            navigate(`/nutritionist/patients/${activity.patient_id}`);
        }
    };

    const displayedActivities = activities.slice(0, displayCount);
    const hasMore = activities.length > displayCount;

    if (loading) {
        return (
            <Card className="bg-card shadow-card-dark rounded-xl">
                <CardHeader>
                    <CardTitle className="font-heading uppercase text-sm font-medium tracking-wide text-primary">
                        Feed de Atividades
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">Carregando...</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-card shadow-card-dark rounded-xl">
            {showHeader && (
                <CardHeader>
                    <CardTitle className="font-heading uppercase text-sm font-medium tracking-wide text-primary">
                        Feed de Atividades
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Acompanhe tudo que acontece com seus pacientes
                    </CardDescription>
                </CardHeader>
            )}
            <CardContent className={showHeader ? '' : 'pt-6'}>
                {displayedActivities.length === 0 ? (
                    <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                        <p className="text-muted-foreground font-medium mb-1">
                            Nenhuma atividade recente
                        </p>
                        <p className="text-sm text-muted-foreground">
                            As atividades dos seus pacientes aparecerão aqui
                        </p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {displayedActivities.map(activity => (
                            <div
                                key={activity.id}
                                onClick={() => handleActivityClick(activity)}
                                className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                            >
                                {/* Ícone */}
                                <div className="flex-shrink-0 mt-0.5">
                                    <div className="p-2 rounded-full bg-background border border-border group-hover:border-primary/50 transition-colors">
                                        <ActivityIcon type={activity.type} />
                                    </div>
                                </div>

                                {/* Conteúdo */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                                                <span className="font-semibold text-primary">
                                                    {activity.patient_name}
                                                </span>
                                                {' '}
                                                <span className="text-muted-foreground font-normal">
                                                    {activity.title.toLowerCase().replace(activity.title[0], activity.title[0].toLowerCase())}
                                                </span>
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {activity.description}
                                            </p>
                                        </div>
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                            {formatDistanceToNow(new Date(activity.timestamp), {
                                                addSuffix: true,
                                                locale: ptBR
                                            })}
                                        </span>
                                    </div>

                                    {/* Badge com tipo de atividade */}
                                    <div className="mt-2">
                                        <Badge variant="outline" className="text-xs">
                                            {getActivityTypeName(activity.type)}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Botão Carregar Mais */}
                        {hasMore && (
                            <div className="pt-4">
                                <Button
                                    variant="outline"
                                    onClick={handleLoadMore}
                                    className="w-full"
                                    size="sm"
                                >
                                    <ChevronDown className="w-4 h-4 mr-2" />
                                    Carregar Mais ({activities.length - displayCount} restantes)
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

// Helper para nomes de tipos de atividade
const getActivityTypeName = (type) => {
    const names = {
        meal: 'Refeição',
        anthropometry: 'Peso',
        anamnesis: 'Anamnese',
        meal_plan: 'Plano Alimentar',
        prescription: 'Prescrição',
        appointment: 'Consulta',
        message: 'Mensagem',
        achievement: 'Conquista'
    };
    return names[type] || 'Atividade';
};

export default RecentActivityFeed;
