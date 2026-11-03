import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {invalidateDomain} from '@/infrastructure/realtime/events';
import FinancialPage from './FinancialPage';
const mocks=vi.hoisted(()=>({userId:'synthetic-finance-projection',projection:vi.fn(),rows:vi.fn(),services:vi.fn(),save:vi.fn(),toast:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:mocks.userId}})}));
vi.mock('@/components/ui/use-toast',()=>({useToast:()=>({toast:mocks.toast})}));
vi.mock('@/infrastructure/analytics/posthog',()=>({track:vi.fn(),Events:{}}));
vi.mock('@/lib/supabase/profile-queries',()=>({getClinicSettings:async()=>({monthlyFinancialGoal:100})}));
vi.mock('@/lib/supabase/financial-queries',()=>({getFinancialMonthRows:mocks.rows,getProjectedCashFlow:mocks.projection,getPendingPayments:async()=>[],getPatientsForAutocomplete:async()=>[],getServices:mocks.services,saveService:vi.fn(),deleteService:vi.fn(),saveTransaction:mocks.save,saveMultipleTransactions:vi.fn(),deleteTransaction:vi.fn(),updateTransactionStatus:vi.fn(),refundTransaction:vi.fn(),getFinancialTransactionById:vi.fn()}));
vi.mock('@/components/ui/visible-chart',()=>({VisibleChart:()=>null}));
vi.mock('@/components/financial/PendingPaymentsWidget',()=>({default:()=>null}));
vi.mock('@/components/financial/TopPatientsWidget',()=>({default:()=>null}));
vi.mock('@/components/financial/TransactionDialog',()=>({default:({open,onSave})=>open?<button onClick={()=>{void onSave({type:'income',amount:1,status:'paid',transaction_date:'2026-11-02'});}}>Submit transaction fixture</button>:null}));
vi.mock('@/components/financial/ServicesManager',()=>({default:()=>null}));
vi.mock('@/components/financial/FinancialSummaryDialog',()=>({default:()=>null}));
const points=[{date:'2026-11-02',balance:42.10}];
const mount=()=>render(<MemoryRouter><FinancialPage/></MemoryRouter>);
const ready=()=>waitFor(()=>expect(screen.getByRole('button',{name:'Exportar mês',exact:true})).toBeEnabled());
async function openProjection(){await act(async()=>{fireEvent.mouseDown(screen.getByRole('tab',{name:'Análises',exact:true}),{button:0,ctrlKey:false});});await act(async()=>{fireEvent.mouseDown(screen.getByRole('tab',{name:'Projeção (30 dias)',exact:true}),{button:0,ctrlKey:false});});}
async function refresh(){await act(async()=>{invalidateDomain(mocks.userId,'clinical');await new Promise(resolve=>setTimeout(resolve,130));});}
beforeEach(()=>{vi.clearAllMocks();mocks.userId='synthetic-finance-projection';mocks.rows.mockResolvedValue([]);mocks.services.mockResolvedValue([]);mocks.save.mockResolvedValue({id:99});mocks.projection.mockResolvedValue(points);});
describe('projection reads require intent and retain financial authorization',()=>{
 it('does not read a projection on entry, ordinary refresh or opening analysis expenses',async()=>{
  mount();await ready();expect(mocks.projection).not.toHaveBeenCalled();await refresh();expect(mocks.projection).not.toHaveBeenCalled();
  fireEvent.mouseDown(screen.getByRole('tab',{name:'Análises',exact:true}),{button:0,ctrlKey:false});await screen.findByRole('tab',{name:'Projeção (30 dias)',exact:true});expect(mocks.projection).not.toHaveBeenCalled();
  fireEvent.mouseDown(screen.getByRole('tab',{name:'Projeção (30 dias)',exact:true}),{button:0,ctrlKey:false});await screen.findByText(/42,10/);expect(mocks.projection).toHaveBeenCalledTimes(1);
 });
 it('refreshes a requested projection while retaining its last confirmed data',async()=>{
  mount();await ready();await openProjection();await screen.findByText(/42,10/);
  let finish;mocks.projection.mockReturnValue(new Promise(resolve=>{finish=resolve}));await refresh();expect(mocks.projection).toHaveBeenCalledTimes(2);expect(screen.getByText(/42,10/)).toBeInTheDocument();
  await act(async()=>{finish([{date:'2026-11-02',balance:43.20}]);});await screen.findByText(/43,20/);
 });
 it('shows an explicit projection error and retries it without repeating unrelated financial reads',async()=>{
  mocks.projection.mockRejectedValue({status:503});mount();await ready();await openProjection();await screen.findByText('Projeção indisponível.');const rows=mocks.rows.mock.calls.length,services=mocks.services.mock.calls.length;
  mocks.projection.mockResolvedValue(points);fireEvent.click(within(screen.getByRole('tabpanel',{name:'Projeção (30 dias)',exact:true})).getByRole('button',{name:'Tentar novamente',exact:true}));await screen.findByText(/42,10/);
  expect(mocks.rows).toHaveBeenCalledTimes(rows);expect(mocks.services).toHaveBeenCalledTimes(services);
 });
 it.each([401,403])('removes the entire financial workspace after requested projection HTTP%i',async status=>{
  mocks.projection.mockRejectedValue({status});mount();await ready();await openProjection();await waitFor(()=>expect(screen.queryByRole('region',{name:'Gestão financeira'})).not.toBeInTheDocument());expect(screen.queryByText(/42,10/)).not.toBeInTheDocument();
 });
 it('aborts a pending projection transport on unmount and ignores its late completion',async()=>{
  let signal,finish;mocks.projection.mockImplementation((_owner,_date,options)=>{signal=options?.signal;return new Promise(resolve=>{finish=resolve});});const view=mount();await ready();await openProjection();await waitFor(()=>expect(mocks.projection).toHaveBeenCalledTimes(1));expect(signal).toBeDefined();expect(within(screen.getByRole('tabpanel',{name:'Projeção (30 dias)',exact:true})).getByRole('status')).toHaveTextContent('Carregando projeção...');view.unmount();expect(signal.aborted).toBe(true);await act(async()=>{finish(points);});
 });
 it('aborts the prior owner and waits for fresh intent after the owner changes',async()=>{
  let signal,finish;mocks.projection.mockImplementation((_owner,_date,options)=>{signal=options?.signal;return new Promise(resolve=>{finish=resolve});});const view=mount();await ready();await openProjection();await waitFor(()=>expect(mocks.projection).toHaveBeenCalledTimes(1));
  mocks.userId='second-finance-projection';view.rerender(<MemoryRouter><FinancialPage/></MemoryRouter>);await ready();expect(signal?.aborted).toBe(true);expect(mocks.projection).toHaveBeenCalledTimes(1);await act(async()=>{finish(points);});expect(screen.queryByText(/42,10/)).not.toBeInTheDocument();
  mocks.projection.mockResolvedValue([{date:'2026-11-02',balance:84.20}]);await openProjection();await screen.findByText(/84,20/);expect(mocks.projection.mock.calls.at(-1)[0]).toBe('second-finance-projection');expect(screen.queryByText(/42,10/)).not.toBeInTheDocument();
 });
});

function abortableFirstRead(){let signal,calls=0;mocks.projection.mockImplementation((_owner,_date,options)=>{if(calls++===0){signal=options.signal;return new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('read_cancelled','AbortError')),{once:true});});}return Promise.resolve(points);});return()=>signal;}
it('cancels a pending read before reopening the projection queues its replacement',async()=>{
 const firstSignal=abortableFirstRead();mount();await ready();await openProjection();await waitFor(()=>expect(mocks.projection).toHaveBeenCalledTimes(1));
 fireEvent.mouseDown(screen.getByRole('tab',{name:'Despesas',exact:true}),{button:0,ctrlKey:false});fireEvent.mouseDown(screen.getByRole('tab',{name:'Projeção (30 dias)',exact:true}),{button:0,ctrlKey:false});
 await waitFor(()=>expect(firstSignal().aborted).toBe(true));await screen.findByText(/42,10/);expect(mocks.projection).toHaveBeenCalledTimes(2);
});
it('cancels a pending read before the post-mutation refresh queues its replacement',async()=>{
 const firstSignal=abortableFirstRead();mount();await ready();await openProjection();await waitFor(()=>expect(mocks.projection).toHaveBeenCalledTimes(1));fireEvent.click(screen.getByRole('button',{name:'Nova Transação',exact:true}));fireEvent.click(await screen.findByRole('button',{name:'Submit transaction fixture',exact:true}));
 await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(1));await waitFor(()=>expect(firstSignal().aborted).toBe(true));await screen.findByText(/42,10/);expect(mocks.projection).toHaveBeenCalledTimes(2);
});
it('coalesces a background invalidation without aborting a read that is already progressing',async()=>{
 let signal,finish,calls=0;mocks.projection.mockImplementation((_owner,_date,options)=>{if(calls++===0){signal=options.signal;return new Promise(resolve=>{finish=resolve;});}return Promise.resolve([{date:'2026-11-02',balance:43.20}]);});
 mount();await ready();await openProjection();await waitFor(()=>expect(mocks.projection).toHaveBeenCalledTimes(1));await refresh();expect(signal.aborted).toBe(false);expect(mocks.projection).toHaveBeenCalledTimes(1);await act(async()=>{finish(points);});await screen.findByText(/43,20/);expect(mocks.projection).toHaveBeenCalledTimes(2);
});
