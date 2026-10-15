import React from 'react';
import { it,expect,vi,beforeEach,afterEach } from 'vitest';
import { render,screen,act,fireEvent,cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import { requestPasswordRecovery } from '@/features/auth/authFlows';
const mocks=vi.hoisted(()=>({signIn:vi.fn(),toast:vi.fn(),reset:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({signIn:mocks.signIn,user:null,loading:false})}));
vi.mock('@/features/auth/AuthCaptcha',()=>({default:()=>null,useAuthCaptcha:()=>({ready:true,options:{},widget:{},reset:mocks.reset})}));
vi.mock('@/components/ui/use-toast',()=>({useToast:()=>({toast:mocks.toast})}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{}}));
vi.mock('@/infrastructure/observability/telemetry',()=>({captureOperationalError:vi.fn()}));
vi.mock('@/infrastructure/analytics/posthog',()=>({Events:{},track:vi.fn()}));
vi.mock('@/features/auth/authFlows',async original=>({...await original(),requestPasswordRecovery:vi.fn()}));
vi.mock('framer-motion',()=>({motion:{div:({children,...props})=>{const {initial,animate,transition,...rest}=props;return <div {...rest}>{children}</div>}}}));
const rateError=()=>({status:429,code:'over_request_rate_limit',message:'QA limit',headers:{'retry-after':'2'}});
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T13:00:00Z'));mocks.signIn.mockResolvedValue({data:null,error:rateError()});requestPasswordRecovery.mockRejectedValue(rateError())});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks()});
function setup(){const ui=render(<MemoryRouter><LoginPage/></MemoryRouter>);fireEvent.change(screen.getByLabelText('Email',{exact:true}),{target:{value:'qa@example.invalid'}});fireEvent.change(screen.getByLabelText('Senha',{exact:true}),{target:{value:crypto.randomUUID()}});return ui;}
async function submit(){await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Entrar',exact:true})))}
it('stops the cooldown clock at expiry without retrying login automatically',async()=>{
 const ui=setup();await submit();const button=screen.getByRole('button',{name:'Entrar',exact:true});expect(button).toBeDisabled();expect(screen.getByRole('status')).toHaveTextContent('2s');
 await act(async()=>vi.advanceTimersByTimeAsync(2000));expect(button).toBeEnabled();expect(screen.queryByRole('status')).toBeNull();expect(mocks.signIn).toHaveBeenCalledOnce();
 const current=vi.getTimerCount();expect(current).toBe(0);await act(async()=>vi.advanceTimersByTimeAsync(10000));expect(vi.getTimerCount()).toBe(0);ui.unmount();
});
it('rearms from the current clock after a long idle and preserves entered fields',async()=>{
 setup();await submit();await act(async()=>vi.advanceTimersByTimeAsync(2000));await act(async()=>vi.advanceTimersByTimeAsync(60000));await submit();
 expect(screen.getByRole('status')).toHaveTextContent('2s');expect(screen.getByLabelText('Email',{exact:true})).toHaveValue('qa@example.invalid');expect(screen.getByLabelText('Senha',{exact:true}).value.length).toBeGreaterThan(0);
 await act(async()=>vi.advanceTimersByTimeAsync(1000));expect(screen.getByRole('status')).toHaveTextContent('1s');expect(mocks.signIn).toHaveBeenCalledTimes(2);
});
it('uses the same bounded clock for password recovery without sending another message',async()=>{
 setup();fireEvent.click(screen.getByRole('button',{name:'Esqueceu a senha?'}));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Enviar link',exact:true})));
 expect(requestPasswordRecovery).toHaveBeenCalledOnce();await act(async()=>vi.advanceTimersByTimeAsync(2000));expect(vi.getTimerCount()).toBe(0);expect(requestPasswordRecovery).toHaveBeenCalledOnce();
});
it('releases its active clock on unmount',async()=>{const ui=setup();await submit();expect(vi.getTimerCount()).toBeGreaterThan(0);ui.unmount();expect(vi.getTimerCount()).toBe(0)});
