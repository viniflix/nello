import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgendaAppointmentCard from './AgendaAppointmentCard';

describe('agenda card identity and terminal actions', () => {
  it('preserves the full name and paid-charge action independently from opening the appointment', () => {
    const onEdit = vi.fn(), onCharge = vi.fn();
    render(<AgendaAppointmentCard appointment={{ id: 1, patient_id: 'synthetic-patient', patient: { name: 'Paciente fictício com nome extenso e composto' }, appointment_time: '2034-10-18T12:00:00Z', duration: 60, status: 'confirmed', charge: [{ id: 'synthetic-charge', amount: 125.75, status: 'paid' }] }} status={{ label: 'Confirmada' }} type={{ label: 'Avaliação' }} onEdit={onEdit} onCharge={onCharge} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paciente fictício com nome extenso e composto' }));
    expect(onEdit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /125,75.*Pago/ }));
    expect(onCharge).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
  });
  it('shows read-only details for terminal guests and does not offer new registration', () => {
    render(<AgendaAppointmentCard appointment={{ id: 2, unregistered_patient_name: 'Contato fictício', appointment_time: '2034-10-18T12:00:00Z', duration: 60, status: 'completed' }} status={{ label: 'Realizada' }} type={{ label: 'Retorno' }} />);
    expect(screen.getByRole('button', { name: 'Ver detalhes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Completar cadastro' })).not.toBeInTheDocument();
  });
});
