import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import EnergyExpenditureSummaryCard from './EnergyExpenditureSummaryCard';
const mocks = vi.hoisted(() => ({ calc: { id: 1, tmb_protocol: 'harris' }, navigate: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/lib/supabase/anthropometry-queries', () => ({ getPatientModuleSyncFlags: async () => ({ data: null }) }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: table => {
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
        single: async () => ({ data: { weight: 80, height: 180, birth_date: '1990-01-01', gender: 'male' } }),
        maybeSingle: async () => ({ data: table === 'energy_expenditure_calculations' ? mocks.calc : null }),
    };
    return query;
} } }));
beforeEach(() => { mocks.calc = { id: 1, tmb_protocol: 'harris' }; mocks.navigate.mockClear(); });
it('mantém medidas energéticas ausentes como indisponíveis', async () => {
    render(<EnergyExpenditureSummaryCard patientId="patient" />);
    await screen.findByText(/Protocolo:/);
    expect(screen.queryByText('0 kcal')).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
});
it('oferece a ação de editar junto ao cabeçalho do card', async () => {
    render(<EnergyExpenditureSummaryCard patientId="patient" patient={{ id: 'patient', slug: 'ana' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar cálculo' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/nutritionist/patients/ana/energy-expenditure');
});
