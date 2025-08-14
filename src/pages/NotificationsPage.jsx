
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useChat } from '@/contexts/ChatContext';


const NotificationCard = ({ notification, onMarkAsRead, user }) => {
    const navigate = useNavigate();
    const { markChatAsRead } = useChat();

    const getNotificationDetails = (notification) => {
        const { type, content } = notification;
        switch (type) {
            case 'new_weekly_summary':
                return {
                    title: 'Novo Resumo Semanal',
                    description: 'Seu nutricionista adicionou observações sobre seu progresso.',
                    action: () => navigate('/patient/records'),
                };
            case 'appointment_reminder':
                const time = new Date(content.appointment_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                return {
                    title: 'Lembrete de Consulta',
                    description: `Sua consulta está agendada para ${time}.`,
                    action: () => user?.profile?.user_type === 'nutritionist' ? navigate('/nutritionist/agenda') : null,
                };
            case 'new_message':
                return {
                    title: 'Nova Mensagem no Chat',
                    description: content.message || 'Você tem uma nova mensagem.',
                    action: () => {
                        const fromId = content.from_id;
                        if (user?.profile?.user_type === 'nutritionist') {
                            navigate(`/chat/nutritionist/${fromId}`)
                        } else {
                            navigate('/chat/patient');
                        }
                        markChatAsRead(fromId);
                    },
                };
            case 'daily_log_reminder':
                 return {
                    title: 'Lembrete Diário',
                    description: 'Não se esqueça de registrar suas refeições hoje!',
                    action: () => navigate('/patient/add-food'),
                };
            default:
                return { title: 'Nova Notificação', description: 'Você tem uma nova atualização.' };
        }
    };

    const details = getNotificationDetails(notification);
    
    const handleClick = () => {
        if(details.action) details.action();
        if(!notification.is_read) onMarkAsRead(notification.id);
    }

    return (
        <Card className={`transition-all ${notification.is_read ? 'opacity-60' : 'bg-primary/5'}`}>
            <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-grow cursor-pointer" onClick={handleClick}>
                     <div className="p-2 bg-primary/10 rounded-full">
                        <Bell className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-grow">
                        <p className="font-semibold">{details.title}</p>
                        <p className="text-sm text-muted-foreground">{details.description}</p>
                        <p className="text-xs text-muted-foreground/80 mt-1">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                    </div>
                </div>
                {!notification.is_read && (
                    <Button variant="ghost" size="icon" onClick={() => onMarkAsRead(notification.id)}>
                        <Check className="w-5 h-5 text-primary" />
                    </Button>
                )}
            </CardContent>
        </Card>
    );
};


const NotificationsPage = () => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
        } else {
            setNotifications(data);
        }
        setLoading(false);
    }, [user]);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);
    
    useEffect(() => {
        if (!user) return;
        const channel = supabase.channel(`notifications:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, () => {
                fetchNotifications();
            })
            .subscribe();
        
        return () => {
            supabase.removeChannel(channel);
        }
    }, [user, fetchNotifications]);


    const handleMarkAsRead = async (id) => {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    };

    const handleMarkAllAsRead = async () => {
        await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    };

    return (
        <div className="pb-24 p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-6"
            >
                <Card className="glass-card">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle>Notificações</CardTitle>
                             {notifications.some(n => !n.is_read) && (
                                <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
                                    Marcar todas como lidas
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {loading ? (
                            <p>Carregando...</p>
                        ) : notifications.length > 0 ? (
                            notifications.map(n => (
                                <NotificationCard key={n.id} notification={n} onMarkAsRead={handleMarkAsRead} user={user} />
                            ))
                        ) : (
                            <p className="text-center text-muted-foreground py-8">Nenhuma notificação encontrada.</p>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default NotificationsPage;
