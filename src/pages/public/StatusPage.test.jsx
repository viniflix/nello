import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import StatusPage from './StatusPage';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });
const body = () => ({ schemaVersion: 1, checkedAt: new Date().toISOString(), status: 'operational', checks: { auth: 'operational', database: 'operational', storage: 'operational' } });
it('reports verified availability and dependency states', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body()), { headers: { 'content-type': 'application/json' } })));
  render(<MemoryRouter><StatusPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText((_, element) => element.tagName === 'P' && element.textContent === 'Autenticação: Operacional')).toBeInTheDocument());
  expect(screen.getByText((_, element) => element.tagName === 'P' && element.textContent === 'Banco de dados: Operacional')).toBeInTheDocument();
});
it.each(['html', 'stale', 'contradictory', 'outage'])('does not show a green status for %s', async mode => {
  const payload = body();
  if (mode === 'stale') payload.checkedAt = '2020-01-01T00:00:00Z';
  if (mode === 'contradictory') payload.status = 'degraded';
  if (mode === 'outage') { payload.status = 'unavailable'; payload.checks = { auth: 'unavailable', database: 'unavailable', storage: 'unavailable' }; }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(mode === 'html' ? '<html>Nello</html>' : JSON.stringify(payload), {
    status: mode === 'outage' ? 503 : 200, headers: { 'content-type': mode === 'html' ? 'text/html' : 'application/json' },
  })));
  render(<MemoryRouter><StatusPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('heading', { level: 2,
    name: mode === 'outage' ? 'Indisponível' : 'Não foi possível verificar a disponibilidade' })).toBeInTheDocument());
  expect(screen.queryByText((_, element) => element.tagName === 'P' && element.textContent === 'Autenticação: Operacional')).not.toBeInTheDocument();
});
it('suspends hidden polling and discards an aborted result after visibility returns', async () => {
 vi.useFakeTimers();
 let hidden=false;
 vi.spyOn(document,'hidden','get').mockImplementation(() => hidden);
 let resolveOld;
 const fetcher=vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld=resolve; })).mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body()),{headers:{'content-type':'application/json'}})));
 vi.stubGlobal('fetch',fetcher);
 const {unmount}=render(<MemoryRouter><StatusPage /></MemoryRouter>);
 expect(fetcher).toHaveBeenCalledTimes(1);
 const oldSignal=fetcher.mock.calls[0][1].signal;
 hidden=true;
 await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(90000); });
 expect(oldSignal.aborted).toBe(true);
 expect(fetcher).toHaveBeenCalledTimes(1);
 hidden=false;
 await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
 expect(fetcher).toHaveBeenCalledTimes(2);
 await act(async () => resolveOld(new Response('<html/>',{headers:{'content-type':'text/html'}})));
 expect(screen.queryByText('Não foi possível verificar a disponibilidade')).not.toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Operacional'})).toBeInTheDocument();
 unmount();
 await act(async () => { await vi.advanceTimersByTimeAsync(90000); });
 expect(fetcher).toHaveBeenCalledTimes(2);
});
