import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('labels an active correction draft and clears stale comparison selection across chains', async () => {
    const firstChain = [
      { id: 'root-1-v2', root_record_id: 'root-1', chain_version: 2, status: 'draft', amendment: { type: 'correction', status: 'draft' } },
      { id: 'root-1-v1', root_record_id: 'root-1', chain_version: 1, status: 'signed' },
    ];
    const { rerender } = render(<ClinicalRecordVersionHistory chain={firstChain} onCompare={vi.fn()} />);
    expect(screen.getByText('Correção em preparação')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /selecionar vers.o 2/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /selecionar vers.o 1/i }));
    expect(screen.getByRole('button', { name: /comparar vers.es/i })).toBeEnabled();

    rerender(<ClinicalRecordVersionHistory
      chain={[
        { id: 'root-2-v2', root_record_id: 'root-2', chain_version: 2, status: 'signed' },
        { id: 'root-2-v1', root_record_id: 'root-2', chain_version: 1, status: 'corrected' },
      ]}
      onCompare={vi.fn()}
    />);
    await waitFor(() => expect(screen.getByRole('button', { name: /comparar vers.es/i })).toBeDisabled());
    expect(screen.getAllByRole('checkbox').every((checkbox) => !checkbox.checked)).toBe(true);
  });
});
