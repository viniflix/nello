import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/infrastructure/supabase/client';
import { subscribeDomain } from '@/infrastructure/realtime/events';
import {notificationCursorFilter} from '@/lib/supabase/notification-cursor';

export function useNotificationsData({cursor=null}={}) {
  const { user } = useAuth();
  const result = useQuery({
    queryKey: cursor ? ['notifications', user?.id,cursor.time,cursor.id] : ['notifications', user?.id], enabled: Boolean(user?.id), staleTime: 30000,
    queryFn: async ({ signal }) => {
      let page=supabase.from('notifications').select('id,type,content,is_read,created_at,title,message,link_url').eq('user_id', user.id).order('created_at', {ascending:false}).order('id', {ascending:false}).limit(201).abortSignal(signal);
      if(cursor){
        // Keep PostgreSQL microseconds: Date.toISOString would truncate them.
        page=page.or(notificationCursorFilter(cursor));
      }
      const [list, count] = await Promise.all([
        page,
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false).abortSignal(signal),
      ]);
      if (list.error || count.error) throw list.error || count.error;
      const senderIds = [...new Set((list.data || []).map(n => n.content?.from_id).filter(Boolean))];
      let profiles = [];
      if (senderIds.length) {
        const response = await supabase.from('user_profiles').select('id,name,avatar_url').in('id', senderIds).abortSignal(signal);
        if (!response.error) profiles = response.data || [];
      }
      return { notifications: (list.data || []).slice(0,200), hasMore:(list.data?.length||0)>200, unreadCount: count.count || 0, senderProfiles: Object.fromEntries(profiles.map(p => [p.id, p])) };
    },
  });
  return { notifications: result.data?.notifications || [], unreadCount: result.data?.unreadCount || 0,
    hasMore:result.data?.hasMore===true,senderProfiles: result.data?.senderProfiles || {}, loading: result.isLoading, error: result.error, refresh: result.refetch };
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
