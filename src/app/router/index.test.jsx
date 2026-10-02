import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AppRouter from './index';
import { afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: null,
  loading: false,
}));
afterEach(() => { mocks.loading = false; vi.unstubAllGlobals(); });

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, loading: mocks.loading }),
}));
vi.mock('@/contexts/ChatContext', () => ({
  ChatProvider: ({ children }) => children,
}));
vi.mock('@/contexts/RealtimeContext', () => ({ RealtimeProvider: ({ children }) => children }));
vi.mock('@/hooks/useNotificationsData', () => ({ NotificationsCacheOwner: ({ children }) => children }));
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
  it('exibe o status enquanto o serviço de autenticação ainda está carregando', () => {
    mocks.loading = true;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<MemoryRouter initialEntries={['/status']}><AppRouter /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Status do Nello' })).toBeInTheDocument();
  });
  it('preserva a URL inválida e informa o erro ao paciente autenticado', () => {
    mocks.user = { profile: { user_type: 'patient', is_admin: false } };
    renderUnknownRoute();
    expect(screen.getByLabelText('rota atual')).toHaveTextContent('/nutritionist/dashboard');
    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
  });

  it('informa página inexistente ao visitante sem redirecionar em silêncio', () => {
    mocks.user = null;
    renderUnknownRoute();
    expect(screen.getByLabelText('rota atual')).toHaveTextContent('/nutritionist/dashboard');
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });
});
