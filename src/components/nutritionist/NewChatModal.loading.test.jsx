import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NewChatModal from './NewChatModal';
const mocks = vi.hoisted(() => ({ user: { id: 'synthetic-a' }, rpc: vi.fn(), access: null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/components/ui/private-image', () => ({ PrivateImage: () => null }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/infrastructure/realtime/events', () => ({ subscribeDomain: (id, kind, fn) => { mocks.access = fn; return () => { mocks.access = null; }; } }));
const row = name => ({ id: 'synthetic-patient', name, is_active: true });
const props = { open: true, onOpenChange: vi.fn(), onSelectPatient: vi.fn() };
describe('New chat modal session loading', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.user = { id: 'synthetic-a' }; mocks.rpc.mockResolvedValue({ data: [row('Paciente fictício')], error: null }); });
  it('keeps search/focus and avoids querying again for a same-account object', async () => {
    const { rerender } = render(<NewChatModal {...props} />); await screen.findByText('Paciente fictício');
    const search = screen.getByPlaceholderText('Buscar por nome...'); fireEvent.change(search, { target: { value: 'fictício' } }); search.focus();
    mocks.user = { ...mocks.user }; rerender(<NewChatModal {...props} />); await act(async () => {});
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(search).toHaveValue('fictício'); expect(search).toHaveFocus();
  });
  it('clears the account scope and ignores a pending old account result', async () => {
    let resolve; mocks.rpc.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const { rerender } = render(<NewChatModal {...props} />); await act(async () => {});
    fireEvent.change(screen.getByPlaceholderText('Buscar por nome...'), { target: { value: 'Private' } });
    mocks.user = { id: 'synthetic-b' }; rerender(<NewChatModal {...props} />);
    await act(async () => {}); await act(async () => resolve({ data: [row('Private old account')], error: null }));
    expect(screen.queryByText('Private old account')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Buscar por nome...')).toHaveValue('');
    expect(mocks.rpc).toHaveBeenLastCalledWith('get_patients_for_new_chat', { p_nutritionist_id: 'synthetic-b' });
  });
  it('does not let a request from the previous opening replace the new list', async () => {
    let resolve; mocks.rpc.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const { rerender } = render(<NewChatModal {...props} />); await act(async () => {});
    rerender(<NewChatModal {...props} open={false} />); rerender(<NewChatModal {...props} />);
    await screen.findByText('Paciente fictício');
    await act(async () => resolve({ data: [row('Old opening')], error: null }));
    expect(screen.queryByText('Old opening')).not.toBeInTheDocument();
  });
  it('still revalidates access with the current actor and removes the revoked patient', async () => {
    render(<NewChatModal {...props} />); await screen.findByText('Paciente fictício');
    mocks.rpc.mockResolvedValue({ data: [], error: null }); act(() => mocks.access());
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Paciente fictício')).not.toBeInTheDocument();
  });
  it('preserves search on a failed read and allows an explicit retry', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'NETWORK_FAILURE' } });
    render(<NewChatModal {...props} />); await screen.findByRole('alert');
    fireEvent.change(screen.getByPlaceholderText('Buscar por nome...'), { target: { value: 'fictício' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await screen.findByText('Paciente fictício');
    expect(screen.getByPlaceholderText('Buscar por nome...')).toHaveValue('fictício');
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
