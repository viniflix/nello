import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PatientMetricsWidget from './PatientMetricsWidget';
import { invalidateDomain } from '@/infrastructure/realtime/events';
import { advanceAccessEpoch } from '@/infrastructure/realtime/accessEpochState';
import { fireEvent } from '@testing-library/react';

const mock = vi.hoisted(() => ({ user: null, results: {}, reads: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: table => {
  const filters = {};
  const query = {
    select: () => query, order: () => query, limit: () => query, not: () => query, gt: () => query, lt: () => query, gte: () => query, lte: () => query,
    eq: (key, value) => { filters[key] = value; return query; },
    then: (resolve, reject) => {
      mock.reads(table, filters);
      return Promise.resolve(mock.results[table] || { data: [], error: null }).then(resolve, reject);
    },
  };
  return query;
} } }));

beforeEach(() => {
  mock.user = { id: 'synthetic-a', profile: {} };
  mock.reads.mockReset();
  mock.results = {
    growth_records: { data: [{ id: 'clinical', weight: 70, record_date: '2026-10-20', source: 'clinical', status: 'active', is_latest_revision: true }], error: null },
    patient_progress_measurements: { data: [{ id: 'self', weight: 71, record_date: '2026-10-21' }], error: null },
    glycemia_records: { data: [{ id: 'glucose', value: 99, date: '2026-10-21' }], error: null },
  };
});
afterEach(cleanup);
const view = () => <MemoryRouter><PatientMetricsWidget /></MemoryRouter>;

describe('patient indicators use confirmed readings', () => {
  it('shows the latest self-reported weight and existing glucose with semantic navigation', async () => {
    render(view());
    expect(await screen.findByText('71')).toBeInTheDocument();
    expect(await screen.findByText('99')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Meus Indicadores/ })).toHaveAttribute('href', '/patient/progresso');
    expect(mock.reads).toHaveBeenCalledWith('growth_records', expect.objectContaining({ patient_id: 'synthetic-a', status: 'active', is_latest_revision: true }));
  });

  it('distinguishes a failed weight source from confirmed absence without hiding glucose', async () => {
    mock.results.growth_records = { data: null, error: { status: 503, message: 'Synthetic outage' } };
    render(view());
    expect(await screen.findByText(/indisponível/i)).toBeInTheDocument();
    expect(screen.getByText('99')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeInTheDocument();
  });

  it('does not reload sources when the same account receives a new Auth object', async () => {
    const { rerender } = render(view());
    await waitFor(() => expect(mock.reads).toHaveBeenCalledTimes(3));
    mock.user = { ...mock.user };
    rerender(view());
    await act(async () => {});
    expect(mock.reads).toHaveBeenCalledTimes(3);
  });
});

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
it('publishes glucose while the independent weight source is still pending',async()=>{
 const pending=deferred();mock.results.growth_records=pending.promise;render(view());
 expect(await screen.findByText('99')).toBeVisible();
 await act(async()=>pending.resolve({data:[],error:null}));
 expect(await screen.findByText('71')).toBeVisible();
});
it('keeps confirmed values during a failed refresh and offers a successful retry',async()=>{
 render(view());await screen.findByText('71');
 mock.results.growth_records={data:null,error:{status:503,message:'Synthetic outage'}};
 await act(async()=>{invalidateDomain('synthetic-a','clinical');await new Promise(r=>setTimeout(r,130));});
 expect(screen.getByText('71')).toBeVisible();expect(await screen.findByRole('alert')).toHaveTextContent(/indisponível/i);
 mock.results.growth_records={data:[{id:'new',weight:72,record_date:'2026-10-22'}],error:null};
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:/Tentar novamente/})));
 expect(await screen.findByText('72')).toBeVisible();expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('clears every indicator after a denied source and ignores a late sibling',async()=>{
 const late=deferred();mock.results.glycemia_records=late.promise;mock.results.growth_records={data:null,error:{status:403,message:'Forbidden'}};
 render(view());await screen.findByRole('alert');
 await act(async()=>late.resolve({data:[{id:'late',value:150,date:'2026-10-21'}],error:null}));
 expect(screen.queryByText('150')).not.toBeInTheDocument();expect(screen.queryByText('71')).not.toBeInTheDocument();
});
it('hides the confirmed context immediately when the access epoch changes',async()=>{
 render(view());await screen.findByText('71');
 const pending=deferred();for(const table of Object.keys(mock.results))mock.results[table]=pending.promise;
 await act(async()=>advanceAccessEpoch('synthetic-a'));
 expect(screen.queryByText('71')).not.toBeInTheDocument();expect(screen.queryByText('99')).not.toBeInTheDocument();
 await act(async()=>pending.resolve({data:[],error:null}));
});
it('removes the entire old account view on logout',async()=>{
 const app=render(view());await screen.findByText('71');mock.user=null;app.rerender(view());
 expect(screen.queryByText('71')).not.toBeInTheDocument();expect(screen.queryByText('99')).not.toBeInTheDocument();
});

it.each([[70.002,70.001,'Aumento'],[70.001,70.002,'Redução']])('keeps %s versus %s below the displayed 0.01 kg precision',async(latest,previous,direction)=>{
 mock.results.growth_records={data:[{id:1,weight:latest,record_date:'2026-10-21'},{id:2,weight:previous,record_date:'2026-10-20'}],error:null};mock.results.patient_progress_measurements={data:[],error:null};
 render(view());await screen.findByText(String(latest));expect(screen.getByText(direction+' inferior a 0,01 kg',{exact:false})).toBeVisible();
});
