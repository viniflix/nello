import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminBugReportsPage from './AdminBugReportsPage';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  getLogs: vi.fn(),
}));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/services/adminService', () => ({ getSystemLiveLogs: mocks.getLogs }));

describe('AdminBugReportsPage', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.getLogs.mockReset();
    mocks.getLogs.mockResolvedValue({ data: [], error: null });
  });

  it('consulta a Edge Function por POST e não inventa saúde quando Sentry falha', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('unavailable') });
    render(<AdminBugReportsPage />);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('sentry-proxy', {
      method: 'POST',
      body: { action: 'issues', limit: 100 },
    }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar o Sentry');
    expect(screen.queryByText(/Taxa de erro/)).not.toBeInTheDocument();
  });
});
