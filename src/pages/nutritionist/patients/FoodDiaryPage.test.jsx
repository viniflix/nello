import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import FoodDiaryPage from './FoodDiaryPage';
vi.mock('@/hooks/useResolvedPatientId', () => ({ useResolvedPatientId: () => ({ patientId: null, paramValue: 'ana' }) }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
it('renderiza a rota do diário sem referências indefinidas', () => {
    render(<MemoryRouter><FoodDiaryPage /></MemoryRouter>);
    expect(screen.getByText('Diário Alimentar')).toBeInTheDocument();
});
