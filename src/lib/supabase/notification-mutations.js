const mutate = (userId, ids, remove) => import('./notification-mutation-api').then(api => api.mutateOwnNotifications(userId, ids, remove));

export const markOwnNotificationsRead = (userId, ids) => mutate(userId, ids, false);
export const deleteOwnNotifications = (userId, ids) => mutate(userId, ids, true);
