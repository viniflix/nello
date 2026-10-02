import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationsData } from '@/hooks/useNotificationsData';
import { processPatientReminders } from '@/lib/supabase/food-diary-queries';
import { invalidateDomain } from '@/infrastructure/realtime/events';

const processed = new Map();
export function useNotifications() {
  const { user } = useAuth();
  const { unreadCount } = useNotificationsData();
  const userId = user?.id, userType = user?.profile?.user_type;
  useEffect(() => {
    if (!userId || userType !== 'patient' || Date.now() - (processed.get(userId) || 0) < 15 * 60000) return;
    const controller = new AbortController();
    processed.set(userId, Date.now());
    processPatientReminders(userId, { signal: controller.signal }).then(({ error, cancelled }) => {
      if (error || cancelled) processed.delete(userId);
      else if (!controller.signal.aborted) invalidateDomain(userId, 'notifications');
    }).catch(() => { processed.delete(userId); });
    return () => controller.abort();
  }, [userId, userType]);
  return { unreadCount };
}
