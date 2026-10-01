// Public incident messages only. Never include identities, clinical information,
// internal URLs, credentials or raw provider errors. Publish changes through the
// same reviewed release flow as application changes.
export const incidents = [];

export function publicIncidents(records = incidents) {
  if (!Array.isArray(records) || records.length > 10) throw Error('Invalid public incidents');
  return records.map(record => {
    if (!/^[a-z0-9-]{1,64}$/.test(record.id) || !['investigating', 'identified', 'monitoring', 'resolved'].includes(record.state)
      || typeof record.title !== 'string' || record.title.length < 1 || record.title.length > 120
      || typeof record.message !== 'string' || record.message.length < 1 || record.message.length > 800
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(record.updatedAt)
      || !Number.isFinite(Date.parse(record.updatedAt)) || /[<>\u0000-\u001f]/.test(record.title + record.message)) throw Error('Invalid public incident');
    return { id: record.id, state: record.state, title: record.title, message: record.message, updatedAt: record.updatedAt };
  });
}
