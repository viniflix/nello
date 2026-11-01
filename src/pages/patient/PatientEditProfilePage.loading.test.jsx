import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router-dom';
import DraftGuardProvider from '@/app/router/DraftGuardProvider';
import PatientEditProfilePage from './PatientEditProfilePage';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ user: null, toast: vi.fn(), update: vi.fn(), updateUserProfile: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.user, updateUserProfile: mock.updateUserProfile }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock('@/infrastructure/observability/safeLogger', () => ({ logDiagnostic: vi.fn() }));
vi.mock('@/components/ui/date-input', () => ({ DateInputWithCalendar: ({ id, value, onChange }) => <input id={id} value={value} onChange={e => onChange(e.target.value)} /> }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: () => {
  let payload; const query = { update: value => { payload = value; return query; }, eq: () => query,
    select: () => query, single: () => query,
    then: (resolve, reject) => Promise.resolve(mock.update(payload)).then(resolve, reject) }; return query;
} } }));
const user = (id = 'synthetic-a', name = 'Pessoa fictícia A') => ({ id, profile: { name, phone: '', height: 0, weight: 0, address: {} } });
const view = () => <MemoryRouter><PatientEditProfilePage /></MemoryRouter>;
beforeEach(() => { mock.user = user(); mock.toast.mockReset(); mock.update.mockReset(); mock.updateUserProfile.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('retains dirty text, selection and focus when the same account receives a new Auth object', () => {
  const app = render(view()); const name = screen.getByLabelText('Nome Completo *');
  fireEvent.change(name, { target: { value: 'Rascunho fictício' } }); name.focus(); name.setSelectionRange(3, 7);
  mock.user = { ...mock.user, profile: { ...mock.user.profile } }; app.rerender(view());
  expect(name).toHaveValue('Rascunho fictício'); expect(document.activeElement).toBe(name); expect(name.selectionStart).toBe(3); expect(name.selectionEnd).toBe(7);
});
it('preserves dirty fields and requires review of an external profile update', () => {
  const app = render(view()); fireEvent.change(screen.getByLabelText('Nome Completo *'), { target: { value: 'Edição fictícia' } });
  mock.user = user('synthetic-a', 'Alteração externa fictícia'); app.rerender(view());
  expect(screen.getByLabelText('Nome Completo *')).toHaveValue('Edição fictícia');
  expect(screen.getByRole('alert')).toHaveTextContent('perfil');
  expect(screen.getByRole('button', { name: 'Salvar Alterações' })).toBeDisabled();
});
it('does not reuse another account draft and preserves measured zero in hydration', () => {
  const app = render(view()); expect(screen.getByLabelText('Peso (kg)')).toHaveValue(0);
  fireEvent.change(screen.getByLabelText('Nome Completo *'), { target: { value: 'Rascunho privado fictício' } });
  mock.user = user('synthetic-b', 'Pessoa fictícia B'); app.rerender(view());
  expect(screen.getByLabelText('Nome Completo *')).toHaveValue('Pessoa fictícia B');
});
it('an old postal lookup never overwrites a manual address edit', async () => {
  let resolve; vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolve = r; })));
  render(view()); fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '00000000' } });
  fireEvent.change(screen.getByLabelText('Rua/Logradouro'), { target: { value: 'Rua digitada fictícia' } });
  await act(async () => resolve({ ok: true, json: async () => ({ logradouro: 'Rua remota fictícia' }) }));
  expect(screen.getByLabelText('Rua/Logradouro')).toHaveValue('Rua digitada fictícia');
});
it('updates pristine fields, but ignores profile properties outside this editor', () => {
  const app = render(view()); mock.user = user('synthetic-a', 'Perfil externo fictício'); app.rerender(view());
  expect(screen.getByLabelText('Nome Completo *')).toHaveValue('Perfil externo fictício');
  fireEvent.change(screen.getByLabelText('Nome Completo *'), { target: { value: 'Draft fictício' } });
  mock.user = { ...mock.user, profile: { ...mock.user.profile, avatar_url: 'storage:synthetic' } }; app.rerender(view());
  expect(screen.getByLabelText('Nome Completo *')).toHaveValue('Draft fictício'); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('requires an explicit choice before keeping a draft against an updated profile', () => {
  const app = render(view()); fireEvent.change(screen.getByLabelText('Nome Completo *'), { target: { value: 'Draft fictício' } });
  mock.user = user('synthetic-a', 'Perfil externo fictício'); app.rerender(view());
  fireEvent.click(screen.getByRole('button', { name: 'Manter minha edição' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(screen.getByLabelText('Nome Completo *')).toHaveValue('Draft fictício');
  expect(screen.getByRole('button', { name: 'Salvar Alterações' })).toBeEnabled(); expect(mock.update).not.toHaveBeenCalled();
});
it('only discards a dirty draft for an external profile after confirmation', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false); const app = render(view());
  fireEvent.change(screen.getByLabelText('Nome Completo *'), { target: { value: 'Draft fictício' } });
  mock.user = user('synthetic-a', 'Perfil externo fictício'); app.rerender(view());
  fireEvent.click(screen.getByRole('button', { name: 'Usar perfil atualizado' })); expect(screen.getByLabelText('Nome Completo *')).toHaveValue('Draft fictício');
  window.confirm.mockReturnValue(true); fireEvent.click(screen.getByRole('button', { name: 'Usar perfil atualizado' }));
  expect(screen.getByLabelText('Nome Completo *')).toHaveValue('Perfil externo fictício');
});
it('preserves the draft on a failed save without optimistic success', async () => {
  mock.update.mockResolvedValue({ data: null, error: new Error('Failed to fetch') }); render(view());
  fireEvent.change(screen.getByLabelText('Nome Completo *'), { target: { value: 'Draft fictício' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('conexão'); expect(screen.getByLabelText('Nome Completo *')).toHaveValue('Draft fictício');
  expect(mock.updateUserProfile).not.toHaveBeenCalled(); expect(mock.toast.mock.calls.some(([arg]) => arg.title === 'Sucesso!')).toBe(false);
});
it('only reports success on a confirmed returned row and saves measured zero', async () => {
  mock.update.mockImplementation(payload => ({ data: { id: 'synthetic-a', ...payload }, error: null })); render(view());
  fireEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' })); await waitFor(() => expect(mock.updateUserProfile).toHaveBeenCalled());
  expect(mock.update.mock.calls[0][0]).toMatchObject({ height: 0, weight: 0 });
  expect(mock.toast.mock.calls.some(([arg]) => arg.title === 'Sucesso!')).toBe(true);
});
it('a missing confirmation row never produces a success message', async () => {
  mock.update.mockResolvedValue({ data: null, error: null }); render(view()); fireEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('preservada'); expect(mock.updateUserProfile).not.toHaveBeenCalled();
});
it('an account change during save ignores the previous response and keeps the new editor', async () => {
  let resolve; mock.update.mockReturnValue(new Promise(r => { resolve = r; })); const app = render(view());
  fireEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
  mock.user = user('synthetic-b', 'Pessoa fictícia B'); app.rerender(view());
  await act(async () => resolve({ data: { id: 'synthetic-a', name: 'Pessoa fictícia A' }, error: null }));
  expect(screen.getByLabelText('Nome Completo *')).toHaveValue('Pessoa fictícia B'); expect(mock.updateUserProfile).not.toHaveBeenCalled();
  expect(mock.toast.mock.calls.some(([arg]) => arg.title === 'Sucesso!')).toBe(false);
});
it('a previous postal response cannot set another account address', async () => {
  let resolve; vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolve = r; }))); const app = render(view());
  fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '00000000' } });
  mock.user = user('synthetic-b', 'Pessoa fictícia B'); app.rerender(view());
  await act(async () => resolve({ ok: true, json: async () => ({ logradouro: 'Rua privada fictícia A' }) }));
  expect(screen.getByLabelText('Rua/Logradouro')).toHaveValue('');
});

it('uses one accessible route confirmation for the real profile back button', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  confirm.mockClear();
  const router = createMemoryRouter([{ path: '/edit', element: <DraftGuardProvider><PatientEditProfilePage /></DraftGuardProvider> }, { path: '/patient/perfil', element: <h1>Profile destination</h1> }], { initialEntries: ['/edit'] });
  try {
    render(<RouterProvider router={router} />);
    fireEvent.change(screen.getByLabelText('Nome Completo *'), { target: { value: 'Unconfirmed profile draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao perfil' }));
    await screen.findByRole('alertdialog');
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByLabelText('Nome Completo *')).toHaveValue('Unconfirmed profile draft');
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao perfil' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Sair sem confirmação' }));
    await screen.findByRole('heading', { name: 'Profile destination' });
  } finally { router.dispose(); confirm.mockRestore(); }
});
