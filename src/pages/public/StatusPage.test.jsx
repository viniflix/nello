import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import StatusPage from './StatusPage';

afterEach(() => vi.unstubAllGlobals());
const body = () => ({ schemaVersion: 1, checkedAt: new Date().toISOString(), status: 'operational', checks: { auth: 'operational', database: 'operational', storage: 'operational' } });
it('reports verified availability and dependency states', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body()), { headers: { 'content-type': 'application/json' } })));
  render(<MemoryRouter><StatusPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Autenticação: Operacional')).toBeInTheDocument());
  expect(screen.getByText('Banco de dados: Operacional')).toBeInTheDocument();
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
  expect(screen.queryByText('Autenticação: Operacional')).not.toBeInTheDocument();
});
