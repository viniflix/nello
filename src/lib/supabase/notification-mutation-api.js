import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

async function mutateQuery(userId, ids, remove) {
  if (!userId || !Array.isArray(ids) || ids.length === 0) {
    return { data: [], error: { code: 'invalid_notification_selection' } };
  }
  const uniqueIds = [...new Set(ids)];
  let query = supabase.from('notifications');
  query = remove ? query.delete() : query.update({ is_read: true });
  const result = await query.eq('user_id', userId).in('id', uniqueIds).select('id');
  if (result.error) return result;
  if (result.data?.length !== uniqueIds.length) {
    return { data: result.data || [], error: { code: 'notification_not_available' } };
  }
  return result;
}

export async function mutateOwnNotifications(userId, ids, remove) {
  const result = await mutateQuery(userId, ids, remove);
  if (result.error) toast({ title: 'Falha ao atualizar notificações.', description: 'Atualize a página e tente novamente.', variant: 'destructive' });
  return result;
}
