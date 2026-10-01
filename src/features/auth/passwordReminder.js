const dismissed = new Set();
export const hasDismissedPasswordReminder = userId => dismissed.has(userId);
export const dismissPasswordReminder = userId => { if (userId) dismissed.add(userId); };
export const clearPasswordReminders = () => dismissed.clear();
