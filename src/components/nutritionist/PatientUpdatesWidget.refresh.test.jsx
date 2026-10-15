import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import PatientUpdatesWidget from './PatientUpdatesWidget';

const mock = vi.hoisted(() => ({ user: { id: 'synthetic-a' }, scope: vi.fn(), rows: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/infrastructure/observability/safeLogger', () => ({ logDiagnostic: vi.fn() }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: {
  rpc: () => { const q = { abortSignal: () => q, then: (yes, no) => Promise.resolve().then(mock.scope).then(yes, no) }; return q; },
  from: table => { const q = { then: (yes, no) => Promise.resolve(mock.rows(table)).then(yes, no) }; for (const name of ['select', 'in', 'abortSignal', 'order', 'limit']) q[name] = () => q; return q; },
} }));
beforeEach(() => {
  mock.user = { id: 'synthetic-a' };
  mock.scope.mockReset().mockResolvedValue({ data: [{ id: 'synthetic-patient', name: 'Synthetic person', care_episode_id: 'synthetic-episode' }] });
  mock.rows.mockReset().mockImplementation(table => ({ data: table === 'growth_records' ? [{ id: 'synthetic-record', patient_id: 'synthetic-patient', weight: 60, created_at: new Date().toISOString() }] : [] }));
});
const view = () => <MemoryRouter><PatientUpdatesWidget /></MemoryRouter>;

it('keeps the confirmed records, filter draft, focus and scroll during a pending refresh and failure', async () => {
  render(view()); await screen.findByText('registrou peso');
  const input = screen.getByPlaceholderText('Pesquisar por paciente...');
  fireEvent.change(input, { target: { value: 'Synthetic' } }); input.focus(); input.setSelectionRange(2, 5); document.documentElement.scrollTop = 300;
  let finish; mock.scope.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  fireEvent(window, new Event('focus')); await waitFor(() => expect(mock.scope).toHaveBeenCalledTimes(2));
  expect(screen.getByText('registrou peso')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Pesquisar por paciente...')).toBe(input); expect(input).toHaveFocus(); expect(input).toHaveValue('Synthetic'); expect(input.selectionStart).toBe(2);
  expect(screen.queryByText(/Carregando|Atualizando/)).not.toBeInTheDocument(); expect(document.documentElement.scrollTop).toBe(300);
  await act(async () => finish({ data: null, error: { status: 503 } }));
  expect(screen.getByRole('alert')).toBeInTheDocument(); expect(screen.getByText('registrou peso')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument()); expect(input).toHaveValue('Synthetic');
});

it('removes private records on denial and does not show the previous account snapshot', async () => {
  const app = render(view()); await screen.findByText('registrou peso');
  mock.scope.mockResolvedValue({ data: null, error: { status: 403 } });
  fireEvent(window, new Event('focus')); await screen.findByRole('alert'); expect(screen.queryByText('registrou peso')).not.toBeInTheDocument();
  mock.scope.mockReturnValue(new Promise(() => {})); mock.user = { id: 'synthetic-b' }; app.rerender(view());
  expect(screen.queryByText('Synthetic person')).not.toBeInTheDocument(); expect(screen.queryByText('registrou peso')).not.toBeInTheDocument();
});
