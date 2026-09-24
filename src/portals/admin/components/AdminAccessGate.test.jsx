import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAccessGate from './AdminAccessGate';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  user: { id: 'operator-1', profile: { user_type: 'nutritionist', is_admin: true } },
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, isOffline: false }) }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { rpc: mocks.rpc, auth: { mfa: { listFactors: vi.fn().mockResolvedValue({ data: { totp: [] }, error: null }) } } } }));

const renderGate = () => render(
  <MemoryRouter><AdminAccessGate><div>Dados administrativos</div></AdminAccessGate></MemoryRouter>,
);

describe('AdminAccessGate', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('não confia no is_admin do perfil quando o servidor nega acesso', async () => {
    mocks.rpc.mockResolvedValue({ data: { eligible: false, authorized: false }, error: null });
    renderGate();
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('admin_access_status'));
    expect(screen.queryByText('Dados administrativos')).not.toBeInTheDocument();
  });

  it('exige segundo fator antes de renderizar o painel', async () => {
    mocks.rpc.mockResolvedValue({ data: { eligible: true, authorized: false }, error: null });
    renderGate();
    expect(await screen.findByText('Acesso administrativo protegido')).toBeInTheDocument();
    expect(screen.queryByText('Dados administrativos')).not.toBeInTheDocument();
  });

  it('abre o painel apenas com autorização retornada pelo servidor', async () => {
    mocks.rpc.mockResolvedValue({ data: { eligible: true, authorized: true }, error: null });
    renderGate();
    expect(await screen.findByText('Dados administrativos')).toBeInTheDocument();
  });

  it('falha fechado quando a verificação de acesso fica indisponível', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent('não pôde ser validada');
    expect(screen.queryByText('Dados administrativos')).not.toBeInTheDocument();
  });
});
