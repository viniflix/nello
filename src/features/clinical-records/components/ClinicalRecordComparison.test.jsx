import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ClinicalRecordComparison from './ClinicalRecordComparison';

describe('ClinicalRecordComparison', () => {
  it('renders sanitized plain text and change state per section without raw HTML', () => {
    const { container } = render(<ClinicalRecordComparison comparison={{
      sections: [
        { key: 'assessment', label: 'Avaliação', left: '<b>Antes</b>', right: '<script>alert(1)</script>Depois' },
        { key: 'plan', label: 'Conduta', left: '', right: '<p>Nova conduta</p>' },
        { key: 'format', label: 'Formatação', left: '<b>Mesmo texto</b>', right: '<i>Mesmo texto</i>' },
      ],
    }} />);

    expect(screen.getByRole('heading', { name: 'Avaliação' })).toBeInTheDocument();
    expect(screen.getByText('Antes')).toBeInTheDocument();
    expect(screen.getByText('alert(1) Depois')).toBeInTheDocument();
    expect(screen.getAllByText('Alterado')).toHaveLength(1);
    expect(screen.getByText('Adicionado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Formatação' }).parentElement).toHaveTextContent('Sem alteração');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('uses immutable snapshot labels for technical section keys returned by the comparison RPC', () => {
    render(<ClinicalRecordComparison comparison={{
      left: {
        template_sections_snapshot: [{ key: 'subjective', label: 'Relato do paciente' }],
      },
      right: {
        template_sections_snapshot: [{ key: 'subjective', label: 'Relato clínico' }],
      },
      sections: [{ key: 'subjective', left_value: '<p>Antes</p>', right_value: '<p>Depois</p>' }],
    }} />);

    expect(screen.getByRole('heading', { name: 'Relato do paciente' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'subjective' })).not.toBeInTheDocument();
  });
});
