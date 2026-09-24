import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state, clearQueries } = vi.hoisted(() => ({
  state: { callback: null, initialUser: { id: 'account-a' }, queryClient: null },
  clearQueries: vi.fn(),
}));
state.queryClient = { clear: clearQueries, invalidateQueries: vi.fn() };
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => state.queryClient }));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: (id) => ({ data: id ? { id, user_type: 'patient' } : null, isLoading: false, isError: false }),
}));
vi.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: state.initialUser } }, error: null })),
      onAuthStateChange: vi.fn((callback) => {
        state.callback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: vi.fn(async () => ({ error: null })),
    },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}));
vi.mock('@/infrastructure/observability/telemetry', () => ({
  captureOperationalError: vi.fn(), clearObservabilityUser: vi.fn(), setObservabilityUser: vi.fn(),
}));
vi.mock('@/lib/supabase/verification-queries', () => ({ getMyProfessionalVerification: vi.fn() }));
vi.mock('@/features/auth/authFlows', () => ({ redeemPatientInvite: vi.fn() }));
vi.mock('@/infrastructure/analytics/posthog', () => ({ Events: {}, track: vi.fn() }));

const { AuthProvider, useAuth } = await import('./AuthContext');
function Identity() {
  const { user } = useAuth();
  return <span>{user?.id || 'signed-out'}</span>;
}

describe('limpeza ao mudar a sessão', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearQueries.mockClear();
    state.callback = null;
    state.initialUser = { id: 'account-a' };
  });

  it('limpa rascunhos e cache após SIGNED_OUT recebido do SDK', async () => {
    render(<MemoryRouter><AuthProvider><Identity /></AuthProvider></MemoryRouter>);
    await screen.findByText('account-a');
    sessionStorage.setItem('nello_shadow:account-a:patient', 'private');
    localStorage.setItem('nello_offline_queue', 'private');

    await act(async () => { await state.callback('SIGNED_OUT', null); });

    expect(screen.getByText('signed-out')).toBeTruthy();
    expect(sessionStorage.getItem('nello_shadow:account-a:patient')).toBeNull();
    expect(localStorage.getItem('nello_offline_queue')).toBeNull();
    expect(clearQueries).toHaveBeenCalled();
  });

  it('limpa o estado de A antes de ativar B', async () => {
    render(<MemoryRouter><AuthProvider><Identity /></AuthProvider></MemoryRouter>);
    await screen.findByText('account-a');
    sessionStorage.setItem('nello_anamnesis:account-a:record', 'private');

    await act(async () => { await state.callback('SIGNED_IN', { user: { id: 'account-b' } }); });
    await waitFor(() => expect(screen.getByText('account-b')).toBeTruthy());

    expect(sessionStorage.getItem('nello_anamnesis:account-a:record')).toBeNull();
    expect(clearQueries).toHaveBeenCalled();
  });
});
