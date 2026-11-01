import { cleanup, render, screen } from '@testing-library/react';
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
vi.mock('@/components/patient/RecentAchievementsWidget', () => ({ default: () => <div /> }));
vi.mock('@/components/patient/PatientPendingCheckinsWidget', () => ({ default: () => <div /> }));
vi.mock('@/components/NotificationsPanel', () => ({ default: () => <div /> }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: table => {
  const filters = {};
  const query = { select: () => query, in: () => query, gte: () => query, order: () => query,
    limit: () => query, gt: () => query, lt: () => query, lte: () => query, is: () => query, abortSignal: signal => { filters.signal = signal; return query; },
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


it('mounts one real indicator card and reads each source once across responsive layouts',async()=>{
 const rows={growth_records:[{id:'clinical',weight:70,record_date:'2026-10-20',status:'active',is_latest_revision:true}],patient_progress_measurements:[{id:'self',weight:71,record_date:'2026-10-21'}],glycemia_records:[{id:'glucose',value:99,date:'2026-10-21'}]};
 mock.read.mockImplementation(table=>({data:rows[table] || (table==='meals'?[]:null),error:null,count:0}));
 render(view());
 expect(await screen.findAllByRole('link',{name:'Meus Indicadores',exact:true})).toHaveLength(1);
 expect(await screen.findByText('71')).toBeVisible();expect(screen.getByText('99')).toBeVisible();
 for(const table of Object.keys(rows))expect(mock.read.mock.calls.filter(call=>call[0]===table)).toHaveLength(1);
});
