import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import TabContentCheckins from './TabContentCheckins';
const state = vi.hoisted(() => ({ result: {}, retry: vi.fn() }));
vi.mock('@/hooks/useCheckins', () => ({ useCheckins: () => ({ useCheckinHistory: () => state.result }) }));
vi.mock('@/components/nutritionist/CheckinSchedulePanel', () => ({ default: () => <div>Agendamentos</div> }));
beforeEach(() => { state.result = { data: [], isLoading: false, refetch: state.retry }; state.retry.mockClear(); });
it('não apresenta ausência de pontuação como zero', () => {
    state.result.data = [{ id: '1', adherence_percentage: null, checkin_templates: { name: 'Retorno' } }];
    render(<TabContentCheckins patientId="patient" />);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getByText('Sem pontuação')).toBeInTheDocument();
});
it('calcula média somente das respostas pontuadas, preservando zeros reais', () => {
    state.result.data = [{ id: '1', adherence_percentage: 0 }, { id: '2', adherence_percentage: 80 }, { id: '3', adherence_percentage: null }];
    render(<TabContentCheckins patientId="patient" />);
    expect(screen.getByText('40%')).toBeInTheDocument();
});
it('oferece skeleton durante o carregamento', () => {
    state.result.isLoading = true;
    render(<TabContentCheckins patientId="patient" />);
    expect(screen.getByRole('status', { name: 'Carregando check-ins' })).toBeInTheDocument();
});
it('oferece recuperação no card quando a consulta falha', () => {
    state.result.isError = true;
    render(<TabContentCheckins patientId="patient" />);
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar respostas' }));
    expect(state.retry).toHaveBeenCalledOnce();
});
