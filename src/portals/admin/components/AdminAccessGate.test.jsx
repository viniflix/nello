import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAccessGate from './AdminAccessGate';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  listFactors: vi.fn(), enroll: vi.fn(), unenroll: vi.fn(), challenge: vi.fn(), verify: vi.fn(),
  user: { id: 'operator-1', profile: { user_type: 'nutritionist', is_admin: true } },
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, isOffline: false }) }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { rpc: mocks.rpc, auth: { mfa: mocks } } }));

const renderGate = () => render(
  <MemoryRouter><AdminAccessGate><div>Dados administrativos</div></AdminAccessGate></MemoryRouter>,
);

describe('AdminAccessGate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user = { id: 'operator-1', profile: { user_type: 'nutritionist', is_admin: true } };
    mocks.listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });
    mocks.unenroll.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ data: { eligible: true, authorized: false }, error: null });
  });

  const startEnrollment = async () => {
    const button = await screen.findByRole('button', { name: 'Configurar autenticador' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
  };

  it.each([
    'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  ])('renderiza QR sem encapsular duas vezes: %s', async (qr) => {
    mocks.enroll.mockResolvedValue({ data: { id: 'new', totp: { qr_code: qr, secret: 'TEST' } }, error: null });
    renderGate();
    await startEnrollment();
    const image = await screen.findByRole('img', { name: /QR code/ });
    const src = image.getAttribute('src');
    expect(decodeURIComponent(src.slice(src.indexOf(',') + 1))).toBe('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  });

  it('substitui apenas cadastro pendente do admin após atualização da página', async () => {
    mocks.listFactors.mockResolvedValue({ data: { totp: [], all: [
      { id: 'old', factor_type: 'totp', status: 'unverified', friendly_name: 'Nello Admin' },
      { id: 'other', factor_type: 'totp', status: 'unverified', friendly_name: 'Other' },
    ] } });
    mocks.enroll.mockResolvedValue({ data: { id: 'new', totp: { secret: 'NEW' } } });
    renderGate();
    await startEnrollment();
    await screen.findByText('NEW');
    expect(mocks.unenroll).toHaveBeenCalledExactlyOnceWith({ factorId: 'old' });
    expect(mocks.unenroll.mock.invocationCallOrder[0]).toBeLessThan(mocks.enroll.mock.invocationCallOrder[0]);
  });

  it('preserva fator confirmado em outra sessão antes de iniciar configuração', async () => {
    mocks.listFactors.mockResolvedValueOnce({ data: { totp: [], all: [] } })
      .mockResolvedValue({ data: { totp: [{ id: 'verified', status: 'verified' }] } });
    renderGate();
    await startEnrollment();
    await screen.findByLabelText('Código de 6 dígitos');
    expect(mocks.unenroll).not.toHaveBeenCalled();
    expect(mocks.enroll).not.toHaveBeenCalled();
  });

  it('não cria outro fator se a limpeza do pendente falha', async () => {
    mocks.listFactors.mockResolvedValue({ data: { totp: [], all: [
      { id: 'old', factor_type: 'totp', status: 'unverified', friendly_name: 'Nello Admin' },
    ] } });
    mocks.unenroll.mockResolvedValue({ error: new Error('unavailable') });
    renderGate();
    await startEnrollment();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível iniciar');
    expect(mocks.enroll).not.toHaveBeenCalled();
  });

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

  it('autoriza operador reconhecido no banco mesmo sem flag visual no perfil', async () => {
    mocks.user = { id: 'operator-1', profile: { user_type: 'nutritionist', is_admin: false } };
    mocks.rpc.mockResolvedValue({ data: { eligible: true, authorized: true }, error: null });
    renderGate();
    expect(await screen.findByText('Dados administrativos')).toBeInTheDocument();
  });

  it('fecha o painel após revogação detectada ao retornar à aba', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { eligible: true, authorized: true }, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValue({ data: { eligible: false, authorized: false }, error: null });
    renderGate();
    expect(await screen.findByText('Dados administrativos')).toBeInTheDocument();
    fireEvent.focus(window);
    await waitFor(() => expect(screen.queryByText('Dados administrativos')).not.toBeInTheDocument());
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(3));
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'check_is_admin');
  });

  it('revalida acesso sem inflar a trilha de login quando continua autorizado', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { eligible: true, authorized: true }, error: null })
      .mockResolvedValue({ data: true, error: null });
    renderGate();
    expect(await screen.findByText('Dados administrativos')).toBeInTheDocument();
    fireEvent.focus(window);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'check_is_admin');
    expect(screen.getByText('Dados administrativos')).toBeInTheDocument();
  });

  it('não mostra dados do operador anterior durante troca de conta', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { eligible: true, authorized: true }, error: null })
      .mockImplementation(() => new Promise(() => {}));
    const view = renderGate();
    expect(await screen.findByText('Dados administrativos')).toBeInTheDocument();
    mocks.user = { id: 'patient-2', profile: { user_type: 'patient', is_admin: false } };
    view.rerender(<MemoryRouter><AdminAccessGate><div>Dados administrativos</div></AdminAccessGate></MemoryRouter>);
    expect(screen.queryByText('Dados administrativos')).not.toBeInTheDocument();
  });

  it('falha fechado quando a verificação de acesso fica indisponível', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent('não pôde ser validada');
    expect(screen.queryByText('Dados administrativos')).not.toBeInTheDocument();
  });
});
