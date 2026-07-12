import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VerificationStatusCard from './VerificationStatusCard';

describe('VerificationStatusCard', () => {
  it('explains that an unverified account can only simulate', () => {
    render(<VerificationStatusCard verification={{ status: 'not_submitted' }} />);
    expect(screen.getByText('Verificação não enviada')).toBeInTheDocument();
    expect(screen.getByText(/pacientes fictícios/i)).toBeInTheDocument();
  });

  it('identifies an alpha migration approval without asking for a new submission', () => {
    render(<VerificationStatusCard verification={{
      status: 'approved',
      verification_method: 'approved_by_migration',
      has_clinical_capacity: true
    }} />);
    expect(screen.getByText('Perfil aprovado')).toBeInTheDocument();
    expect(screen.getByText(/continuidade do ambiente alpha/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar verificação/i })).not.toBeInTheDocument();
  });

  it('offers resubmission when information is requested', () => {
    const onAction = vi.fn();
    render(<VerificationStatusCard
      verification={{ status: 'needs_information', document_required_reason: 'Confirme o CRN.' }}
      onAction={onAction}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar complementação' }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
