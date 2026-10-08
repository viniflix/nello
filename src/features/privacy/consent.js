export const LEGAL_VERSION = '2026-10-01.2';
export const SUPPORT_EMAIL = 'suporte@nellonutri.com.br';
const KEY = 'nello_analytics_choice_v1';
const MAX_AGE = 180 * 24 * 60 * 60 * 1000;
const REVOKE_KEY = 'nello_analytics_pending_revocations_v1';
let owner = 'anonymous';
const blockedOwners = new Set();
const pendingRevocations = new Set();

export function bindConsentOwner(userId) { owner = userId || 'anonymous'; }
const validChoice = (record, expectedOwner) => !!record && record.owner === expectedOwner && record.version === LEGAL_VERSION
  && typeof record.allowed === 'boolean' && Date.now() - record.at >= 0 && Date.now() - record.at < MAX_AGE;
function readChoice(expectedOwner) {
  const stored = JSON.parse(localStorage.getItem(KEY));
  // Accept the existing single-owner format without transferring its choice.
  return stored?.owner === expectedOwner ? stored
    : stored?.choices && Object.hasOwn(stored.choices, expectedOwner) ? stored.choices[expectedOwner] : null;
}
export function hasAnalyticsChoice(expectedOwner = owner) {
  try {
    return validChoice(readChoice(expectedOwner), expectedOwner);
  } catch { return false; }
}
export function suspendAnalyticsConsent() { blockedOwners.add(owner); }
export function hasAnalyticsConsent(expectedOwner = owner) {
  if (blockedOwners.has(expectedOwner) || !hasAnalyticsChoice(expectedOwner)) return false;
  try { return readChoice(expectedOwner)?.allowed === true; } catch { return false; }
}
export function storeAnalyticsChoice(allowed, expectedOwner = owner) {
  blockedOwners.add(expectedOwner);
  try {
    let previous;
    try { previous = JSON.parse(localStorage.getItem(KEY)); } catch { previous = null; }
    const choices = Object.fromEntries(Object.entries(previous?.choices || {}).filter(([id, record]) => validChoice(record, id)));
    if (validChoice(previous, previous?.owner)) choices[previous.owner] = {
      owner: previous.owner, version: previous.version, allowed: previous.allowed, at: previous.at,
    };
    const record = { owner: expectedOwner, version: LEGAL_VERSION, allowed: allowed === true, at: Date.now() };
    choices[expectedOwner] = record;
    localStorage.setItem(KEY, JSON.stringify({ ...record, choices }));
    if (allowed === true) blockedOwners.delete(expectedOwner);
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
