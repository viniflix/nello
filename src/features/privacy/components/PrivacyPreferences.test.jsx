import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PrivacyPreferences from './PrivacyPreferences';
import { bindConsentOwner, hasAnalyticsConsent, markPendingAnalyticsRevocation, LEGAL_VERSION } from '../consent';

const mocks = vi.hoisted(() => ({ user: { id: 'qa-account' }, rpc: vi.fn(), optIn: vi.fn(), optOut: vi.fn(), reset: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/infrastructure/analytics/posthog', () => ({ default: { __loaded: true, opt_in_capturing: mocks.optIn, opt_out_capturing: mocks.optOut, reset: mocks.reset }, identifyUser: vi.fn() }));
const ui = () => <MemoryRouter initialEntries={['/privacidade']}><PrivacyPreferences /></MemoryRouter>;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  localStorage.clear(); mocks.user = { id: 'qa-account' }; bindConsentOwner(mocks.user.id);
  vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: { analytics_allowed: false, terms_accepted: true } });
});
afterEach(cleanup);

it('does not let a late successful save restore analytics after logout', async () => {
  const response = deferred();
  mocks.rpc.mockImplementation(name => name === 'record_my_privacy_choice' ? response.promise : Promise.resolve({ data: { analytics_allowed: false } }));
  const view = render(ui());
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('get_my_privacy_preferences'));
  fireEvent.click(screen.getByRole('button', { name: 'Preferências de privacidade' }));
  fireEvent.click(screen.getByRole('button', { name: 'Permitir analytics' }));
  mocks.user = null; view.rerender(ui());
  await act(async () => response.resolve({ error: null }));
  expect(hasAnalyticsConsent()).toBe(false);
  expect(mocks.optIn).not.toHaveBeenCalled();
});

it('does not let a stale read overwrite a more recent explicit choice', async () => {
  const response = deferred();
  mocks.rpc.mockImplementation(name => name === 'get_my_privacy_preferences' ? response.promise : Promise.resolve({ error: null }));
  render(ui());
  fireEvent.click(screen.getByRole('button', { name: 'Preferências de privacidade' }));
  fireEvent.click(screen.getByRole('button', { name: 'Permitir analytics' }));
  await waitFor(() => expect(hasAnalyticsConsent()).toBe(true));
  await act(async () => response.resolve({ data: { analytics_allowed: false } }));
  expect(hasAnalyticsConsent()).toBe(true);
});

it('keeps a locally pending revocation denied even if the account still says allowed', async () => {
  markPendingAnalyticsRevocation('qa-account', true);
  mocks.rpc.mockResolvedValue({ data: { analytics_allowed: true, terms_accepted: true } });
  render(ui());
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
  await act(async () => {});
  expect(hasAnalyticsConsent()).toBe(false);
  expect(mocks.optIn).not.toHaveBeenCalled();
});

it('offers a first-visit refusal and remembers it without granting metrics', async () => {
  mocks.user = null;
  const view = render(ui());
  expect(screen.getByRole('button', { name: 'Aceitar todos' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Recusar não essenciais' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Aceitar todos' })).not.toBeInTheDocument());
  expect(hasAnalyticsConsent()).toBe(false);
  view.unmount(); render(ui());
  expect(screen.queryByRole('button', { name: 'Aceitar todos' })).not.toBeInTheDocument();
  expect(mocks.optIn).not.toHaveBeenCalled();
});

it('does not reuse an older legal version as permission for the new text', async () => {
  mocks.rpc.mockResolvedValue({ data: { version: '2026-10-01', analytics_allowed: true, terms_accepted: true, analytics_choice_recorded: true } });
  render(ui());
  await act(async () => {});
  expect(hasAnalyticsConsent()).toBe(false);
  expect(screen.getByRole('button', { name: 'Aceitar todos' })).toBeVisible();
  expect(mocks.optIn).not.toHaveBeenCalled();
});

it('accepts optional metrics without silently accepting terms', async () => {
  render(ui());
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Aceitar todos' }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('record_my_privacy_choice', { p_version: LEGAL_VERSION, p_terms: false, p_analytics: true }));
  expect(hasAnalyticsConsent()).toBe(true);
});
