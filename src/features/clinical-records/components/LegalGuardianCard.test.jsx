import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LegalGuardianCard from './LegalGuardianCard';

describe('LegalGuardianCard', () => {
  it('warns when a minor has no guardian and saves against the active episode without CPF', async () => {
    const onSave = vi.fn().mockResolvedValue({ error: null });
    render(<LegalGuardianCard patientId="p1" episodeId="episode-current" isMinor guardians={[]} onSave={onSave} />);
    expect(screen.getByText(/menor sem responsável legal ativo/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /adicionar responsável/i }));
    expect(screen.queryByLabelText(/cpf/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/nome do responsável/i), { target: { value: 'Beatriz Lima' } });
    fireEvent.change(screen.getByLabelText(/relação/i), { target: { value: 'Mãe' } });
    fireEvent.click(screen.getByLabelText(/consentimento registrado/i));
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('p1', 'episode-current', expect.objectContaining({ name: 'Beatriz Lima', relationship: 'Mãe' })));
  });

  it('requires a reason before confirming revocation', async () => {
    const onRevoke = vi.fn().mockResolvedValue({ error: null });
    render(<LegalGuardianCard patientId="p1" episodeId="e1" guardians={[{ id: 'g1', name: 'Bia', status: 'active' }]} onRevoke={onRevoke} />);
    fireEvent.click(screen.getByRole('button', { name: /revogar/i }));
    const confirm = screen.getByRole('button', { name: /confirmar revogação/i });
    fireEvent.click(confirm);
    expect(onRevoke).not.toHaveBeenCalled();
    expect(screen.getByText(/informe o motivo/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/motivo da revogação/i), { target: { value: 'Responsável substituído' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith('g1', 'Responsável substituído'));
  });
});
