export const feedItemKey = item => `${item.sourceType}:${item.sourceId}`;

// A failed old snapshot must never become a write into a new care episode.
export function scopeFeedItems(items, patients, { preserveEpisode = false } = {}) {
  const active = new Map(patients.map(patient => [patient.id, patient.care_episode_id]));
  return items.filter(item => !item.patientId || (active.has(item.patientId)
    && (!preserveEpisode || item.careEpisodeId === active.get(item.patientId))))
    .map(item => ({ ...item, careEpisodeId: item.patientId ? active.get(item.patientId) : null }));
}

export function canRetryFeedFailure(code) {
  return ['NETWORK_FAILURE', 'OFFLINE', 'RETRY_LIMIT', 'PT409', '40001', '40P01', '57014', '57P01', '53300', '08000', '08006', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003'].includes(code)
    || !code;
}

export function scopeFeedStates(states, patients) {
  const active = new Map(patients.map(patient => [patient.id, patient.care_episode_id]));
  return states.filter(state=>!state.patient_id || (active.has(state.patient_id)
    && state.metadata?.care_episode_id===active.get(state.patient_id)));
}
