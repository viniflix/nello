
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Utensils } from 'lucide-react';

const RecentActivityFeed = () => {
    const [feed, setFeed] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    useEffect(() => {
        const fetchFeed = async () => {
            if (!user) return;
            setLoading(true);

            const { data, error } = await supabase.rpc('get_recent_patient_activity', { nutritionist_id_param: user.id, limit_param: 5 });

            if (error) {
                console.error('Error fetching recent activity:', error);
                setFeed([]);
            } else {
                setFeed(data);
            }
            setLoading(false);
        };

        fetchFeed();
        
        const channel = supabase.channel(`recent-activity-feed:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'meals',
            }, (payload) => {
                fetchFeed();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    if (loading) {
        return <Card className="glass-card"><CardHeader><CardTitle>Atividade Recente</CardTitle></CardHeader><CardContent>Carregando...</CardContent></Card>;
    }

    return (
        <Card className="glass-card">
            <CardHeader>
                <CardTitle>Atividade Recente</CardTitle>
                <CardDescription>Últimas refeições registadas pelos seus pacientes.</CardDescription>
            </CardHeader>
            <CardContent>
                {feed.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">Nenhuma atividade recente.</p>
                ) : (
                    <div className="space-y-4">
                        {feed.map(item => (
                            <div key={item.meal_id} className="flex items-start gap-4">
                                <div className="bg-muted p-2 rounded-full">
                                    <Utensils className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm">
                                        <span className="font-semibold text-primary">{item.patient_name}</span> registou o seu <span className="font-semibold">{item.meal_type}</span>.
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        ({Math.round(item.total_calories)} kcal) • {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default RecentActivityFeed;
