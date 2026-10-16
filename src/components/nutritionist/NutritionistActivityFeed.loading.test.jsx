import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NutritionistActivityFeed from './NutritionistActivityFeed';
const mocks = vi.hoisted(() => ({ user: { id: 'synthetic-a' }, activities: vi.fn(), sync: vi.fn(), patients: vi.fn(), labs:vi.fn(), payments:vi.fn(), appointments:vi.fn(), adherence:vi.fn(), pending:vi.fn(), rules:vi.fn(), states:vi.fn(), listeners: new Map() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/infrastructure/analytics/posthog', () => ({ Events: {}, track: vi.fn() }));
vi.mock('@/infrastructure/realtime/events', () => ({ subscribeDomain: (id, domain, fn) => { mocks.listeners.set(domain, fn); return () => mocks.listeners.delete(domain); } }));
vi.mock('@/lib/supabase/patient-query-feed', () => ({ retryFeedTaskSync: vi.fn(), clearActivityFeedCache: vi.fn() }));
vi.mock('@/lib/supabase/financial-queries', () => ({ getPendingPayments: mocks.payments }));
vi.mock('@/lib/supabase/patient-queries', () => ({
  getComprehensiveActivityFeed: mocks.activities, getNutritionistPatientsForFeed: mocks.patients, syncFeedTasksFromItems: mocks.sync,
  getPatientsWithLowAdherence: mocks.adherence, getPatientsPendingData: mocks.pending,
  getFeedPriorityRules: mocks.rules, getPatientsHighRiskLabAlerts: mocks.labs, getFeedTaskStates: mocks.states,
  attachFeedPriorityMeta: items => items, resolveFeedTask: vi.fn(), resolveFeedTasksBatch: vi.fn(), getFeedTaskAuditTrail: async () => ({ data: [] }),
}));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: () => { const query = { select: () => query, eq: () => query, gte: () => query, order: () => query, limit: mocks.appointments }; return query; } } }));
const view = () => <MemoryRouter><NutritionistActivityFeed /></MemoryRouter>;
async function selectItem() {
  await screen.findByText('Synthetic activity');
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar itens' }));
  const card = screen.getByText('Synthetic activity').closest('article');
  fireEvent.click(card.querySelector('button'));
  expect(screen.getByText('1 selecionado(s)')).toBeInTheDocument();
}
describe('Feed session and selection', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.user = { id: 'synthetic-a' }; mocks.patients.mockResolvedValue({ data: [{ id: 'synthetic-patient', name: 'Synthetic', care_episode_id: 'synthetic-episode' }] }); mocks.activities.mockResolvedValue({ data: [{ id: 'synthetic-item', type: 'meal', patient_id: 'synthetic-patient', patient_name: 'Synthetic', title: 'Synthetic activity', cta: { label: 'Ver', route: '/synthetic' } }] }); mocks.sync.mockResolvedValue({ data: [], failedItems: [] }); });
  beforeEach(()=>{for(const key of ['labs','appointments','adherence','pending','rules','states'])mocks[key].mockResolvedValue({data:[]});mocks.payments.mockResolvedValue([]);});
  it('keeps selection and does not sync again for a same-account object', async () => {
    const { rerender } = render(view()); await selectItem();
    mocks.user = { ...mocks.user }; rerender(view()); await act(async () => {});
    expect(mocks.activities).toHaveBeenCalledTimes(1);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1 selecionado(s)')).toBeInTheDocument();
  });
  it('preserves a still-valid selection after focus refresh', async () => {
    render(view()); await selectItem(); fireEvent(window, new Event('focus'));
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('1 selecionado(s)')).toBeInTheDocument();
  });
  it('clears selection when the selected patient moves to another care episode', async () => {
    render(view()); await selectItem();
    mocks.patients.mockResolvedValue({ data: [{ id: 'synthetic-patient', name: 'Synthetic', care_episode_id: 'synthetic-new-episode' }] });
    act(() => mocks.listeners.get('access')());
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(2));
    await screen.findByText('Synthetic activity');
    expect(screen.queryByText('1 selecionado(s)')).not.toBeInTheDocument();
    expect(mocks.sync.mock.calls.at(-1)[1][0].careEpisodeId).toBe('synthetic-new-episode');
  });
  it('does not sync an old account load after switching accounts', async () => {
    let resolve; mocks.activities.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const { rerender } = render(view()); await act(async () => {});
    mocks.user = { id: 'synthetic-b' }; rerender(view());
    await screen.findByText('Synthetic activity');
    await act(async () => resolve({ data: [] }));
    expect(mocks.sync.mock.calls.every(([id]) => id === 'synthetic-b')).toBe(true);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });
  it('keeps the selected card and focus visible while background work is pending', async () => {
    render(view()); await selectItem();
    const control=screen.getByRole('button',{name:'Cancelar seleção'});control.focus();
    let finish;mocks.activities.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
    fireEvent(window,new Event('focus'));await waitFor(()=>expect(mocks.activities).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Synthetic activity')).toBeInTheDocument();
    expect(screen.getByText('1 selecionado(s)')).toBeInTheDocument();expect(document.activeElement).toBe(control);
    expect(screen.getByRole('button',{name:'Marcar como resolvido'})).toBeDisabled();
    expect(screen.queryByText(/Atualizando/i)).not.toBeInTheDocument();
    await act(async()=>finish({data:[]}));
  });
  it('preserves a confirmed card on transient background failure', async () => {
    render(view());await selectItem();mocks.activities.mockResolvedValueOnce({data:[],error:{status:503}});fireEvent(window,new Event('focus'));
    await screen.findByRole('alert');expect(screen.getByText('Synthetic activity')).toBeInTheDocument();expect(screen.getByText('1 selecionado(s)')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Marcar como resolvido'})).toBeDisabled();
  });
  it('removes private cards on denied background failure', async () => {
    render(view());await selectItem();mocks.activities.mockResolvedValueOnce({data:[],error:{status:403}});fireEvent(window,new Event('focus'));
    await screen.findByRole('alert');expect(screen.queryByText('Synthetic activity')).toBeNull();expect(screen.queryByText('1 selecionado(s)')).toBeNull();
  });
  it.each([
    ['activities','Atividades'],['labs','Risco laboratorial'],['payments','Pagamentos'],['appointments','Consultas'],
    ['adherence','Adesão'],['pending','Pendências'],['rules','Regras de prioridade'],['states','Estado das tarefas'],['patients','Pacientes'],
  ])('never presents an unavailable %s source as an empty successful feed',async(key,label)=>{
    mocks[key].mockRejectedValueOnce({status:503});render(view());
    const alert=await screen.findByRole('alert');expect(alert).toHaveTextContent(label);
    expect(screen.queryByText('Tudo em dia!')).toBeNull();expect(mocks.sync).not.toHaveBeenCalled();
  });
  it('retains a confirmed snapshot on laboratory outage and recovers through refresh',async()=>{
    render(view());await selectItem();mocks.labs.mockResolvedValueOnce({data:[],error:{status:503}});
    fireEvent(window,new Event('focus'));expect(await screen.findByRole('alert')).toHaveTextContent('Risco laboratorial');
    expect(screen.getByText('Synthetic activity')).toBeInTheDocument();expect(mocks.sync).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button',{name:'Tentar novamente',exact:true}));
    await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());expect(mocks.sync).toHaveBeenCalledTimes(2);
  });
  it('removes private snapshot on a denied laboratory source',async()=>{
    render(view());await selectItem();mocks.labs.mockResolvedValueOnce({data:[],error:{status:403}});fireEvent(window,new Event('focus'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Risco laboratorial');expect(screen.queryByText('Synthetic activity')).toBeNull();
  });
  it('uses a new result identity despite a resolved legacy marker and withdraws it after normalization',async()=>{
    mocks.states.mockResolvedValue({data:[{source_type:'lab_high_risk',source_id:'synthetic-patient-marker',patient_id:'synthetic-patient',status:'resolved',metadata:{care_episode_id:'synthetic-episode'}}]});
    mocks.labs.mockResolvedValue({data:[{result_id:'revision-two',patient_id:'synthetic-patient',marker_key:'marker',test_name:'Synthetic lab',test_value:200,test_unit:'mg/dL'}]});
    render(view());await screen.findByText('Exame com risco alto');
    const item=mocks.sync.mock.calls[0][1].find(i=>i.type==='lab_high_risk');expect(item.sourceId).toBe('lab-result:revision-two');
    mocks.labs.mockResolvedValue({data:[]});fireEvent(window,new Event('focus'));
    await waitFor(()=>expect(screen.queryByText('Exame com risco alto')).toBeNull());
  });
});
