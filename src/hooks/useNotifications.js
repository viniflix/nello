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
  const userId = user?.id;
  const userType = user?.profile?.user_type;
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const fetchUnread = async () => {
      if (!userId) return;
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
        .abortSignal(controller.signal);
      if (!controller.signal.aborted) setUnreadCount(count || 0);
    };

    const maybeProcessReminders = async () => {
      if (!userId || userType !== 'patient') return;
      const cacheKey = `reminder-process:${userId}`;
      const lastRunAt = Number(window.localStorage.getItem(cacheKey) || 0);
      const now = Date.now();
      if (Number.isFinite(lastRunAt) && now - lastRunAt < REMINDER_PROCESS_TTL_MS) return;

      const { error, cancelled } = await processPatientReminders(userId, { signal: controller.signal });
      if (!error && !cancelled && !controller.signal.aborted) {
        window.localStorage.setItem(cacheKey, String(now));
      }
    };

    maybeProcessReminders();
    fetchUnread();

    // Realtime subscription
    const channel = supabase
      .channel(`notifications-count-hook:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, () => {
        fetchUnread();
      })
      .subscribe();

    return () => {
      controller.abort();
      supabase.removeChannel(channel);
    };
  }, [userId, userType]);

  return { unreadCount };
}
