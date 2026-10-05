import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminBugReportsPage from './AdminBugReportsPage';

const mocks = vi.hoisted(() => ({
  getPage: vi.fn(),
  getLogs: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'operator-qa' } }) }));
vi.mock('@/services/adminService', () => ({ getSystemLiveLogs: mocks.getLogs, getAdminIssuePage: mocks.getPage }));
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AdminBugReportsPage /></QueryClientProvider>);

describe('AdminBugReportsPage', () => {
  beforeEach(() => {
    mocks.getPage.mockReset();
    mocks.getLogs.mockReset();
    mocks.getLogs.mockResolvedValue({ data: [], error: null });
  });

  it('consulta a Edge Function por POST e não inventa saúde quando Sentry falha', async () => {
    mocks.getPage.mockResolvedValue({ data: null, error: new Error('unavailable') });
    show();
    await waitFor(() => expect(mocks.getPage).toHaveBeenCalledWith({ hours: 24, environment: 'production', release: '', cursor: '' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar o Sentry');
    expect(screen.queryByText(/Taxa de erro/)).not.toBeInTheDocument();
  });
  it('deduplicates overlapping pages and preserves them when the next source request fails', async () => {
    const issue = { id: '1', title: 'TypeError', shortId: 'NELLO-1', count: '2', level: 'error' };
    mocks.getPage.mockResolvedValueOnce({ data: { items: [issue], next_cursor: '1:1:0' }, error: null })
      .mockResolvedValueOnce({ data: { items: [issue, { ...issue, id: '2', shortId: 'NELLO-2' }], next_cursor: '2:2:0' }, error: null })
      .mockResolvedValueOnce({ error: new Error('unavailable') });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar próxima página' }));
    await waitFor(() => expect(screen.getByText('Issues carregadas: 2')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Carregar próxima página' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Últimas páginas preservadas');
    expect(screen.getByText('Issues carregadas: 2')).toBeInTheDocument();
  });
});
