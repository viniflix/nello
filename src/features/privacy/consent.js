export const LEGAL_VERSION = '2026-10-01.2';
export const SUPPORT_EMAIL = 'suporte@nellonutri.com.br';
const KEY = 'nello_analytics_choice_v1';
const MAX_AGE = 180 * 24 * 60 * 60 * 1000;
const REVOKE_KEY = 'nello_analytics_pending_revocations_v1';
let owner = 'anonymous';
const blockedOwners = new Set();
const pendingRevocations = new Set();

export function bindConsentOwner(userId) { owner = userId || 'anonymous'; }
export function hasAnalyticsChoice(expectedOwner = owner) {
  try {
    const record = JSON.parse(localStorage.getItem(KEY));
    return record?.owner === expectedOwner && record.version === LEGAL_VERSION
      && typeof record.allowed === 'boolean' && Date.now() - record.at >= 0
      && Date.now() - record.at < MAX_AGE;
  } catch { return false; }
}
export function suspendAnalyticsConsent() { blockedOwners.add(owner); }
export function hasAnalyticsConsent(expectedOwner = owner) {
  if (blockedOwners.has(expectedOwner) || !hasAnalyticsChoice(expectedOwner)) return false;
  try { return JSON.parse(localStorage.getItem(KEY)).allowed === true; } catch { return false; }
}
export function storeAnalyticsChoice(allowed) {
  blockedOwners.add(owner);
  try {
    localStorage.setItem(KEY, JSON.stringify({ owner, version: LEGAL_VERSION, allowed: allowed === true, at: Date.now() }));
    if (allowed === true) blockedOwners.delete(owner);
    return true;
  } catch { return false; }
}
export function clearAnalyticsChoice() {
  try { localStorage.removeItem(KEY); } catch { /* No storage means no consent. */ }
}

export function hasPendingAnalyticsRevocation(userId) {
  if (!userId) return false;
  if (pendingRevocations.has(userId)) return true;
  try { return JSON.parse(localStorage.getItem(REVOKE_KEY) || '{}')[userId] === true; }
  catch { return true; }
}
export function markPendingAnalyticsRevocation(userId, pending) {
  if (!userId) return;
  if (pending) pendingRevocations.add(userId); else pendingRevocations.delete(userId);
  try {
    const records = JSON.parse(localStorage.getItem(REVOKE_KEY) || '{}');
    if (pending) records[userId] = true; else delete records[userId];
    localStorage.setItem(REVOKE_KEY, JSON.stringify(records));
  } catch { /* A storage failure never authorizes capture. */ }
}

export function signupLegalMetadata(analytics = false) {
  return { legal_version: LEGAL_VERSION, terms_accepted: true, analytics_allowed: analytics === true };
}
