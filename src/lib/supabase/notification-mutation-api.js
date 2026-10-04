import { toast } from '@/components/ui/use-toast';
import { communicationClient as supabase } from '@/infrastructure/supabase/domainClients';
import { invalidateDomain } from '@/infrastructure/realtime/events';

async function mutate(userId, rpc, args) {
  let result;
  try { result = await supabase.rpc(rpc, { ...args, p_actor: userId }); }
  catch { result = { error: { code: 'notification_transport_failed' } }; }
  if (result.error) toast({ title: 'Falha ao atualizar notificações.', description: 'Tente novamente. Sua seleção foi mantida.', variant: 'destructive' });
  else invalidateDomain(userId, 'notifications');
  return result;
}
export function mutateOwnNotifications(userId, ids, remove) {
  if (!userId || !Array.isArray(ids) || !ids.length || ids.length > 500) return Promise.resolve({ error: { code: 'invalid_notification_selection' } });
  return mutate(userId, 'mutate_own_notifications', { p_ids: [...new Set(ids)], p_remove: Boolean(remove) });
}
export function markAllNotificationsRead(userId) {
  if (!userId) return Promise.resolve({ error: { code: 'authentication_required' } });
  return mutate(userId, 'mark_all_notifications_read', {});
}
