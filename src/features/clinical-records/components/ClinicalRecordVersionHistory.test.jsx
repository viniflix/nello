import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClinicalRecordVersionHistory from './ClinicalRecordVersionHistory';

describe('ClinicalRecordVersionHistory', () => {
  it('sorts a copied chain descending and exposes statuses and comparison selection', () => {
    const chain = [
      { id: 'v1', chain_version: 1, status: 'corrected' },
      { id: 'v3', chain_version: 3, status: 'signed' },
      { id: 'v2', chain_version: 2, status: 'invalidated' },
      { id: 'draft', chain_version: 4, status: 'draft', amendment: { status: 'abandoned' } },
    ];
    const originalOrder = chain.map((record) => record.id);
    const onCompare = vi.fn();
    render(<ClinicalRecordVersionHistory chain={chain} onCompare={onCompare} />);

    expect(screen.getAllByTestId('version-row').map((row) => row.dataset.recordId))
      .toEqual(['draft', 'v3', 'v2', 'v1']);
    expect(chain.map((record) => record.id)).toEqual(originalOrder);
    expect(screen.getByText('Vigente')).toBeInTheDocument();
    expect(screen.getByText('Substituído')).toBeInTheDocument();
    expect(screen.getByText('Invalidado')).toBeInTheDocument();
    expect(screen.getByText('Rascunho abandonado')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /selecionar vers.o 3 para compara/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /selecionar vers.o 1 para compara/i }));
    fireEvent.click(screen.getByRole('button', { name: /comparar vers.es selecionadas/i }));
    expect(onCompare).toHaveBeenCalledWith('v3', 'v1');
  });
});
