import {usePatientFormStore} from '@/stores/usePatientFormStore';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state, clearQueries } = vi.hoisted(() => ({
  state: { callback: null, initialUser: { id: 'account-a' }, queryClient: null, profileError: false, refetch: vi.fn() },
  clearQueries: vi.fn(),
}));
state.queryClient = { clear: clearQueries, invalidateQueries: vi.fn() };
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => state.queryClient }));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: (id) => ({ data: id && !state.profileError ? { id, user_type: 'patient', is_active: state.activeProfile } : null, isLoading: false, isError: !!id && state.profileError, refetch: state.refetch }),
}));
vi.mock('@/infrastructure/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => state.sessionFactory ? state.sessionFactory() : Promise.resolve({ data: { session: { user: state.initialUser } }, error: null })),
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
    state.profileError = false; state.activeProfile = true;
    state.refetch.mockClear(); state.sessionFactory=null; usePatientFormStore.getState().resetForm();
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

  it('oferece recuperação quando a sessão existe mas o perfil falha, sem liberar a rota privada', async () => {
    state.profileError = true;
    render(<MemoryRouter initialEntries={['/patient']}><AuthProvider><Identity /></AuthProvider></MemoryRouter>);
    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    expect(screen.queryByText('account-a')).toBeNull();
    expect(screen.queryByText('Verificando sessão...')).toBeNull();
    fireEvent.click(retry);
    expect(state.refetch).toHaveBeenCalledTimes(1);
    expect(clearQueries).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sair da conta' })).toBeTruthy();
  });

  it('volta à rota protegida somente após recuperar o perfil', async () => {
    state.profileError = true;
    const view = <MemoryRouter initialEntries={['/patient']}><AuthProvider><Identity /></AuthProvider></MemoryRouter>;
    const { rerender } = render(view);
    await screen.findByRole('alert');
    state.profileError = false; state.activeProfile = true;
    rerender(<MemoryRouter initialEntries={['/patient']}><AuthProvider><Identity /></AuthProvider></MemoryRouter>);
    await screen.findByText('account-a');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('permite sair de uma sessão sem perfil e limpa o cache privado', async () => {
    state.profileError = true;
    render(<MemoryRouter initialEntries={['/patient']}><AuthProvider><Identity /></AuthProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Sair da conta' }));
    await screen.findByText('signed-out');
    expect(clearQueries).toHaveBeenCalled();
  });
});

describe('E04 identity boundary',()=>{
 beforeEach(()=>{state.sessionFactory=null;state.profileError=false;state.initialUser={id:'account-a'};usePatientFormStore.getState().resetForm();});
 it('removes global patient registration data on logout',async()=>{
  render(<MemoryRouter><AuthProvider><Identity/></AuthProvider></MemoryRouter>);await screen.findByText('account-a');
  usePatientFormStore.getState().updateField('name','Synthetic private A');
  await act(async()=>state.callback('SIGNED_OUT',null));
  expect(usePatientFormStore.getState().formData.name).toBe('');
 });
 it('does not reactivate a logged-out actor from a late token notification',async()=>{
  render(<MemoryRouter><AuthProvider><Identity/></AuthProvider></MemoryRouter>);await screen.findByText('account-a');
  await act(async()=>state.callback('SIGNED_OUT',null));
  await act(async()=>{state.callback('TOKEN_REFRESHED',{user:{id:'account-a'}});await new Promise(resolve=>setTimeout(resolve,10))});
  expect(screen.getByText('signed-out')).toBeInTheDocument();
 });
 it('resets an editor even when A → B → A is batched before React commits B',async()=>{
  function Editor(){return <><Identity/><input aria-label="Rapid identity draft" defaultValue=""/></>}
  render(<MemoryRouter><AuthProvider><Editor/></AuthProvider></MemoryRouter>);await screen.findByText('account-a');
  fireEvent.change(screen.getByLabelText('Rapid identity draft'),{target:{value:'Private A'}});
  await act(async()=>{state.callback('SIGNED_IN',{user:{id:'account-b'}});state.callback('SIGNED_IN',{user:{id:'account-a'}});await new Promise(resolve=>setTimeout(resolve,10))});
  await screen.findByText('account-a');expect(screen.getByLabelText('Rapid identity draft')).toHaveValue('');
 });
 it('cannot restore the initial session after SIGNED_OUT while getSession is pending',async()=>{
  let finish;state.sessionFactory=()=>new Promise(resolve=>{finish=resolve});
  render(<MemoryRouter><AuthProvider><Identity/></AuthProvider></MemoryRouter>);
  await act(async()=>state.callback('SIGNED_OUT',null));
  await act(async()=>finish({data:{session:{user:{id:'account-a'}}}}));
  expect(screen.getByText('signed-out')).toBeInTheDocument();
 });
 it('preserves the current editor on token renewal but creates a clean owner on A → B → A',async()=>{
  function Editor(){const{user}=useAuth();return <><Identity/><input aria-label="Synthetic private editor" defaultValue="" data-owner={user?.id}/></>}
  render(<MemoryRouter><AuthProvider><Editor/></AuthProvider></MemoryRouter>);await screen.findByText('account-a');
  fireEvent.change(screen.getByLabelText('Synthetic private editor'),{target:{value:'Private A'}});
  await act(async()=>state.callback('TOKEN_REFRESHED',{user:{id:'account-a'}}));
  await waitFor(()=>expect(screen.getByLabelText('Synthetic private editor')).toHaveValue('Private A'));
  await act(async()=>state.callback('SIGNED_IN',{user:{id:'account-b'}}));await screen.findByText('account-b');
  expect(screen.getByLabelText('Synthetic private editor')).toHaveValue('');
  await act(async()=>state.callback('SIGNED_IN',{user:{id:'account-a'}}));await screen.findByText('account-a');
  expect(screen.getByLabelText('Synthetic private editor')).toHaveValue('');
 });
});


describe('confirmed profile access',()=>{
 beforeEach(()=>{
  sessionStorage.clear();localStorage.clear();clearQueries.mockClear();state.callback=null;state.initialUser={id:'account-a'};state.profileError=false;state.activeProfile=true;state.sessionFactory=null;state.refetch.mockClear();usePatientFormStore.getState().resetForm();
 });
it('closes the current private session and clears drafts after confirmed profile deactivation',async()=>{
 const view=render(<MemoryRouter initialEntries={['/patient/editar-perfil']}><AuthProvider><Identity /></AuthProvider></MemoryRouter>);await screen.findByText('account-a');sessionStorage.setItem('nello_shadow:account-a:patient','private');
 state.activeProfile=false;view.rerender(<MemoryRouter initialEntries={['/patient/editar-perfil']}><AuthProvider><Identity /></AuthProvider></MemoryRouter>);
 await waitFor(()=>expect(screen.queryByText('account-a')).toBeNull());expect(sessionStorage.getItem('nello_shadow:account-a:patient')).toBeNull();expect(clearQueries).toHaveBeenCalled();
});

it('retains the loaded current session and private draft after a transient profile refresh error',async()=>{
 const view=render(<MemoryRouter initialEntries={['/patient/editar-perfil']}><AuthProvider><Identity /></AuthProvider></MemoryRouter>);await screen.findByText('account-a');sessionStorage.setItem('nello_shadow:account-a:patient','private');const clears=clearQueries.mock.calls.length;
 state.profileError=true;view.rerender(<MemoryRouter initialEntries={['/patient/editar-perfil']}><AuthProvider><Identity /></AuthProvider></MemoryRouter>);
 expect(screen.getByText('account-a')).toBeTruthy();expect(sessionStorage.getItem('nello_shadow:account-a:patient')).toBe('private');expect(clearQueries.mock.calls.length).toBe(clears);
});

 it('clears a deactivated private identity without navigating or remounting an independent public draft',async()=>{
  function PublicDraft(){const location=useLocation();return <><Identity/><output>{location.pathname}</output><input aria-label="Independent public draft" defaultValue=""/></>}
  const tree=()=> <MemoryRouter initialEntries={['/f/SYNTHETIC']}><AuthProvider><PublicDraft/></AuthProvider></MemoryRouter>;
  const view=render(tree());await screen.findByText('account-a');const input=screen.getByLabelText('Independent public draft');fireEvent.change(input,{target:{value:'Public response'}});input.focus();sessionStorage.setItem('nello_shadow:account-a:patient','private');
  state.activeProfile=false;view.rerender(tree());await screen.findByText('signed-out');expect(screen.getByText('/f/SYNTHETIC')).toBeTruthy();expect(screen.getByLabelText('Independent public draft')).toBe(input);expect(input).toHaveValue('Public response');expect(input).toHaveFocus();expect(sessionStorage.getItem('nello_shadow:account-a:patient')).toBeNull();
 });

});
