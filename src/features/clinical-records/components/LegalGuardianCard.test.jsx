import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LegalGuardianCard from './LegalGuardianCard';

describe('LegalGuardianCard', () => {
  it('explains an unknown age without announcing adulthood as an alert', () => {
    render(<LegalGuardianCard patientId="p1" episodeId="e1" ageStatus="unknown" guardians={[]} />);

    expect(screen.getByText(/data de nascimento.*regras etárias/i)).toBeInTheDocument();
    expect(screen.queryByText(/atingiu a maioridade/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('defaults to unknown when no age evidence or legacy minor flag is provided', () => {
    render(<LegalGuardianCard patientId="p1" episodeId="e1" guardians={[]} />);

    expect(screen.getByText(/data de nascimento.*regras etárias/i)).toBeInTheDocument();
    expect(screen.queryByText(/atingiu a maioridade/i)).not.toBeInTheDocument();
  });

  it('presents adulthood as information rather than an urgent alert', () => {
    render(<LegalGuardianCard patientId="p1" episodeId="e1" ageStatus="adult" guardians={[]} />);

    expect(screen.getByText(/atingiu a maioridade/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns when a minor has no guardian and saves against the active episode without CPF', async () => {
    const onSave = vi.fn().mockResolvedValue({ error: null });
    render(<LegalGuardianCard patientId="p1" episodeId="episode-current" isMinor guardians={[]} onSave={onSave} />);
    expect(screen.getByText(/menor sem responsável legal ativo/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /adicionar responsável/i }));
    expect(screen.queryByLabelText(/cpf/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/nome do responsável/i), { target: { value: 'Beatriz Lima' } });
    fireEvent.change(screen.getByLabelText(/relação/i), { target: { value: 'Mãe' } });
    fireEvent.click(screen.getByLabelText(/consentimento registrado/i));
    fireEvent.change(screen.getByLabelText(/versão do consentimento/i), { target: { value: 'v1' } });
    fireEvent.change(screen.getByLabelText(/data do registro/i), { target: { value: '2026-07-12T10:00' } });
    fireEvent.change(screen.getByLabelText(/evidência \(link ou referência\)/i), { target: { value: 'Termo arquivado' } });
    fireEvent.submit(screen.getByRole('button', { name: /salvar responsável/i }).closest('form'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('p1', 'episode-current', expect.objectContaining({ name: 'Beatriz Lima', relationship: 'Mãe' })));
    expect(onSave.mock.calls[0][2]).not.toHaveProperty('valid_from');
    expect(onSave.mock.calls[0][2]).not.toHaveProperty('valid_until');
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

  it('disables creation without an active episode', () => {
    render(<LegalGuardianCard patientId="p1" episodeId={null} guardians={[]} onSave={vi.fn()} />);
    expect(screen.getByText(/inicie um episódio de cuidado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adicionar responsável/i })).toBeDisabled();
  });

  it('describes a viewed historical episode as read-only instead of asking to start one', () => {
    render(<LegalGuardianCard patientId="p1" episodeId={null} viewedEpisodeId="ended-1" guardians={[]} onSave={vi.fn()} />);
    expect(screen.getByText(/somente.*leitura/i)).toBeInTheDocument();
    expect(screen.queryByText(/inicie um episódio/i)).not.toBeInTheDocument();
  });

  it('requires replacement reason and sends period and consent in the supported payload', async () => {
    const onSave = vi.fn().mockResolvedValue({ error: null });
    render(<LegalGuardianCard patientId="p1" episodeId="e1" guardians={[{ id: 'g1', name: 'Atual', status: 'active' }]} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /substituir responsável/i }));
    fireEvent.change(screen.getByLabelText(/nome do responsável/i), { target: { value: 'Nova' } });
    fireEvent.change(screen.getByLabelText(/relação/i), { target: { value: 'Mãe' } });
    fireEvent.change(screen.getByLabelText(/início do período/i), { target: { value: '2026-07-12' } });
    fireEvent.change(screen.getByLabelText(/fim do período/i), { target: { value: '2027-07-12' } });
    fireEvent.click(screen.getByLabelText(/consentimento registrado/i));
    fireEvent.change(screen.getByLabelText(/versão do consentimento/i), { target: { value: 'v1' } });
    fireEvent.change(screen.getByLabelText(/data do registro/i), { target: { value: '2026-07-12T10:00' } });
    fireEvent.change(screen.getByLabelText(/evidência \(link ou referência\)/i), { target: { value: 'Termo arquivado' } });
    fireEvent.submit(screen.getByRole('button', { name: /salvar responsável/i }).closest('form'));
    expect(screen.getByText(/motivo da substituição é obrigatório/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/motivo da substituição/i), { target: { value: 'Mudança familiar' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar responsável/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('p1', 'e1', expect.objectContaining({
      valid_from: '2026-07-12', valid_until: '2027-07-12', consent: expect.objectContaining({ recorded: true, version: 'v1' }), reason: 'Mudança familiar'
    })));
  });

  it('renders replaced, period and consent distinctly', () => {
    render(<LegalGuardianCard episodeId="e1" guardians={[{ id: 'g1', name: 'Anterior', relationship: 'Pai', status: 'replaced', valid_from: '2025-01-01', valid_until: '2026-01-01', consent: { recorded: true } }]} />);
    expect(screen.getByText(/substituído/i)).toBeInTheDocument();
    expect(screen.getByText(/01\/01\/2025.*01\/01\/2026/i)).toBeInTheDocument();
    expect(screen.getByText(/consentimento registrado/i)).toBeInTheDocument();
  });

  it('uses an accessible alert dialog that closes on Escape and restores focus', async () => {
    render(<LegalGuardianCard episodeId="e1" guardians={[{ id: 'g1', name: 'Bia', status: 'active' }]} onRevoke={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /revogar bia/i }); trigger.focus(); fireEvent.click(trigger);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('persists guardian contact and complete consent evidence without collecting CPF', async () => {
    const onSave = vi.fn().mockResolvedValue({ error: null });
    render(<LegalGuardianCard patientId="p1" episodeId="e1" guardians={[]} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /adicionar responsável/i }));
    fireEvent.change(screen.getByLabelText(/nome do responsável/i), { target: { value: 'Bia' } });
    fireEvent.change(screen.getByLabelText(/^relação$/i), { target: { value: 'Mãe' } });
    fireEvent.change(screen.getByLabelText(/^telefone$/i), { target: { value: '85999999999' } });
    fireEvent.change(screen.getByLabelText(/^e-mail$/i), { target: { value: 'bia@example.com' } });
    fireEvent.click(screen.getByLabelText(/consentimento registrado/i));
    fireEvent.change(screen.getByLabelText(/versão do consentimento/i), { target: { value: 'v1' } });
    fireEvent.change(screen.getByLabelText(/data do registro/i), { target: { value: '2026-07-12T10:00' } });
    fireEvent.change(screen.getByLabelText(/evidência \(link ou referência\)/i), { target: { value: 'Termo físico arquivado' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar responsável/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('p1', 'e1', expect.objectContaining({
      contact: { phone: '85999999999', email: 'bia@example.com' },
      consent: expect.objectContaining({ recorded: true, version: 'v1', recorded_at: '2026-07-12T10:00', evidence: 'Termo físico arquivado' }),
    })));
    expect(screen.queryByLabelText(/cpf/i)).not.toBeInTheDocument();
  });

  it('clears guardian fields after cancel and after a successful replacement', async () => {
    const onSave = vi.fn().mockResolvedValue({ error: null });
    render(<LegalGuardianCard patientId="p1" episodeId="e1" guardians={[{ id: 'g1', name: 'Atual', status: 'active' }]} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /substituir responsável/i }));
    fireEvent.change(screen.getByLabelText(/nome do responsável/i), { target: { value: 'Não herdar' } });
    fireEvent.change(screen.getByLabelText(/motivo da substituição/i), { target: { value: 'Motivo antigo' } });
    fireEvent.click(screen.getByLabelText(/consentimento registrado/i));
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    fireEvent.click(screen.getByRole('button', { name: /substituir responsável/i }));
    expect(screen.getByLabelText(/nome do responsável/i)).toHaveValue('');
    expect(screen.getByLabelText(/motivo da substituição/i)).toHaveValue('');
    expect(screen.getByLabelText(/consentimento registrado/i)).not.toBeChecked();
    fireEvent.change(screen.getByLabelText(/nome do responsável/i), { target: { value: 'Nova' } });
    fireEvent.change(screen.getByLabelText(/relação/i), { target: { value: 'Mãe' } });
    fireEvent.change(screen.getByLabelText(/motivo da substituição/i), { target: { value: 'Mudança' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar responsável/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /substituir responsável/i }));
    expect(screen.getByLabelText(/nome do responsável/i)).toHaveValue('');
    expect(screen.getByLabelText(/motivo da substituição/i)).toHaveValue('');
  });
});
