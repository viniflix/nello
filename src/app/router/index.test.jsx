import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AppRouter from './index';

const mocks = vi.hoisted(() => ({
  user: null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));
vi.mock('@/contexts/ChatContext', () => ({
  ChatProvider: ({ children }) => children,
}));
vi.mock('@/components/PresenceGlobal', () => ({ default: () => null }));
vi.mock('./authRoutes', () => ({ authRoutes: null }));
vi.mock('./nutritionistRoutes', () => ({ nutritionistRoutes: null }));
vi.mock('./patientRoutes', () => ({ patientRoutes: null }));
vi.mock('./adminRoutes', () => ({ adminRoutes: null }));

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="rota atual">{location.pathname}</output>;
}

function renderUnknownRoute() {
  return render(
    <MemoryRouter initialEntries={['/nutritionist/dashboard']}>
      <AppRouter />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('fallback de rotas desconhecidas', () => {
  it('leva paciente autenticado para o portal correto', async () => {
    mocks.user = { profile: { user_type: 'patient', is_admin: false } };
    renderUnknownRoute();
    await waitFor(() => expect(screen.getByLabelText('rota atual')).toHaveTextContent('/patient'));
  });

  it('leva visitante para o login', async () => {
    mocks.user = null;
    renderUnknownRoute();
    await waitFor(() => expect(screen.getByLabelText('rota atual')).toHaveTextContent('/login'));
  });
});
