import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProgressivePatientProfile from './ProgressivePatientProfile';

describe('ProgressivePatientProfile', () => {
  it('requires only the name and excludes clinical fields from the global payload', async () => {
    const onSave = vi.fn().mockResolvedValue({ error: null });
    render(<ProgressivePatientProfile patient={{ id: 'p1', name: '', weight: 80, height: 170, goal: 'lose', observations: 'x' }} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /salvar perfil/i }));
    expect(await screen.findByText(/nome é obrigatório/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/nome completo/i), { target: { value: 'Ana Lima' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar perfil/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({ name: 'Ana Lima' }));
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('weight');
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('height');
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('goal');
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('observations');
  });

  it('shows contextual guidance without an empty tab', () => {
    render(<ProgressivePatientProfile patient={{ name: 'Ana' }} requirements={['birth_date']} onSave={vi.fn()} />);
    expect(screen.getByText(/data de nascimento é necessária/i)).toBeInTheDocument();
    expect(screen.getByText(/medidas corporais ficam na antropometria/i)).toBeInTheDocument();
    expect(screen.getByText(/notas clínicas serão registradas no prontuário/i)).toBeInTheDocument();
  });

  it('collects gender and structured address in the progressive profile', async () => {
    const onSave = vi.fn().mockResolvedValue({ error: null });
    render(<ProgressivePatientProfile patient={{ name: 'Ana', address: {} }} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/gênero/i), { target: { value: 'female' } });
    fireEvent.change(screen.getByLabelText(/logradouro/i), { target: { value: 'Rua das Flores' } });
    fireEvent.change(screen.getByLabelText(/cidade/i), { target: { value: 'Fortaleza' } });
    fireEvent.change(screen.getByLabelText(/^estado$/i), { target: { value: 'CE' } });
    fireEvent.change(screen.getByLabelText(/cep/i), { target: { value: '60000-000' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar perfil/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      gender: 'female',
      address: { street: 'Rua das Flores', city: 'Fortaleza', state: 'CE', postal_code: '60000-000' },
    })));
  });
});
