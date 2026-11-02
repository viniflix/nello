import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import PatientQuestionnairesPage from './PatientQuestionnairesPage';
import PatientPendingCheckinsWidget from '@/components/patient/PatientPendingCheckinsWidget';
import PatientCheckinHistoryWidget from '@/components/patient/PatientCheckinHistoryWidget';
const state = vi.hoisted(() => ({ user: { id: 'patient-a' }, pending: {}, history: {}, retryPending: vi.fn(), retryHistory: vi.fn(), historyRead: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/hooks/useCheckins', () => ({ useCheckins: () => ({
  usePendingCheckins: () => ({ data: [], isLoading: false, refetch: state.retryPending, ...state.pending }),
  useCheckinHistory: patientId => { state.historyRead(patientId); return { data: [], isLoading: false, refetch: state.retryHistory, ...state.history }; }
}) }));
function Location() { return <output aria-label="Destino">{useLocation().pathname}</output>; }
const mount = node => render(<MemoryRouter>{node}<Location /></MemoryRouter>);
beforeEach(() => { state.user = { id: 'patient-a' }; state.pending = {}; state.history = {}; vi.clearAllMocks(); });
it('shows confirmed empty sections and an explicit profile return', () => {
  mount(<PatientQuestionnairesPage />);
  expect(screen.getByRole('heading', { name: 'Meus Questionários' })).toBeInTheDocument();
  expect(screen.getByText('Nenhum questionário pendente.')).toBeInTheDocument();
  expect(screen.getByText('Você ainda não respondeu a questionários.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Voltar ao perfil/ })).toHaveAttribute('href', '/patient/perfil');
  expect(state.historyRead).toHaveBeenCalledWith('patient-a');
});
it('preserves hidden empty widgets in the existing home and progress contexts', () => {
  const { container } = mount(<><PatientPendingCheckinsWidget /><PatientCheckinHistoryWidget patientId="patient-a" /></>);
  expect(container.querySelector('p')).toBeNull();
});
it('keeps read failures distinct from an empty result and retries each source', () => {
  state.pending = { isError: true }; state.history = { isError: true };
  mount(<PatientQuestionnairesPage />);
  expect(screen.queryByText('Nenhum questionário pendente.')).toBeNull();
  expect(screen.queryByText('Você ainda não respondeu a questionários.')).toBeNull();
  screen.getAllByRole('button', { name: 'Tentar novamente' }).forEach(button => fireEvent.click(button));
  expect(state.retryPending).toHaveBeenCalledOnce(); expect(state.retryHistory).toHaveBeenCalledOnce();
});
it('announces loading without claiming an empty result', () => {
  state.pending = { isLoading: true }; state.history = { isLoading: true };
  mount(<PatientQuestionnairesPage />);
  expect(screen.getByRole('status', { name: 'Carregando questionários pendentes' })).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Carregando histórico de questionários' })).toBeInTheDocument();
  expect(screen.queryByText('Nenhum questionário pendente.')).toBeNull();
});
it('opens the existing response route and displays completed history separately', () => {
  state.pending = { data: [{ id: 'pending-session', checkin_templates: { name: 'Acompanhamento semanal', checkin_fields: [] } }] };
  state.history = { data: [{ id: 'completed-session', completed_at: '2026-11-01T12:00:00Z', adherence_percentage: null, checkin_templates: { name: 'Acompanhamento anterior' } }] };
  mount(<PatientQuestionnairesPage />);
  expect(screen.getByText('Acompanhamento anterior')).toBeInTheDocument();
  expect(screen.getByText('Sem pontuação')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Responder Agora' }));
  expect(screen.getByLabelText('Destino')).toHaveTextContent('/patient/checkin/pending-session');
});
it('does not mount private reads after the identity is cleared', () => {
  state.user = null;
  mount(<PatientQuestionnairesPage />);
  expect(state.historyRead).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Responder Agora' })).toBeNull();
});
