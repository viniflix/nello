import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Check, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from './ui/use-toast';
import { useChat } from '@/contexts/ChatContext';

const getMessageSenderId = (notification) => {
  const fromId = notification?.content?.from_id;
  return fromId ? String(fromId) : null;
};

const formatNotificationTime = (createdAt) => {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 24) {
    const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    if (minutes < 60) return `há ${minutes} min atrás`;
    const hours = Math.max(1, Math.floor(diffHours));
    return `há ${hours} hora${hours > 1 ? 's' : ''} atrás`;
  }

  const day = String(created.getDate()).padStart(2, '0');
  const month = String(created.getMonth() + 1).padStart(2, '0');
  const year = String(created.getFullYear()).slice(-2);
  const hour = String(created.getHours()).padStart(2, '0');
  const minute = String(created.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} - às ${hour}:${minute}`;
};

const getNotificationMeta = (notification, userType) => {
  const genericMessage = notification?.content?.message || notification?.message || 'Você recebeu uma atualização.';
  const genericTitle = notification?.title || 'Nova notificação';

  const typedMap = {
    new_meal_plan: { title: 'Novo Plano Alimentar', ctaLabel: 'Ver plano', ctaPath: '/patient/diario' },
    meal_plan_updated: { title: 'Plano Alimentar Atualizado', ctaLabel: 'Ver plano', ctaPath: '/patient/diario' },
    new_prescription: { title: 'Nova Prescrição', ctaLabel: 'Ver metas', ctaPath: '/patient' },
    prescription_updated: { title: 'Metas Atualizadas', ctaLabel: 'Ver metas', ctaPath: '/patient' },
    appointment_scheduled: {
      title: 'Consulta Agendada',
      ctaLabel: userType === 'nutritionist' ? 'Abrir Agenda' : 'Ver consulta',
      ctaPath: userType === 'nutritionist' ? '/nutritionist/agenda' : '/patient'
    },
    appointment_rescheduled: {
      title: 'Consulta Reagendada',
      ctaLabel: userType === 'nutritionist' ? 'Abrir Agenda' : 'Ver consulta',
      ctaPath: userType === 'nutritionist' ? '/nutritionist/agenda' : '/patient'
    },
    appointment_canceled: {
      title: 'Consulta Cancelada',
      ctaLabel: userType === 'nutritionist' ? 'Abrir Agenda' : 'Ver consulta',
      ctaPath: userType === 'nutritionist' ? '/nutritionist/agenda' : '/patient'
    },
    appointment_reminder: {
      title: 'Lembrete de Consulta',
      ctaLabel: userType === 'nutritionist' ? 'Abrir Agenda' : 'Ver consulta',
      ctaPath: userType === 'nutritionist' ? '/nutritionist/agenda' : '/patient'
    },
    goal_achieved: { title: 'Meta Alcançada', ctaLabel: 'Ver progresso', ctaPath: '/patient/progresso' },
    new_achievement: { title: 'Nova Conquista', ctaLabel: 'Ver conquistas', ctaPath: '/patient/profile' },
    new_weekly_summary: { title: 'Resumo Semanal', ctaLabel: 'Ver resumo', ctaPath: '/patient/records' },
    nutritionist_note: {
      title: userType === 'nutritionist' ? 'Nova orientação' : 'Orientação do Nutricionista',
      ctaLabel: 'Abrir chat',
      ctaPath: userType === 'nutritionist' ? '/chat/nutritionist' : '/chat/patient'
    },
    daily_log_reminder: { title: 'Lembrete Diário', ctaLabel: 'Registrar refeição', ctaPath: '/patient/add-food' },
    measurement_reminder: { title: 'Atualizar Medidas', ctaLabel: 'Abrir perfil', ctaPath: '/patient/profile' },
    success: { title: genericTitle || 'Sucesso', ctaLabel: 'Ver detalhes', ctaPath: notification?.link_url || '/patient' },
    info: { title: genericTitle || 'Informação', ctaLabel: 'Ver detalhes', ctaPath: notification?.link_url || '/patient' },
    warning: { title: genericTitle || 'Atenção', ctaLabel: 'Ver detalhes', ctaPath: notification?.link_url || '/patient' },
    error: { title: genericTitle || 'Alerta', ctaLabel: 'Ver detalhes', ctaPath: notification?.link_url || '/patient' }
  };

  if (notification.type === 'new_message') {
    const senderId = getMessageSenderId(notification);
    return {
      title: 'Nova mensagem',
      description: genericMessage,
      ctaLabel: 'Abrir conversa',
      ctaPath: userType === 'nutritionist'
        ? (senderId ? `/chat/nutritionist/${senderId}` : '/chat/nutritionist')
        : '/chat/patient',
      senderId,
      isMessage: true
    };
  }

  const base = typedMap[notification.type] || {
    title: genericTitle,
    ctaLabel: 'Ver detalhes',
    ctaPath: notification?.link_url || (userType === 'nutritionist' ? '/nutritionist' : '/patient')
  };

  return {
    ...base,
    description: genericMessage
  };
};

const NotificationsPanel = ({ isOpen, setIsOpen }) => {
  const { user } = useAuth();
  const { markChatAsRead } = useChat();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [senderProfiles, setSenderProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const userType = user?.profile?.user_type;

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
      setLoading(false);
      return;
    }

    const items = data || [];
    setNotifications(items);

    const senderIds = Array.from(new Set(items.map(getMessageSenderId).filter(Boolean)));
    if (senderIds.length) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, name, avatar_url')
        .in('id', senderIds);

      const profileMap = (profiles || []).reduce((acc, profile) => {
        acc[String(profile.id)] = profile;
        return acc;
      }, {});
      setSenderProfiles(profileMap);
    } else {
      setSenderProfiles({});
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen, fetchNotifications]);

  useEffect(() => {
    if (!user) return undefined;
    const channel = supabase.channel(`notifications:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  const handleMarkAsRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const deleteNotification = async (id) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleAction = async (notification) => {
    const meta = getNotificationMeta(notification, userType);

    if (meta.isMessage) {
      if (meta.senderId) await markChatAsRead(meta.senderId);
      await deleteNotification(notification.id);
    } else if (!notification.is_read) {
      await handleMarkAsRead(notification.id);
    }

    setIsOpen(false);
    navigate(meta.ctaPath);
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    const { error } = await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível marcar as notificações como lidas.', variant: 'destructive' });
      return;
    }
    fetchNotifications();
  };

  const handleClearRead = async () => {
    const readIds = notifications.filter((n) => n.is_read).map((n) => n.id);
    if (!readIds.length) return;
    const { error } = await supabase.from('notifications').delete().in('id', readIds);
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível limpar as notificações.', variant: 'destructive' });
      return;
    }
    fetchNotifications();
  };

  const hasUnread = notifications.some((n) => !n.is_read);
  const hasRead = notifications.some((n) => n.is_read);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-lg">
        <CardHeader>
          <CardTitle>Notificações</CardTitle>
          {(hasUnread || hasRead) && (
            <div className="mt-3 flex gap-2">
              {hasUnread && (
                <Button variant="outline" size="sm" onClick={handleMarkAllAsRead} className="flex-1">
                  <Check className="mr-2 h-4 w-4" /> Marcar Todas
                </Button>
              )}
              {hasRead && (
                <Button variant="outline" size="sm" onClick={handleClearRead} className="flex-1">
                  <Trash2 className="mr-2 h-4 w-4" /> Limpar Lidas
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="max-h-[60vh] space-y-3 overflow-y-auto">
          {loading ? (
            <p>Carregando...</p>
          ) : notifications.length > 0 ? (
            notifications.map((notification) => {
              const meta = getNotificationMeta(notification, userType);
              const sender = meta.senderId ? senderProfiles[meta.senderId] : null;
              const senderInitials = (sender?.name || 'P').substring(0, 2).toUpperCase();

              return (
                <Card
                  key={notification.id}
                  className={`transition-all ${notification.is_read ? 'opacity-70' : 'bg-primary/5'} cursor-pointer`}
                  onClick={() => handleAction(notification)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      {meta.isMessage ? (
                        sender?.avatar_url ? (
                          <img src={sender.avatar_url} alt={sender?.name || 'Remetente'} className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                            {senderInitials}
                          </div>
                        )
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Bell className="h-5 w-5" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold">
                            {meta.isMessage ? sender?.name || meta.title : meta.title}
                          </p>
                          <p className="shrink-0 text-[11px] text-muted-foreground">
                            {formatNotificationTime(notification.created_at)}
                          </p>
                        </div>
                        {meta.isMessage && (
                          <p className="text-[11px] font-medium text-primary/80">Nova mensagem</p>
                        )}
                        <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                          {meta.description}
                        </p>
                        <div className="mt-2 flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleAction(notification);
                            }}
                          >
                            {meta.ctaLabel}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <p className="py-8 text-center text-muted-foreground">Nenhuma notificação encontrada.</p>
          )}
        </CardContent>
      </DialogContent>
    </Dialog>
  );
};

export default NotificationsPanel;
