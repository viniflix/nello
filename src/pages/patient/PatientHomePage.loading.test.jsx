import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PatientHomePage from './PatientHomePage';
import { invalidateDomain } from '@/infrastructure/realtime/events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ user: null, care: vi.fn(), plan: vi.fn(), read: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/lib/supabase/patient-queries', () => ({ getMyCareRelationship: (...args) => mock.care(...args) }));
vi.mock('@/lib/supabase/meal-plan-queries', () => ({ getActiveMealPlan: (...args) => mock.plan(...args) }));
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ unreadCount: 0 }) }));
vi.mock('@/infrastructure/observability/safeLogger', () => ({ logDiagnostic: vi.fn() }));
vi.mock('@/components/patient/NextMealCard', () => ({ default: ({ mealPlanMeals }) => <p>{mealPlanMeals[0]?.name}</p> }));
vi.mock('@/components/patient/DailyAdherenceCard', () => ({ default: ({ current }) => <p>Energia fictícia: {current?.calories}</p> }));
vi.mock('@/components/patient/PatientMetricsWidget', () => ({ default: () => <div /> }));
vi.mock('@/components/patient/RecentAchievementsWidget', () => ({ default: () => <div /> }));
vi.mock('@/components/patient/PatientPendingCheckinsWidget', () => ({ default: () => <div /> }));
vi.mock('@/components/NotificationsPanel', () => ({ default: () => <div /> }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: table => {
  const filters = {};
  const query = { select: () => query, in: () => query, gte: () => query, order: () => query,
    limit: () => query, is: () => query, abortSignal: signal => { filters.signal = signal; return query; },
    eq: (key, value) => { filters[key] = value; return query; }, maybeSingle: () => query,
    then: (resolve, reject) => Promise.resolve(mock.read(table, filters)).then(resolve, reject) };
  return query;
} } }));

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const user = (id = 'synthetic-a') => ({ id, profile: { name: id, nutritionist_id: 'synthetic-n', is_active: true } });
const prescription = name => ({ data: { daily_calories: 1800, meal_plan_meals: [{ name }] }, error: null });
const view = () => <MemoryRouter><PatientHomePage /></MemoryRouter>;
beforeEach(() => {
  mock.user = user(); mock.care.mockReset().mockResolvedValue({ data: { status: 'active' }, error: null });
  mock.plan.mockReset().mockResolvedValue(prescription('Plano fictício atual'));
  mock.read.mockReset().mockImplementation(table => ({ data: table === 'meals' ? [] : null, error: null, count: 0 }));
});
afterEach(cleanup);

it('does not reload the home snapshot for a same-account Auth object replacement', async () => {
  const app = render(view()); await screen.findByText('Plano fictício atual');
  mock.user = { ...mock.user, profile: { ...mock.user.profile } }; app.rerender(view());
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  expect(mock.care).toHaveBeenCalledTimes(1); expect(mock.plan).toHaveBeenCalledTimes(1);
});
it('ignores account A finishing after account B even if the unsupported helper completes', async () => {
  const old = deferred(); mock.plan.mockImplementation(id => id === 'synthetic-a' ? old.promise : Promise.resolve(prescription('Plano fictício B')));
  const app = render(view()); await waitFor(() => expect(mock.plan).toHaveBeenCalledTimes(1));
  mock.user = user('synthetic-b'); app.rerender(view()); await screen.findByText('Plano fictício B'); await waitFor(() => expect(screen.getByText('Plano fictício B')).toBeVisible());
  await act(async () => old.resolve(prescription('Plano fictício A antigo')));
  expect(screen.queryByText('Plano fictício A antigo')).not.toBeInTheDocument();
  expect(screen.getByText('Plano fictício B')).toBeVisible();
});
it('does not turn a failed required source into a successfully empty home', async () => {
  mock.plan.mockResolvedValue({ data: null, error: { status: 403 } }); render(view());
  expect(await screen.findByRole('alert')).toHaveTextContent('permissão');
  expect(screen.queryByText('Registrar Alimentação')).not.toBeInTheDocument();
});
it('keeps the same snapshot, button focus and scroll during a domain refresh and transient failure', async () => {
  render(view()); await screen.findByText('Plano fictício atual'); await waitFor(() => expect(screen.getByText('Plano fictício atual')).toBeVisible());
  const action = screen.getByRole('button', { name: /Ver diário|Registrar agora/ }); action.focus(); document.documentElement.scrollTop = 240;
  const pending = deferred(); mock.plan.mockReturnValue(pending.promise);
  await act(async () => { invalidateDomain('synthetic-a', 'clinical'); await new Promise(r => setTimeout(r, 130)); });
  expect(mock.plan).toHaveBeenCalledTimes(2); expect(screen.getByText('Plano fictício atual')).toBeVisible();
  expect(screen.queryByText(/Atualizando/i)).not.toBeInTheDocument();
  expect(document.activeElement).toBe(action); expect(document.documentElement.scrollTop).toBe(240);
  await act(async () => pending.resolve({ data: null, error: new Error('Failed to fetch') }));
  expect(screen.getByText('Plano fictício atual')).toBeVisible(); expect(screen.getByRole('alert')).toHaveTextContent('conexão');
});

it.each(['pending', 'ended', 'unlinked'])('renders relationship %s without reading an active prescription', async status => {
  mock.care.mockResolvedValue({ data: { status }, error: null }); render(view());
  await screen.findByText(status === 'pending' ? 'Vínculo em Análise' : 'Sem acompanhamento ativo');
  expect(mock.plan).not.toHaveBeenCalled();
});
it('a pending legacy link remains pending even when the care source was active', async () => {
  mock.read.mockImplementation(table => ({ data: table === 'nutritionist_patients' ? { status: 'pending' } : null, error: null }));
  render(view()); await screen.findByText('Vínculo em Análise'); expect(mock.plan).not.toHaveBeenCalled();
});
it('keeps the nutritional targets and meal totals of a confirmed active snapshot', async () => {
  mock.read.mockImplementation(table => ({ data: table === 'meals' ? [{ total_calories: 320, total_protein: 10 }] : null, count: 1, error: null }));
  render(view()); await screen.findByText('Plano fictício atual'); expect(screen.getByText('Energia fictícia: 320')).toBeInTheDocument();
  expect(screen.getByText('1 refeição')).toBeInTheDocument();
});
it.each(['appointments', 'meals', 'nutritionist_patients'])('does not disguise failure of %s as empty data', async failed => {
  mock.read.mockImplementation(table => ({ data: null, error: table === failed ? new Error('Failed to fetch') : null }));
  render(view()); expect(await screen.findByRole('alert')).toHaveTextContent('conexão');
  expect(screen.queryByText('Registrar Alimentação')).not.toBeInTheDocument();
});
it('a failed relationship does not become an unlinked relationship', async () => {
  mock.care.mockResolvedValue({ data: null, error: new Error('Failed to fetch') }); render(view());
  expect(await screen.findByRole('alert')).toHaveTextContent('conexão'); expect(screen.queryByText('Sem acompanhamento ativo')).not.toBeInTheDocument();
});
it('clears the active snapshot immediately on access invalidation and rejects stale private data on 403', async () => {
  render(view()); await screen.findByText('Plano fictício atual'); const pending = deferred(); mock.care.mockReturnValue(pending.promise);
  await act(async () => { invalidateDomain('synthetic-a', 'access'); await new Promise(r => setTimeout(r, 130)); });
  expect(screen.queryByText('Plano fictício atual')).not.toBeInTheDocument();
  await act(async () => pending.resolve({ data: null, error: { code: '42501' } }));
  expect(screen.getByRole('alert')).toHaveTextContent('permissão');
});
it('updates from active to ended on an access signal without an Auth object change', async () => {
  render(view()); await screen.findByText('Plano fictício atual'); mock.care.mockResolvedValue({ data: { status: 'ended' }, error: null });
  await act(async () => { invalidateDomain('synthetic-a', 'access'); await new Promise(r => setTimeout(r, 130)); });
  expect(await screen.findByText('Sem acompanhamento ativo')).toBeInTheDocument(); expect(screen.queryByText('Plano fictício atual')).not.toBeInTheDocument();
});
it('coalesces profile and clinical reconciliation and retries a transient error explicitly', async () => {
  render(view()); await screen.findByText('Plano fictício atual'); mock.plan.mockResolvedValue({ data: null, error: new Error('Failed to fetch') });
  await act(async () => { invalidateDomain('synthetic-a', 'profile'); invalidateDomain('synthetic-a', 'clinical'); await new Promise(r => setTimeout(r, 150)); });
  expect(mock.care).toHaveBeenCalledTimes(2); mock.plan.mockResolvedValue(prescription('Plano fictício recuperado'));
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' })); await screen.findByText('Plano fictício recuperado');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('reloads a real relationship identity change while a name-only update does not reload', async () => {
  const app = render(view()); await screen.findByText('Plano fictício atual');
  mock.user = { ...mock.user, profile: { ...mock.user.profile, name: 'Nome fictício novo' } }; app.rerender(view());
  expect(mock.care).toHaveBeenCalledTimes(1);
  mock.user = { ...mock.user, profile: { ...mock.user.profile, nutritionist_id: 'synthetic-new-n' } }; app.rerender(view());
  await waitFor(() => expect(mock.care).toHaveBeenCalledTimes(2));
});
it('an unmounted read aborts parallel scoped transports and ignores late results', async () => {
  const pending = deferred(); mock.plan.mockReturnValue(pending.promise); const app = render(view());
  await waitFor(() => expect(mock.plan).toHaveBeenCalledTimes(1));
  const signal = mock.care.mock.calls[0][0].signal; app.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve(prescription('Plano abandonado fictício')));
  expect(mock.read.mock.calls.filter(([table]) => table === 'appointments')).toHaveLength(1);
  expect(mock.read.mock.calls.filter(([table]) => ['appointments','meals'].includes(table)).every(([,filters])=>filters.signal.aborted)).toBe(true);
});
it('times out a stalled helper and distinguishes timeout from a confirmed empty result', async () => {
  vi.useFakeTimers(); mock.plan.mockReturnValue(new Promise(() => {})); render(view());
  await act(async () => { await vi.advanceTimersByTimeAsync(15001); });
  expect(screen.getByRole('alert')).toHaveTextContent('demorou');
  cleanup(); vi.useRealTimers();
});
