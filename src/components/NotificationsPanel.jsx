
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Check, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from './ui/use-toast';
import { useChat } from '@/contexts/ChatContext';

const NotificationCard = ({ notification, onMarkAsRead, user, closePanel }) => {
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
                            navigate(`/chat/nutritionist/${fromId}`);
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
        closePanel();
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


const NotificationsPanel = ({ isOpen, setIsOpen }) => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

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
        if(isOpen) {
            fetchNotifications();
        }
    }, [isOpen, fetchNotifications]);
    
    useEffect(() => {
        if (!user) return;
        const channel = supabase.channel(`notifications:${user.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}`}, () => {
                fetchNotifications();
            })
            .subscribe();
        
        return () => { supabase.removeChannel(channel); }
    }, [user, fetchNotifications]);


    const handleMarkAsRead = async (id) => {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    };

    const handleClearRead = async () => {
        const readIds = notifications.filter(n => n.is_read).map(n => n.id);
        if (readIds.length === 0) return;

        const { error } = await supabase.from('notifications').delete().in('id', readIds);
        if (error) {
            toast({ title: "Erro", description: "Não foi possível limpar as notificações.", variant: "destructive" });
        } else {
            toast({ title: "Sucesso", description: "Notificações lidas foram limpas." });
            fetchNotifications();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="max-w-md">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Notificações</CardTitle>
                         {notifications.some(n => n.is_read) && (
                            <Button variant="outline" size="sm" onClick={handleClearRead}>
                                <Trash2 className="w-4 h-4 mr-2" /> Limpar Lidas
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
                    {loading ? (
                        <p>Carregando...</p>
                    ) : notifications.length > 0 ? (
                        notifications.map(n => (
                            <NotificationCard key={n.id} notification={n} onMarkAsRead={handleMarkAsRead} user={user} closePanel={() => setIsOpen(false)}/>
                        ))
                    ) : (
                        <p className="text-center text-muted-foreground py-8">Nenhuma notificação encontrada.</p>
                    )}
                </CardContent>
            </DialogContent>
        </Dialog>
    );
};

export default NotificationsPanel;
