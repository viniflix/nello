import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgendaNotificationsDialog from './AgendaNotificationsDialog';
const mocks = vi.hoisted(() => ({ read: vi.fn(), track: vi.fn() }));
vi.mock('@/lib/supabase/appointment-notifications-queries', () => ({ getAppointmentNotifications: mocks.read }));
vi.mock('@/infrastructure/analytics/posthog', () => ({ track: mocks.track }));
const row = { id: 1, event_kind: 'reminder', delivery_status: 'available', available_at: '2034-10-12T12:00:00Z' };
describe('notice history recovery and identity', () => {
  it('shows a recoverable read error for an unexpected rejection', async () => {
    mocks.read.mockRejectedValueOnce(new Error('Synthetic rejected read'));
    render(<AgendaNotificationsDialog appointment={{ id: 15 }} nutritionistId="synthetic-owner" onClose={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('O agendamento permanece salvo.');
  });
  it('offers a read retry without resubmitting the booking and never claims reading', async () => {
    mocks.read.mockResolvedValueOnce({ data: [], error: new Error('Synthetic read error') }).mockResolvedValueOnce({ data: [row], error: null });
    render(<AgendaNotificationsDialog appointment={{ id: 12 }} nutritionistId="synthetic-owner" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Disponível no Nello')).toBeInTheDocument();
    expect(screen.queryByText('Lido')).not.toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledWith({ appointmentId: 12, nutritionistId: 'synthetic-owner', limit: 20 });
    for (const [, properties] of mocks.track.mock.calls) expect(Object.keys(properties)).not.toContain('patient_id');
  });
  it('ignores a late response from a previous owner and consultation', async () => {
    let releaseOld;
    mocks.read.mockImplementationOnce(() => new Promise(resolve => { releaseOld = resolve; })).mockResolvedValueOnce({ data: [row], error: null });
    const { rerender } = render(<AgendaNotificationsDialog appointment={{ id: 13 }} nutritionistId="synthetic-old-owner" onClose={vi.fn()} />);
    rerender(<AgendaNotificationsDialog appointment={{ id: 14 }} nutritionistId="synthetic-new-owner" onClose={vi.fn()} />);
    await screen.findByText('Disponível no Nello');
    releaseOld({ data: [], error: new Error('Synthetic old error') });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument());
    expect(screen.getByText('Disponível no Nello')).toBeInTheDocument();
  });
});
