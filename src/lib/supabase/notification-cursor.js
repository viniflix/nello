export function notificationCursorFilter(cursor) {
  const time=String(cursor?.time),id=String(cursor?.id);
  if(!Number.isFinite(Date.parse(time))||!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(time)||!/^\d{1,20}$/.test(id))throw new Error('INVALID_NOTIFICATION_CURSOR');
  return `created_at.lt.${time},and(created_at.eq.${time},id.lt.${id})`;
}
