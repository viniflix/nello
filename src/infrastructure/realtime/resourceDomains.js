// Server broadcasts currently expose these coarse domains only. Keep the
// clinical fallback until every legacy projection has equivalent coverage.
export const resourceDomains = Object.freeze({
  profile: { roots: ['profile'], freshness: 'always reauthorize/refetch', manual: ['agenda.references', 'patient.home'] },
  notifications: { roots: ['notifications'], freshness: 'event invalidates all mounted pages', manual: ['chat.conversations'] },
  clinical: { roots: ['patient-hub-summary', 'patient-hub-activities', 'mealPlans', 'templates', 'checkinTemplates', 'checkinSchedules', 'pendingCheckins', 'patientCheckinHistory', 'anamnesisTemplates', 'anamnesis_records', 'anamnesis_record', 'clinical_flags', 'patientTimeline', 'admin-workspace'],
    freshness: 'event marks stale; join flight and reconcile once after newer signals',
    manual: ['agenda.period', 'agenda.calendar', 'agenda.summary', 'agenda.availability', 'agenda.references', 'financial.month', 'financial.auxiliary', 'financial.goal', 'dashboard.stats', 'dashboard.appointments', 'dashboard.noShow', 'patients.list', 'patient.home', 'patient.diary', 'patient.profile', 'goals', 'labs', 'anthropometry', 'mealPlan.versions', 'mealPlan.energy', 'patient.progress', 'admin.manual'],
    fallback: 'all authenticated QueryClient entries except profile and notifications' },
  access: { freshness: 'immediate epoch/cancel/reset; never delayed by read coordinator' },
  presence: { freshness: 'existing lease/heartbeat contract; writes not scheduled here' },
  chat: { freshness: 'existing conversation/message owner and send protocol' },
  excludedWork: ['update_chat_presence', 'process_patient_reminders', 'syncFeedTasksFromItems', 'automatic draft creation', 'template editor hydration'],
});
export const clinicalQueryPredicate = query => !['profile', 'notifications'].includes(query.queryKey[0])
  && !(query.queryKey[0] === 'nello-reference' && query.queryKey[1] === 'public');
