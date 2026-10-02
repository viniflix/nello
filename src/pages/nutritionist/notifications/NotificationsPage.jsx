import { useNotificationsData } from '@/hooks/useNotificationsData';
import { markOwnNotificationsRead, markAllNotificationsRead } from '@/lib/supabase/notification-mutations';

import React, {useState} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Check, Award, ClipboardCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useChat } from '@/contexts/ChatContext';
import { safeInternalPath } from '@/lib/utils/navigation';


const NotificationCard = ({ notification, onMarkAsRead, user }) => {
    const navigate = useNavigate();
    const { markChatAsRead } = useChat();

    const getNotificationDetails = (notification) => {
        const { type, content } = notification;
        let icon = <Bell className="w-5 h-5 text-primary" />;
        let details = { title: 'Nova Notificação', description: 'Você tem uma nova atualização.' };

        switch (type) {
            case 'new_weekly_summary':
                {
                const patientId = content?.patient_id || content?.patientId;
                details = {
                    title: 'Novo Resumo Semanal',
                    description: 'Seu nutricionista adicionou observações sobre seu progresso.',
                    action: () => user?.profile?.user_type === 'nutritionist'
                        ? navigate(patientId ? `/nutritionist/patients/${patientId}/hub` : '/nutritionist/patients')
                        : navigate('/patient/progresso'),
                };
                break;
                }
            case 'appointment_reminder':
                const time = new Date(content.appointment_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                details = {
                    title: 'Lembrete de Consulta',
                    description: `Sua consulta está agendada para ${time}.`,
                    action: () => user?.profile?.user_type === 'nutritionist' ? navigate('/nutritionist/agenda') : null,
                };
                break;
            case 'new_message':
                details = {
                    title: 'Nova Mensagem no Chat',
                    description: content.message || 'Você tem uma nova mensagem.',
                    action: () => {
                        const fromId = content.from_id;
                        if (user?.profile?.user_type === 'nutritionist') {
                            navigate(fromId ? `/nutritionist/chat/${fromId}` : '/nutritionist/chat');
                        } else {
                            navigate('/patient/chat');
                        }
                        markChatAsRead(fromId);
                    },
                };
                break;
            case 'daily_log_reminder':
                 details = {
                    title: 'Lembrete Diário',
                    description: 'Não se esqueça de registrar suas refeições hoje!',
                    action: () => navigate('/patient/add-food'),
                };
                break;
            case 'new_achievement':
                {
                const patientId = content?.patient_id || content?.patientId;
                icon = <Award className="w-5 h-5 text-yellow-500" />;
                details = {
                    title: `Conquista: ${content?.name || 'Novo marco'}`,
                    description: content?.description || 'Uma nova conquista foi registrada.',
                    action: () => user?.profile?.user_type === 'nutritionist'
                        ? navigate(patientId ? `/nutritionist/patients/${patientId}/achievements` : '/nutritionist/patients')
                        : navigate('/patient/conquistas'),
                };
                break;
                }
            case 'anamnesis_completed':
                {
                const destination = safeInternalPath(notification.link_url, null);
                icon = <ClipboardCheck className="w-5 h-5 text-green-600" />;
                details = {
                    title: notification.title || 'Anamnese Respondida',
                    description: notification.message || 'Um paciente respondeu um questionário via link externo.',
                    action: () => destination ? navigate(destination) : null,
                };
                break;
                }
            default:
                break;
        }
        return { ...details, icon };
    };

    const details = getNotificationDetails(notification);

    const handleClick = () => {
        if(details.action) details.action();
        if(!notification.is_read) onMarkAsRead(notification.id);
    }

    return (
        <Card className={`transition-all ${notification.is_read ? 'bg-muted/30' : 'bg-primary/5'}`}>
            <CardContent className="p-4 flex items-center justify-between gap-4">
                <button type="button" className="flex min-w-0 text-left items-center gap-4 flex-grow" onClick={handleClick}>
                     <div className="p-2 bg-primary/10 rounded-full">
                        {details.icon}
                    </div>
                    <div className="flex-grow">
                        <p className="font-semibold">{details.title}</p>
                        <p className="text-sm text-muted-foreground">{details.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                    </div>
                </button>
                {!notification.is_read && (
                    <Button variant="ghost" size="icon" aria-label="Marcar notificação como lida" onClick={() => onMarkAsRead(notification.id)}>
                        <Check className="w-5 h-5 text-primary" />
                    </Button>
                )}
            </CardContent>
        </Card>
    );
};


const NotificationsPage = () => {
    const { user } = useAuth();
    const [mutationError, setMutationError] = useState(false);
    const { notifications, loading, error: notificationsError } = useNotificationsData();

  const handleMarkAsRead = async (id) => {
        const { error } = await markOwnNotificationsRead(user?.id, [id]);
        if (error) { setMutationError(true); return false; }
        setMutationError(false);

    };

    const handleMarkAllAsRead = async () => {
        const { error } = await markAllNotificationsRead(user?.id);
        if (error) { setMutationError(true); return; }
        setMutationError(false);

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
                        <div className="flex flex-wrap gap-3 justify-between items-center">
                            <CardTitle>Notificações</CardTitle>
                             {notifications.some(n => !n.is_read) && (
                                <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
                                    Marcar todas como lidas
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {mutationError && <p role="alert" className="text-sm text-destructive">Não foi possível marcar a notificação como lida. Confira a conexão e tente novamente.</p>}
                        {notificationsError ? (<p role="alert" className="text-sm text-destructive">Falha ao atualizar. Tente novamente.</p>) : loading ? (
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
