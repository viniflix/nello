import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClinicalRecordAmendmentDialog from './ClinicalRecordAmendmentDialog';

const impact = {
  impactHash: 'impact-1',
  visibility: 'shared_with_patient',
  knownReferenceCount: 1,
};

describe('ClinicalRecordAmendmentDialog', () => {
  it('validates the trimmed Unicode reason, impact acknowledgement, focus and Escape', async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(<ClinicalRecordAmendmentDialog
      open
      mode="correction"
      impact={impact}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />);

    const reason = screen.getByRole('textbox', { name: /motivo da corre/i });
    await waitFor(() => expect(reason).toHaveFocus());
    expect(screen.getByText(/motivo.*poder. ser exibido ao paciente/i)).toBeInTheDocument();
    expect(screen.getByText(/texto objetivo, respeitoso.*sem conte.do interno desnecess.rio/i))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar corre/i })).toBeDisabled();

    fireEvent.change(reason, { target: { value: '   Motivo curto   ' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /confirmo que revisei o impacto/i }));
    expect(screen.getByRole('button', { name: /iniciar corre/i })).toBeDisabled();

    fireEvent.change(reason, { target: { value: '  Correção factual devidamente justificada.  ' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar corre/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      'Correção factual devidamente justificada.',
      { impact_hash: 'impact-1', confirmed: true },
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('reauthenticates immediately before invalidation, never forwards the password and guards pending', async () => {
    let resolveConfirm;
    const onConfirm = vi.fn(() => new Promise((resolve) => { resolveConfirm = resolve; }));
    const onReauthenticate = vi.fn().mockResolvedValue(true);
    render(<ClinicalRecordAmendmentDialog
      open
      mode="invalidation"
      impact={impact}
      onOpenChange={vi.fn()}
      onConfirm={onConfirm}
      onReauthenticate={onReauthenticate}
    />);

    fireEvent.change(screen.getByRole('textbox', { name: /motivo da invalida/i }), {
      target: { value: 'Registro atribuído ao atendimento incorreto.' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /confirmo que revisei o impacto/i }));
    fireEvent.change(screen.getByLabelText(/senha da conta atual/i), { target: { value: 'segredo' } });
    const button = screen.getByRole('button', { name: /invalidar registro/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(onReauthenticate).toHaveBeenCalledTimes(1));
    expect(onReauthenticate).toHaveBeenCalledWith('segredo');
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(
      'Registro atribuído ao atendimento incorreto.',
      { impact_hash: 'impact-1', confirmed: true },
    );
    expect(JSON.stringify(onConfirm.mock.calls)).not.toContain('segredo');
    resolveConfirm(true);
  });

  it('keeps invalidation blocked after a generic reauthentication failure', async () => {
    const onConfirm = vi.fn();
    render(<ClinicalRecordAmendmentDialog
      open
      mode="invalidation"
      impact={impact}
      onOpenChange={vi.fn()}
      onConfirm={onConfirm}
      onReauthenticate={vi.fn().mockResolvedValue(false)}
    />);
    fireEvent.change(screen.getByRole('textbox', { name: /motivo da invalida/i }), {
      target: { value: 'Registro atribuído ao atendimento incorreto.' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /confirmo que revisei o impacto/i }));
    fireEvent.change(screen.getByLabelText(/senha da conta atual/i), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: /invalidar registro/i }));

    expect(await screen.findByText(/n.o foi poss.vel confirmar sua identidade/i)).toHaveAttribute('role', 'alert');
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
