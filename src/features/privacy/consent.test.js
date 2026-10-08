import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindConsentOwner, clearAnalyticsChoice, hasAnalyticsConsent, hasAnalyticsChoice, hasPendingAnalyticsRevocation, markPendingAnalyticsRevocation, LEGAL_VERSION, storeAnalyticsChoice } from './consent';

describe('analytics consent boundary', () => {
  beforeEach(() => { localStorage.clear(); bindConsentOwner(null); });
  afterEach(() => vi.restoreAllMocks());
  it('denies by default and grants only a current explicit choice', () => {
    expect(hasAnalyticsChoice()).toBe(false);
    expect(hasAnalyticsConsent()).toBe(false);
    storeAnalyticsChoice(true); expect(hasAnalyticsConsent()).toBe(true);
    storeAnalyticsChoice(false); expect(hasAnalyticsConsent()).toBe(false);
    expect(hasAnalyticsChoice()).toBe(true);
  });
  it('does not transfer an anonymous or another account grant to a signed-in user', () => {
    storeAnalyticsChoice(true); bindConsentOwner('account-a'); expect(hasAnalyticsConsent()).toBe(false);
    storeAnalyticsChoice(true); bindConsentOwner('account-b'); expect(hasAnalyticsConsent()).toBe(false);
    expect(hasAnalyticsConsent('account-a')).toBe(true);
    clearAnalyticsChoice(); expect(hasAnalyticsConsent('account-a')).toBe(false);
  });
  it('remembers each browser choice when another account saves its own preference', () => {
    storeAnalyticsChoice(false);
    bindConsentOwner('account-a'); storeAnalyticsChoice(true);
    bindConsentOwner('account-b'); storeAnalyticsChoice(false);
    bindConsentOwner(null);
    expect(hasAnalyticsChoice()).toBe(true);
    expect(hasAnalyticsConsent()).toBe(false);
    bindConsentOwner('account-a');
    expect(hasAnalyticsChoice()).toBe(true);
    expect(hasAnalyticsConsent()).toBe(true);
    bindConsentOwner('account-b');
    expect(hasAnalyticsChoice()).toBe(true);
    expect(hasAnalyticsConsent()).toBe(false);
  });
  it('reads a legacy choice and retains it when upgrading the browser record', () => {
    localStorage.setItem('nello_analytics_choice_v1', JSON.stringify({ owner: 'anonymous', version: LEGAL_VERSION, allowed: false, at: Date.now() }));
    expect(hasAnalyticsChoice()).toBe(true);
    bindConsentOwner('upgraded-account'); storeAnalyticsChoice(true);
    bindConsentOwner(null);
    expect(hasAnalyticsChoice()).toBe(true);
    expect(hasAnalyticsConsent()).toBe(false);
  });
  it.each([
    { version: 'old', at: Date.now() },
    { version: LEGAL_VERSION, at: Date.now() - 181 * 86400000 },
    { version: LEGAL_VERSION, at: Date.now() + 86400000 },
  ])('denies obsolete, expired and future-dated grants: %j', fields => {
    localStorage.setItem('nello_analytics_choice_v1', JSON.stringify({ owner: 'anonymous', allowed: true, ...fields }));
    expect(hasAnalyticsConsent()).toBe(false);
  });
  it('denies malformed or unavailable browser storage', () => {
    localStorage.setItem('nello_analytics_choice_v1', 'not-json'); expect(hasAnalyticsConsent()).toBe(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
    expect(hasAnalyticsConsent()).toBe(false);
  });
  it('stops a previous grant immediately even when storage writes fail', () => {
    storeAnalyticsChoice(true);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); });
    expect(storeAnalyticsChoice(false)).toBe(false);
    expect(hasAnalyticsConsent()).toBe(false);
  });
  it('preserves a pending revocation through logout, account changes and refresh storage', () => {
    markPendingAnalyticsRevocation('account-a', true);
    clearAnalyticsChoice(); bindConsentOwner('account-b');
    expect(hasPendingAnalyticsRevocation('account-a')).toBe(true);
    expect(hasPendingAnalyticsRevocation('account-b')).toBe(false);
    markPendingAnalyticsRevocation('account-a', false);
    expect(hasPendingAnalyticsRevocation('account-a')).toBe(false);
  });
  it('keeps a pending revocation in memory when browser storage cannot save it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); });
    markPendingAnalyticsRevocation('storage-failure-account', true);
    expect(hasPendingAnalyticsRevocation('storage-failure-account')).toBe(true);
    markPendingAnalyticsRevocation('storage-failure-account', false);
    expect(hasPendingAnalyticsRevocation('storage-failure-account')).toBe(false);
  });
});
