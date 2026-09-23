import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';

export default function TopPatientsWidget({ nutritionistId, refreshKey = 0 }) {
    const [topPatients, setTopPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);

    useEffect(() => {
        if (nutritionistId) {
            loadTopPatients();
        }
    }, [nutritionistId, refreshKey]);

    const loadTopPatients = async () => {
        if (!nutritionistId) return;
        setLoading(true);
        setLoadFailed(false);
        try {
            const { data, error } = await supabase.rpc('get_top_financial_patients', { p_limit: 3 });
            if (error) throw error;
            setTopPatients((data || []).map(row => ({
                patient: { id: row.patient_id, name: row.patient_name, avatar_url: row.avatar_url },
                total: Number(row.total) || 0,
            })));
        } catch (error) {
            console.warn('Top patients query failed', { code: error?.code || 'unknown' });
            setTopPatients([]);
            setLoadFailed(true);
        } finally {
            setLoading(false);
        }
    };

    const getInitials = (name) => {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    const getRankConfig = (rank) => {
        if (rank === 0) {
            return { 
                icon: Trophy, 
                color: 'text-yellow-600', 
                bgColor: 'bg-yellow-50 dark:bg-yellow-950',
                borderColor: 'border-yellow-300 dark:border-yellow-700',
                label: '1º'
            };
        }
        if (rank === 1) {
            return { 
                icon: Medal, 
                color: 'text-gray-400', 
                bgColor: 'bg-gray-50 dark:bg-gray-950',
                borderColor: 'border-gray-300 dark:border-gray-700',
                label: '2º'
            };
        }
        if (rank === 2) {
            return { 
                icon: Award, 
                color: 'text-amber-700', 
                bgColor: 'bg-amber-50 dark:bg-amber-950',
                borderColor: 'border-amber-300 dark:border-amber-700',
                label: '3º'
            };
        }
        return { 
            icon: Trophy, 
            color: 'text-muted-foreground', 
            bgColor: 'bg-muted',
            borderColor: 'border-border',
            label: `${rank + 1}º`
        };
    };

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Trophy className="w-5 h-5" />
                        Top Pacientes
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-4 text-muted-foreground">
                        Carregando...
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (loadFailed || topPatients.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Trophy className="w-5 h-5" />
                        Top Pacientes
                    </CardTitle>
                    <CardDescription>
                        Maiores contribuidores (LTV)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-4 text-muted-foreground">
                        {loadFailed ? 'Não foi possível carregar o ranking.' : 'Nenhum dado disponível'}
                    </div>
                    {loadFailed && <Button variant="outline" className="w-full" onClick={loadTopPatients}>Tentar novamente</Button>}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-600" />
                    Top 3 Pacientes
                </CardTitle>
                <CardDescription>
                    Maiores contribuidores (LTV)
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {topPatients.map((item, index) => {
                        const rankConfig = getRankConfig(index);
                        const RankIcon = rankConfig.icon;
                        return (
                        <div
                            key={item.patient?.id || index}
                            className={`flex items-center gap-3 p-3 rounded-lg border-2 ${rankConfig.bgColor} ${rankConfig.borderColor} hover:shadow-md transition-all`}
                        >
                            <div className={`flex-shrink-0 w-10 h-10 rounded-full ${rankConfig.bgColor} ${rankConfig.borderColor} border-2 flex items-center justify-center`}>
                                <RankIcon className={`w-5 h-5 ${rankConfig.color}`} />
                            </div>
                            <Avatar className="h-10 w-10 flex-shrink-0">
                                <AvatarImage src={item.patient?.avatar_url} alt={item.patient?.name} />
                                <AvatarFallback>
                                    {getInitials(item.patient?.name)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-xs font-bold ${rankConfig.color}`}>
                                        {rankConfig.label}
                                    </span>
                                    <p className="font-semibold text-sm truncate">
                                        {item.patient?.name || 'Paciente não identificado'}
                                    </p>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Total investido
                                </p>
                            </div>
                            <div className="flex-shrink-0 text-right">
                                <p className={`font-bold text-lg ${rankConfig.color}`}>
                                    {formatCurrency(item.total)}
                                </p>
                            </div>
                        </div>
                    )})}
                </div>
            </CardContent>
        </Card>
    );
}
