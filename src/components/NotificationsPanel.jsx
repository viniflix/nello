
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Check, Trash2, Award, FileText, Calendar, CalendarClock, CalendarX, Target, Scale, StickyNote, TrendingUp, Utensils } from 'lucide-react';
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
        let icon = <Bell className="w-5 h-5 text-primary" />;
        let details = { title: 'Nova Notificação', description: 'Você tem uma nova atualização.' };

        switch (type) {
            // ===== PLANO ALIMENTAR =====
            case 'new_meal_plan':
                icon = <Utensils className="w-5 h-5 text-green-600" />;
                details = {
                    title: 'Novo Plano Alimentar',
                    description: 'Seu nutricionista criou um novo plano alimentar para você!',
                    action: () => navigate('/patient/diary'),
                };
                break;
            case 'meal_plan_updated':
                icon = <FileText className="w-5 h-5 text-blue-600" />;
                details = {
                    title: 'Plano Alimentar Atualizado',
                    description: content?.message || 'Seu plano alimentar foi atualizado.',
                    action: () => navigate('/patient/diary'),
                };
                break;

            // ===== PRESCRIÇÃO DE MACROS =====
            case 'new_prescription':
                icon = <Target className="w-5 h-5 text-indigo-600" />;
                details = {
                    title: 'Nova Prescrição de Macros',
                    description: 'Você tem novas metas diárias de nutrientes!',
                    action: () => navigate('/patient'),
                };
                break;
            case 'prescription_updated':
                icon = <TrendingUp className="w-5 h-5 text-purple-600" />;
                details = {
                    title: 'Metas Atualizadas',
                    description: content?.message || 'Suas metas diárias foram ajustadas.',
                    action: () => navigate('/patient'),
                };
                break;

            // ===== CONSULTAS =====
            case 'appointment_scheduled':
                icon = <Calendar className="w-5 h-5 text-primary" />;
                details = {
                    title: 'Nova Consulta Agendada',
                    description: content?.message || 'Uma nova consulta foi agendada para você.',
                    action: () => navigate('/patient'),
                };
                break;
            case 'appointment_rescheduled':
                icon = <CalendarClock className="w-5 h-5 text-orange-600" />;
                details = {
                    title: 'Consulta Reagendada',
                    description: content?.message || 'Sua consulta foi remarcada.',
                    action: () => navigate('/patient'),
                };
                break;
            case 'appointment_canceled':
                icon = <CalendarX className="w-5 h-5 text-red-600" />;
                details = {
                    title: 'Consulta Cancelada',
                    description: content?.message || 'Sua consulta foi cancelada.',
                    action: () => navigate('/patient'),
                };
                break;
            case 'appointment_reminder':
                icon = <Bell className="w-5 h-5 text-primary" />;
                const time = new Date(content.appointment_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                details = {
                    title: 'Lembrete de Consulta',
                    description: `Sua consulta está agendada para ${time}.`,
                    action: () => user?.profile?.user_type === 'nutritionist' ? navigate('/nutritionist/agenda') : navigate('/patient'),
                };
                break;

            // ===== METAS E CONQUISTAS =====
            case 'goal_achieved':
                icon = <Award className="w-5 h-5 text-green-600" />;
                details = {
                    title: 'Meta Alcançada! 🎉',
                    description: content?.message || 'Parabéns! Você atingiu uma meta!',
                    action: () => navigate('/patient'),
                };
                break;
            case 'new_achievement':
                icon = <Award className="w-5 h-5 text-yellow-500" />;
                details = {
                    title: `Conquista: ${content?.name || 'Nova conquista'}`,
                    description: content?.description || 'Você desbloqueou uma nova conquista!',
                    action: () => navigate('/patient/profile', { state: { tab: 'achievements' } }),
                };
                break;

            // ===== RESUMOS E ORIENTAÇÕES =====
            case 'new_weekly_summary':
                icon = <FileText className="w-5 h-5 text-primary" />;
                details = {
                    title: 'Novo Resumo Semanal',
                    description: 'Seu nutricionista adicionou observações sobre seu progresso.',
                    action: () => navigate('/patient/records'),
                };
                break;
            case 'nutritionist_note':
                icon = <StickyNote className="w-5 h-5 text-amber-600" />;
                details = {
                    title: 'Orientação do Nutricionista',
                    description: content?.message || 'Você tem uma nova orientação.',
                    action: () => navigate('/chat/patient'),
                };
                break;

            // ===== LEMBRETES =====
            case 'daily_log_reminder':
                icon = <Utensils className="w-5 h-5 text-muted-foreground" />;
                details = {
                    title: 'Lembrete Diário',
                    description: 'Não se esqueça de registrar suas refeições hoje!',
                    action: () => navigate('/patient/add-food'),
                };
                break;
            case 'measurement_reminder':
                icon = <Scale className="w-5 h-5 text-muted-foreground" />;
                details = {
                    title: 'Hora de Atualizar Medidas',
                    description: 'Registre seu peso e medidas atuais.',
                    action: () => navigate('/patient/profile'),
                };
                break;

            // ===== MENSAGENS =====
            case 'new_message':
                icon = <Bell className="w-5 h-5 text-primary" />;
                details = {
                    title: 'Nova Mensagem no Chat',
                    description: content?.message || 'Você tem uma nova mensagem.',
                    action: () => {
                        const fromId = content?.from_id;
                        if (user?.profile?.user_type === 'nutritionist') {
                            navigate(`/chat/nutritionist/${fromId}`);
                        } else {
                            navigate('/chat/patient');
                        }
                        if (fromId) markChatAsRead(fromId);
                    },
                };
                break;

            default:
                break;
        }
        return { ...details, icon };
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
                        {details.icon}
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

    const handleMarkAllAsRead = async () => {
        const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
        if (unreadIds.length === 0) return;

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .in('id', unreadIds);

        if (error) {
            toast({ title: "Erro", description: "Não foi possível marcar as notificações como lidas.", variant: "destructive" });
        } else {
            toast({ title: "Sucesso", description: `${unreadIds.length} notificação(ões) marcada(s) como lida(s).` });
            fetchNotifications();
        }
    };

    const handleClearRead = async () => {
        const readIds = notifications.filter(n => n.is_read).map(n => n.id);
        if (readIds.length === 0) return;

        const { error } = await supabase.from('notifications').delete().in('id', readIds);
        if (error) {
            toast({ title: "Erro", description: "Não foi possível limpar as notificações.", variant: "destructive" });
        } else {
            toast({ title: "Sucesso", description: `${readIds.length} notificação(ões) apagada(s).` });
            fetchNotifications();
        }
    };

    const hasUnread = notifications.some(n => !n.is_read);
    const hasRead = notifications.some(n => n.is_read);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="max-w-md">
                <CardHeader>
                    <CardTitle>Notificações</CardTitle>
                    {(hasUnread || hasRead) && (
                        <div className="flex gap-2 mt-3">
                            {hasUnread && (
                                <Button variant="outline" size="sm" onClick={handleMarkAllAsRead} className="flex-1">
                                    <Check className="w-4 h-4 mr-2" /> Marcar Todas
                                </Button>
                            )}
                            {hasRead && (
                                <Button variant="outline" size="sm" onClick={handleClearRead} className="flex-1">
                                    <Trash2 className="w-4 h-4 mr-2" /> Limpar Lidas
                                </Button>
                            )}
                        </div>
                    )}
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
