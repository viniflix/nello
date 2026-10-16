import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LabResultsPage from './LabResultsPage';

const mocks = vi.hoisted(() => ({ rows: [], create: vi.fn(), toast: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'synthetic-owner' } }) }));
vi.mock('@/hooks/useResolvedPatientId', () => ({ useResolvedPatientId: () => ({ patientId: 'synthetic-patient', paramValue: 'synthetic-patient' }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: {
  from: () => { const q = { select: () => q, eq: () => q, single: async () => ({ data: { name: 'Synthetic' } }) }; return q; },
} }));
vi.mock('@/lib/supabase/lab-results-queries', async importOriginal => ({
  ...await importOriginal(),
  getPatientLabResults: async () => ({ data: mocks.rows, error: null }),
  getLabRiskRules: async () => ({ data: [], error: null }),
  createLabResult: (...args) => mocks.create(...args),
}));
vi.mock('@/components/lab-results/ConductSuggestionsCard', () => ({ default: () => null }));
const draw = () => render(<MemoryRouter><LabResultsPage /></MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks(); mocks.create.mockResolvedValue({ data: { id: 100 }, error: null });
  mocks.rows = Array.from({ length: 51 }, (_, i) => ({ id: i + 1, test_name: `Marcador ${i + 1}`, test_value: i === 0 ? null : '5.5', test_unit: 'mg/dL', reference_min: 5.2, reference_max: 6, status: 'pending', test_date: '2026-10-01', interpretation_status: 'confirmed' }));
});

describe('laboratory page consumer contract', () => {
  it('distinguishes unavailable evaluation and searches the entire loaded history beyond page 50', async () => {
    draw();
    await screen.findByText(/Histórico carregado: 51 exames/);
    expect(screen.getAllByText('Avaliação indisponível').length).toBeGreaterThan(0);
    expect(screen.queryByText('Risco baixo')).not.toBeInTheDocument();
    expect(screen.queryByText('Marcador 51', { selector: 'h3' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar exame'), { target: { value: 'Marcador 51' } });
    expect(await screen.findByText('Marcador 51', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText(/Mostrando 1 de 1 resultados encontrados/)).toBeInTheDocument();
  });
  it('progressively displays results without silently dropping the final record', async () => {
    draw(); await screen.findByText(/Histórico carregado: 51 exames/);
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais resultados' }));
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais resultados' }));
    expect(screen.getByText('Marcador 51', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais resultados' })).not.toBeInTheDocument();
  });
  it('previews and saves the same decimal value', async () => {
    draw(); await screen.findByText(/Histórico carregado: 51 exames/);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Exame' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Nome do Exame/), { target: { value: 'Novo marcador' } });
    fireEvent.change(within(dialog).getByLabelText('Valor do Resultado'), { target: { value: '5,5' } });
    fireEvent.change(within(dialog).getByLabelText('Referência Mínima'), { target: { value: '5,2' } });
    fireEvent.change(within(dialog).getByLabelText('Referência Máxima'), { target: { value: '6' } });
    expect(within(dialog).getByText('Normal')).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Adicionar', exact: true })); });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ test_value: '5.5', reference_min: 5.2, reference_max: 6 })));
  });
});
