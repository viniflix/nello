import {readRequest} from '@/lib/supabase/readRequest';
import {queryRead} from '@/lib/utils/readPolicy';
import { useQueryResource } from '@/hooks/useQueryResource';
import { classifyFailure, failurePresentation, settleResources } from '@/lib/utils/failure';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/infrastructure/supabase/client';
import { subscribeDomain } from '@/infrastructure/realtime/events';
import {notificationCursorFilter} from '@/lib/supabase/notification-cursor';
import { invalidateQueryReads } from '@/infrastructure/realtime/queryReads';

export function useNotificationsData({cursor=null}={}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = cursor ? ['notifications', user?.id,cursor.time,cursor.id] : ['notifications', user?.id];
  const result = useQuery({
    queryKey, enabled: Boolean(user?.id), staleTime: 30000,
    queryFn: queryRead(async ({ signal }) => {
      let page=supabase.from('notifications').select('id,type,content,is_read,created_at,title,message,link_url').eq('user_id', user.id).order('created_at', {ascending:false}).order('id', {ascending:false}).limit(201).abortSignal(signal);
      if(cursor){
        // Keep PostgreSQL microseconds: Date.toISOString would truncate them.
        page=page.or(notificationCursorFilter(cursor));
      }
      const {list,count} = await settleResources({
        list: () => readRequest(() => page, {signal}),
        count: async () => { const response = await readRequest(() => supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false).abortSignal(signal), {signal:signal}); return {data:response.count,error:response.error}; },
      });
      if (list.error) throw list.error;
      if (count.error && ['forbidden','unauthenticated'].includes(classifyFailure(count.error))) throw count.error;
      const senderIds = [...new Set((list.data || []).map(n => n.content?.from_id).filter(Boolean))];
      let profiles = [];
      if (senderIds.length) {
        const response = await readRequest(() => supabase.from('user_profiles').select('id,name,avatar_url').in('id', senderIds).abortSignal(signal), {signal:signal});
        if (!response.error) profiles = response.data || [];
      }
      return { notifications: (list.data || []).slice(0,200), hasMore:(list.data?.length||0)>200, unreadCount: count.error ? queryClient.getQueryData(queryKey)?.unreadCount ?? null : count.data ?? 0,
        countError: count.error ? failurePresentation(count.error) : null, senderProfiles: Object.fromEntries(profiles.map(p => [p.id, p])) };
    }),
  });
  const resource = useQueryResource(result, JSON.stringify([user?.id, ...queryKey]));
  const data = resource.data;
  const countError = resource.error || data?.countError || null;
  const hasCount = data?.unreadCount != null;
  const countResource = { ...resource, data: data?.unreadCount ?? null, hasSnapshot: hasCount,
    initialLoading: !hasCount && resource.pending, refreshing: hasCount && resource.pending,
    error: countError, stale: hasCount && Boolean(countError), canAct: hasCount && !resource.pending && !countError };
  return { resource, countResource, notifications: data?.notifications || [], unreadCount: data ? data.unreadCount : 0,
    hasMore:data?.hasMore===true,senderProfiles: data?.senderProfiles || {}, loading: resource.initialLoading,
    error: result.error, refresh: result.refetch };

}
export function NotificationsCacheOwner({ children }) {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  useNotificationsData();
  useEffect(() => userId ? subscribeDomain(userId, 'notifications', signal => {
    void invalidateQueryReads(queryClient, { queryKey: ['notifications', userId] }, userId, signal?.sequence);
  }) : undefined, [userId, queryClient]);
  return children;
}
