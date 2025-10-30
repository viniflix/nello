import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Utensils, Loader2 } from 'lucide-react'; // Importar Loader2

const RecentActivityFeed = () => {
    const [feed, setFeed] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    useEffect(() => {
        const fetchFeed = async () => {
            if (!user) return;
            setLoading(true);

            // Busca as 5 atividades mais recentes
            const { data, error } = await supabase.rpc('get_recent_patient_activity', { nutritionist_id_param: user.id, limit_param: 5 });

            if (error) {
                console.error('Error fetching recent activity:', error);
                setFeed([]);
            } else {
                setFeed(data);
            }
            setLoading(false);
        };

        if (user?.id) { 
            fetchFeed();
            
            // Realtime para atualizar o feed
            const channel = supabase.channel(`recent-activity-feed:${user.id}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'meals',
                    filter: `patient_id=in.(SELECT id FROM user_profiles WHERE nutritionist_id = '${user.id}')`
                }, (payload) => {
                    // Adiciona o novo item no topo e remove o último
                    setFeed(currentFeed => [
                        {
                            meal_id: payload.new.id,
                            patient_name: 'Um paciente', // O RPC seria melhor, mas isso evita outra busca
                            meal_type: payload.new.meal_type,
                            total_calories: payload.new.total_calories,
                            created_at: payload.new.created_at
                        },
                        ...currentFeed
                    ].slice(0, 5));
                    // Ou apenas chame fetchFeed() se a performance não for um problema
                    // fetchFeed(); 
                })
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [user]);

    // Card de Loading (Estilizado)
    if (loading) {
        return (
            <Card className="bg-card shadow-figma-btn rounded-xl">
                <CardHeader>
                    <CardTitle className="font-clash text-lg font-semibold text-primary">Atividade Recente</CardTitle>
                    <CardDescription style={{ color: '#B99470' }}>Carregando...</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }

    return (
        // Card com sombra
        <Card className="bg-card shadow-figma-btn rounded-xl">
            <CardHeader>
                {/* Título com fonte Clash Display e cor #4F6F52 (text-primary) */}
                <CardTitle className="font-clash text-lg font-semibold text-primary">Atividade Recente</CardTitle>
                {/* Descrição com cor #B99470 */}
                <CardDescription style={{ color: '#B99470' }}>Últimas refeições registradas pelos seus pacientes.</CardDescription>
            </CardHeader>
            <CardContent>
                {feed.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">Nenhuma atividade recente.</p>
                ) : (
                    <div className="space-y-4">
                        {feed.map(item => (
                            <div key={item.meal_id} className="flex items-start gap-4">
                                <div className="bg-background-page p-2 rounded-full"> {/* Fundo do ícone na cor da página */}
                                    <Utensils className="h-5 w-5 text-primary" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm">
                                        <span className="font-semibold text-primary">{item.patient_name}</span> registrou o seu <span className="font-semibold">{item.meal_type}</span>.
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