import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgendaScheduleGrid from './AgendaScheduleGrid';

const booking = { id: 8, appointment_time: '2034-10-18T12:00:00Z', duration: 60, status: 'confirmed', unregistered_patient_name: 'Contato fictício' };
const props = { days: [new Date(2034, 9, 18, 12)], appointments: [booking], settings: { startTime: '08:00', endTime: '18:00' }, getStatusInfo: () => ({ label: 'Confirmada' }) };
describe('schedule interactions are drafts, with keyboard alternatives', () => {
  it('selects an empty time or opens an existing record without saving', () => {
    const onNew = vi.fn(), onEdit = vi.fn(); render(<AgendaScheduleGrid {...props} onNew={onNew} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agendar 2034-10-18 às 10:30' }));
    expect(onNew).toHaveBeenCalledWith('2034-10-18', '10:30');
    fireEvent.click(screen.getByRole('button', { name: /Contato fictício/ })); expect(onEdit).toHaveBeenCalledWith(booking);
  });
  it('accepts only a current nonterminal local record for a drop', () => {
    const onMove = vi.fn(); render(<AgendaScheduleGrid {...props} onMove={onMove} />);
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    fireEvent.drop(screen.getByRole('button', { name: 'Agendar 2034-10-18 às 10:30' }), { dataTransfer }); expect(onMove).not.toHaveBeenCalled();
    fireEvent.dragStart(screen.getByRole('button', { name: /Contato fictício/ }), { dataTransfer });
    fireEvent.drop(screen.getByRole('button', { name: 'Agendar 2034-10-18 às 10:30' }), { dataTransfer });
    expect(onMove).toHaveBeenCalledWith(booking, '2034-10-18', '10:30');
  });
});
