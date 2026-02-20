import { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { processPatientReminders } from '@/lib/supabase/food-diary-queries';

const REMINDER_PROCESS_TTL_MS = 15 * 60 * 1000;

/**
 * Hook para gerenciar notificações do paciente
 * Retorna contagem de não lidas e função para abrir painel
 */
export function useNotifications() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUnread = async () => {
      if (!user) return;
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      setUnreadCount(count || 0);
    };

    const maybeProcessReminders = async () => {
      if (!user || user?.profile?.user_type !== 'patient') return;
      const cacheKey = `reminder-process:${user.id}`;
      const lastRunAt = Number(window.localStorage.getItem(cacheKey) || 0);
      const now = Date.now();
      if (Number.isFinite(lastRunAt) && now - lastRunAt < REMINDER_PROCESS_TTL_MS) return;

      const { error } = await processPatientReminders(user.id);
      if (!error) {
        window.localStorage.setItem(cacheKey, String(now));
      }
    };

    maybeProcessReminders();
    fetchUnread();

    // Realtime subscription
    const channel = supabase
      .channel(`notifications-count-hook:${user?.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user?.id}`
      }, () => {
        fetchUnread();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { unreadCount };
}
