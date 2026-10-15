import React from 'react';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, screen, fireEvent } from '@testing-library/react';
import AdminSourceStatus from './AdminSourceStatus';
vi.mock('../hooks/useAdminSource',()=>({accessDenied:error=>error?.status===403}));
let io;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  vi.spyOn(document,'hidden','get').mockReturnValue(false);
  vi.stubGlobal('IntersectionObserver',class{constructor(callback){io=callback}observe(){}unobserve(){}disconnect(){}});
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals()});
const query=()=>({data:{generated_at:new Date().toISOString(),source:'Fonte fictícia'},isError:false,isPending:false,isFetching:false,refetch:vi.fn()});
function show(ui){act(()=>io([{target:ui.container.firstChild,isIntersecting:true}]))}
it('avoids recurring display ticks while the source is offscreen or hidden',()=>{
  const interval=vi.spyOn(window,'setInterval');const q=query();render(<AdminSourceStatus query={q}/>);
  expect(interval).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it('keeps automatic refresh silent with stable copy and no spinning icon',()=>{
  const q=query();const ui=render(<AdminSourceStatus query={q}/>);
  const button=screen.getByRole('button',{name:'Atualizar'});
  ui.rerender(<AdminSourceStatus query={{...q,isFetching:true}}/>);
  expect(screen.getByRole('button',{name:'Atualizar'})).toBe(button);
  expect(button).toBeDisabled();expect(button).toHaveAttribute('aria-busy','true');
  expect(ui.container.querySelector('.animate-spin')).toBeNull();
  expect(screen.queryByText(/Atualizando/)).not.toBeInTheDocument();
  expect(q.refetch).not.toHaveBeenCalled();
});
it('changes freshness at the exact boundary and recomputes after hidden time',()=>{
  const q=query();const ui=render(<AdminSourceStatus query={q}cadenceMs={1000}/>);show(ui);
  expect(screen.getByText('Consulta recente')).toBeInTheDocument();expect(vi.getTimerCount()).toBe(1);
  act(()=>vi.advanceTimersByTime(2000));expect(screen.getByText('Consulta recente')).toBeInTheDocument();
  act(()=>vi.advanceTimersByTime(1));expect(screen.getByText('Dados atrasados')).toBeInTheDocument();expect(vi.getTimerCount()).toBe(0);
  ui.rerender(<AdminSourceStatus query={{...q,data:{generated_at:new Date().toISOString()}}}cadenceMs={1000}/>);
  vi.spyOn(document,'hidden','get').mockReturnValue(true);act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(vi.getTimerCount()).toBe(0);
  act(()=>vi.advanceTimersByTime(10000));vi.spyOn(document,'hidden','get').mockReturnValue(false);act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(screen.getByText('Dados atrasados')).toBeInTheDocument();
});
it('handles future timestamps, unknown data and replacement deadlines without polling',()=>{
  const q=query();q.data.generated_at=new Date(Date.now()+6000).toISOString();const ui=render(<AdminSourceStatus query={q}cadenceMs={1000}/>);show(ui);
  expect(screen.getByText('Atualização desconhecida')).toBeInTheDocument();act(()=>vi.advanceTimersByTime(1000));expect(screen.getByText('Consulta recente')).toBeInTheDocument();
  ui.rerender(<AdminSourceStatus query={{...q,data:{generated_at:'invalid'}}}/>);expect(vi.getTimerCount()).toBe(0);expect(screen.getByText('Atualização desconhecida')).toBeInTheDocument();
});
it('preserves recovery and denial copy; errors never authorize or start display clocks',()=>{
  const q={...query(),isError:true,error:{status:403}};const ui=render(<AdminSourceStatus query={q}/>);show(ui);
  expect(screen.getByText('Acesso à fonte não confirmado')).toBeInTheDocument();expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByRole('button',{name:'Atualizar'}));expect(q.refetch).toHaveBeenCalledOnce();
  ui.rerender(<AdminSourceStatus query={{...q,isFetching:true}}/>);expect(screen.getByRole('button',{name:'Atualizar'})).toBeDisabled();
});
it('cleans the scheduled boundary when unmounted and does not refetch at expiry',()=>{
  const q=query();const ui=render(<AdminSourceStatus query={q}/>);show(ui);expect(vi.getTimerCount()).toBe(1);ui.unmount();expect(vi.getTimerCount()).toBe(0);expect(q.refetch).not.toHaveBeenCalled();
});
