import {invalidateDomain} from '@/infrastructure/realtime/events';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PatientDiaryPage from './PatientDiaryPage';
import PatientProfilePage from './PatientProfilePage';
import PatientAchievementsPage from './PatientAchievementsPage';
import PatientMetricsWidget from '@/components/patient/PatientMetricsWidget';
import RecentAchievementsWidget from '@/components/patient/RecentAchievementsWidget';
const mocks = vi.hoisted(() => ({ user: { id: 'synthetic-a', profile: {} }, reads: vi.fn(), plan: vi.fn(), care: vi.fn(), toast: vi.fn(), pending: null, listeners: new Map() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, signOut: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ unreadCount: 0 }) }));
vi.mock('@/components/NotificationsPanel', () => ({ default: () => null }));
vi.mock('@/components/patient/MealPlanViewDialog', () => ({ default: () => null }));
vi.mock('@/components/patient/AvatarUpload', () => ({ default: () => null }));
vi.mock('@/components/shared/ThemeToggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/features/data-portability/components/DataPortabilitySection', () => ({ default: () => null }));
vi.mock('@/features/privacy/components/PatientPrivacyRequests', () => ({ default: () => null }));
vi.mock('@/lib/supabase/meal-plan-queries', () => ({ getActiveMealPlan: mocks.plan }));
vi.mock('@/lib/supabase/patient-queries', () => ({ getMyCareRelationship: mocks.care, endMyCareRelationship: vi.fn() }));
vi.mock('@/lib/supabase/food-diary-queries', () => ({ getPatientReminderPreferences: async () => ({ data: null }), upsertPatientReminderPreferences: vi.fn() }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: table => {
  const query = { select: () => query, eq: () => query, is: () => query, order: () => query, limit: () => query,
    then: (resolve, reject) => { mocks.reads(table); return (mocks.pending || Promise.resolve({ data: [], error: null })).then(resolve, reject); } };
  return query;
} } }));
const cases = [['Diary', PatientDiaryPage], ['Profile', PatientProfilePage], ['Achievements', PatientAchievementsPage], ['Metrics', PatientMetricsWidget], ['RecentAchievements', RecentAchievementsWidget]];
describe('Patient consumers and same-account sessions', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.user = { id: 'synthetic-a', profile: {} }; mocks.pending = null; mocks.plan.mockResolvedValue({ data: null }); mocks.care.mockResolvedValue({ data: null }); });
  it.each(cases)('%s does not repeat queries when only the auth object changes', async (_, Component) => {
    const view = () => <MemoryRouter><Component /></MemoryRouter>;
    const { rerender } = render(view());
    await act(async () => {});
    const count = mocks.reads.mock.calls.length;
    expect(count).toBeGreaterThan(0);
    mocks.user = { ...mocks.user }; rerender(view());
    await act(async () => {});
    expect(mocks.reads).toHaveBeenCalledTimes(count);
  });
  it.each(cases)('%s loads a new account and ignores the pending old response', async (_, Component) => {
    let resolve;
    mocks.pending = new Promise(r => { resolve = r; });
    const view = () => <MemoryRouter><Component /></MemoryRouter>;
    const { rerender } = render(view()); await act(async () => {});
    const count = mocks.reads.mock.calls.length;
    mocks.pending = null; mocks.user = { id: 'synthetic-b', profile: {} }; rerender(view());
    await act(async () => {});
    expect(mocks.reads.mock.calls.length).toBeGreaterThan(count);
    await act(async () => resolve({ data: [{ id: 'synthetic-private', weight: 999, name: 'Private old account', notes: 'Private old account', achievements: { name: 'Private old account' } }], error: null }));
    expect(screen.queryByText('Private old account')).not.toBeInTheDocument();
    expect(screen.queryByText(/999/)).not.toBeInTheDocument();
  });
  it.each(cases)('%s retains clinical invalidation independently of Auth identity', async (_, Component) => {
    render(<MemoryRouter><Component /></MemoryRouter>); await act(async () => {});
    const count = mocks.reads.mock.calls.length;
    await act(async () => { invalidateDomain(mocks.user.id, 'clinical'); await new Promise(resolve => setTimeout(resolve, 130)); });
    expect(mocks.reads.mock.calls.length).toBeGreaterThan(count);
  });
  it('preserves a diary reminder dialog and edited values on renewal', async () => {
    const view = () => <MemoryRouter><PatientDiaryPage /></MemoryRouter>;
    const { rerender } = render(view());
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Configurar lembretes' }));
    const toggle = screen.getByRole('switch', { name: 'Lembrete de diário', exact: true });
    fireEvent.click(toggle);
    mocks.user = { ...mocks.user }; rerender(view());
    await act(async () => {});
    expect(screen.getByRole('dialog', { name: 'Preferências de Lembrete' })).toBeInTheDocument();
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
    expect(mocks.plan).toHaveBeenCalledTimes(1);
  });
  it('loads the new account care relationship', async () => {
    const view = () => <MemoryRouter><PatientProfilePage /></MemoryRouter>;
    const { rerender } = render(view()); await act(async () => {});
    mocks.user = { id: 'synthetic-b', profile: {} }; rerender(view()); await act(async () => {});
    expect(mocks.care).toHaveBeenCalledTimes(2);
  });
  it('refreshes diary data when care context actually changes, preserving reminder edits', async () => {
    const view = () => <MemoryRouter><PatientDiaryPage /></MemoryRouter>;
    const { rerender } = render(view()); await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Configurar lembretes' }));
    const toggle = screen.getByRole('switch', { name: 'Lembrete de diário', exact: true }); fireEvent.click(toggle);
    mocks.user = { ...mocks.user, profile: { nutritionist_id: 'synthetic-new-care', is_active: true } }; rerender(view());
    await act(async () => {});
    expect(mocks.plan).toHaveBeenCalledTimes(2);
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
  });
});

it('refreshes the care relationship on clinical events while joining its pending read',async()=>{
 mocks.user={id:'qa-care-e06',profile:{}};mocks.pending=null;mocks.care.mockReset();const pending=[];mocks.care.mockImplementation(()=>new Promise(resolve=>pending.push(resolve)));
 const view=render(<MemoryRouter><PatientProfilePage/></MemoryRouter>);await act(async()=>{});expect(mocks.care).toHaveBeenCalledTimes(1);
 await act(async()=>{for(let i=0;i<8;i++)invalidateDomain(mocks.user.id,'clinical');await new Promise(resolve=>setTimeout(resolve,130));});expect(mocks.care).toHaveBeenCalledTimes(1);
 await act(async()=>pending.shift()({data:null}));expect(mocks.care).toHaveBeenCalledTimes(2);await act(async()=>pending.shift()({data:null}));view.unmount();
});

it('offers care timeout recovery and preserves the confirmed relationship until a permitted refresh',async()=>{
 mocks.user={id:'qa-care-recovery',profile:{}};mocks.pending=null;mocks.care.mockReset().mockResolvedValueOnce({data:{status:'active'}}).mockResolvedValueOnce({data:null,error:new DOMException('read_deadline','TimeoutError')}).mockResolvedValue({data:{status:'active'}});
 render(<MemoryRouter><PatientProfilePage/></MemoryRouter>);await act(async()=>{});
 await act(async()=>{invalidateDomain(mocks.user.id,'clinical');await new Promise(resolve=>setTimeout(resolve,130));});expect(screen.getByRole('alert')).toHaveTextContent('A resposta demorou demais');
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'})));expect(screen.queryByText('A resposta demorou demais. Tente novamente em alguns instantes.')).not.toBeInTheDocument();expect(mocks.care).toHaveBeenCalledTimes(3);
});
