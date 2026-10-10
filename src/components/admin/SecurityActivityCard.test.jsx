import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SecurityActivityCard from './SecurityActivityCard';
import { getAdminSecurityActivity } from '@/services/adminService';
vi.mock('@/services/adminService', () => ({ getAdminSecurityActivity: vi.fn() }));
const payload = { schema_version: 1, monitor: { last_evaluated_at: null }, alerts: [], events: [] };
beforeEach(() => vi.resetAllMocks());
describe('security evidence presentation', () => {
  it('does not present an empty feed as proof of security or delivered alerts', async () => {
    getAdminSecurityActivity.mockResolvedValue({ data: payload });
    render(<SecurityActivityCard />);
    expect(await screen.findByText(/Isso não comprova ausência de incidentes/)).toBeInTheDocument();
    expect(screen.getByText(/Notificações externas ainda não configuradas/)).toBeInTheDocument();
  });
  it('distinguishes a failed request from an empty history', async () => {
    getAdminSecurityActivity.mockRejectedValue(new Error('unavailable'));
    render(<SecurityActivityCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar');
    expect(screen.queryByText(/Nenhum sinal registrado/)).not.toBeInTheDocument();
  });
  it('uses a server cursor and discards stale data on refresh', async () => {
    const events = Array.from({ length: 25 }, (_, i) => ({ id: 30 - i, resource_type: 'admin_operators', action: 'UPDATE', changed_fields: ['role'] }));
    getAdminSecurityActivity.mockResolvedValueOnce({ data: { ...payload, events } }).mockResolvedValue({ data: payload });
    const { rerender } = render(<SecurityActivityCard />);
    fireEvent.click(await screen.findByText('Alterações anteriores'));
    await waitFor(() => expect(getAdminSecurityActivity).toHaveBeenCalledWith(6));
    rerender(<SecurityActivityCard version={1} />);
    await waitFor(() => expect(getAdminSecurityActivity).toHaveBeenLastCalledWith(null));
  });
});
