import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import PatientCard from './PatientCard';
vi.mock('@/lib/supabase/patient-queries', () => ({ getEmptyPatientRemovalStatus: vi.fn().mockResolvedValue({ data: { can_remove: false } }) }));
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }
const patient = { id: 'synthetic-id', slug: 'synthetic-slug', name: 'Paciente de teste', email: 'patient@example.invalid', is_active: true };
it('provides a native link across the card and preserves the patient slug', () => {
  render(<MemoryRouter><PatientCard patient={patient} /><Location /></MemoryRouter>);
  const link = screen.getByRole('link', { name: 'Abrir prontuário de Paciente de teste' });
  expect(link).toHaveAttribute('href', '/nutritionist/patients/synthetic-slug/hub');
  fireEvent.click(link);
  expect(screen.getByTestId('location')).toHaveTextContent('/nutritionist/patients/synthetic-slug/hub');
});
it('does not provide the active-card shortcut for archived patients', () => {
  render(<MemoryRouter><PatientCard patient={{ ...patient, is_active: false }} onUnarchive={vi.fn()} /><Location /></MemoryRouter>);
  expect(screen.queryByRole('link', { name: /Abrir prontuário/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reativar acompanhamento de Paciente de teste' }));
  expect(screen.getByTestId('location')).toHaveTextContent('/');
  expect(screen.getByRole('dialog')).toBeVisible();
});
