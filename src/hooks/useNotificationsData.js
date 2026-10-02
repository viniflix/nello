import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { subscribeDomain } from '@/infrastructure/realtime/events';

export function useNotificationsData() {
  const { user } = useAuth();
  const result = useQuery({
    queryKey: ['notifications', user?.id], enabled: Boolean(user?.id), staleTime: 30000,
    queryFn: async ({ signal }) => {
      const [list, count] = await Promise.all([
        supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200).abortSignal(signal),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false).abortSignal(signal),
      ]);
      if (list.error || count.error) throw list.error || count.error;
      const senderIds = [...new Set((list.data || []).map(n => n.content?.from_id).filter(Boolean))];
      let profiles = [];
      if (senderIds.length) {
        const response = await supabase.from('user_profiles').select('id,name,avatar_url').in('id', senderIds).abortSignal(signal);
        if (!response.error) profiles = response.data || [];
      }
      return { notifications: list.data || [], unreadCount: count.count || 0, senderProfiles: Object.fromEntries(profiles.map(p => [p.id, p])) };
    },
  });
  return { notifications: result.data?.notifications || [], unreadCount: result.data?.unreadCount || 0,
    senderProfiles: result.data?.senderProfiles || {}, loading: result.isLoading, error: result.error, refresh: result.refetch };
}
export function NotificationsCacheOwner({ children }) {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  useNotificationsData();
  useEffect(() => userId ? subscribeDomain(userId, 'notifications', () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
  }) : undefined, [userId, queryClient]);
  return children;
}
