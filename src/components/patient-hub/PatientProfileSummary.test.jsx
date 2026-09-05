import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PatientProfileSummary from './PatientProfileSummary';

describe('PatientProfileSummary', () => {
  it('does not classify missing measurements as underweight', () => {
    render(<PatientProfileSummary patientData={{ name: 'Paciente' }} latestMetrics={{}} />);
    expect(screen.getByText('Não calculado')).toBeInTheDocument();
    expect(screen.queryByText('Abaixo do peso')).not.toBeInTheDocument();
  });

  it('shows unavailable plan data separately from an absent plan', () => {
    render(<PatientProfileSummary patientData={{ name: 'Paciente' }} operationalContext={{ planStatus: 'unknown' }} />);
    expect(screen.getByText('Dados indisponíveis')).toBeInTheDocument();
    expect(screen.queryByText('Sem plano')).not.toBeInTheDocument();
  });

  it('connects the three primary actions and profile editing', () => {
    const actions = { edit: vi.fn(), schedule: vi.fn(), chat: vi.fn(), plan: vi.fn() };
    render(<PatientProfileSummary
      patientData={{ name: 'Paciente' }}
      operationalContext={{ planStatus: 'missing' }}
      onEditProfile={actions.edit}
      onScheduleAppointment={actions.schedule}
      onOpenChat={actions.chat}
      onOpenMealPlan={actions.plan}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar perfil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar informações de Paciente' }));
    fireEvent.click(screen.getByRole('button', { name: /Agendar consulta/i }));
    fireEvent.click(screen.getByRole('button', { name: /Abrir chat/i }));
    fireEvent.click(screen.getByRole('button', { name: /Iniciar plano/i }));
    expect(actions).toEqual(expect.objectContaining({
      edit: expect.any(Function), schedule: expect.any(Function), chat: expect.any(Function), plan: expect.any(Function)
    }));
    expect(actions.edit).toHaveBeenCalledTimes(2);
    Object.values(actions).filter(action => action !== actions.edit).forEach(action => expect(action).toHaveBeenCalledOnce());
  });

  it('shows realtime presence independently from the active account status', () => {
    const { rerender } = render(<PatientProfileSummary patientData={{ name: 'Paciente', is_active: true }} isOnline={false} />);
    expect(screen.getByRole('status', { name: 'Paciente offline' })).toHaveClass('bg-slate-300');
    expect(screen.getByText('Ativo')).toBeInTheDocument();

    rerender(<PatientProfileSummary patientData={{ name: 'Paciente', is_active: true }} isOnline />);
    expect(screen.getByRole('status', { name: 'Paciente online' })).toHaveClass('bg-emerald-500');
  });
});
