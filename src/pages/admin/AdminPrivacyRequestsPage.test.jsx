import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPrivacyRequestsPage from './AdminPrivacyRequestsPage';
const mocks = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), toast: vi.fn() }));
vi.mock('@/features/privacy/api/privacy-queries', () => ({ listPrivacyRequestsForAdmin: mocks.list, updatePrivacyRequest: mocks.update }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
const item = { id: 'synthetic-request', subject_name: 'Pessoa fictícia', subject_email: 'privacy@example.invalid',
  request_type: 'deletion', status: 'triaged', revision: 2, due_at: '2026-10-10',
  retention_decision: 'retain_legal_obligation', legal_basis: 'Lei 13.787/2018 art. 6' };
beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue({ data: [item], error: null }); mocks.update.mockResolvedValue({ error: null }); });
describe('Administrative privacy custody flow', () => {
  it('preserves the custody decision while moving into operational verification', async () => {
    render(<AdminPrivacyRequestsPage />);
    await screen.findByText(/Pessoa fictícia/);
    fireEvent.click(screen.getAllByRole('button', { name: 'EM ATENDIMENTO' }).at(-1));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/BASE LEGAL/)).toHaveValue(item.legal_basis);
    expect(within(dialog).getByRole('combobox')).toHaveTextContent('RETER POR OBRIGAÇÃO LEGAL');
    fireEvent.change(within(dialog).getByLabelText('JUSTIFICATIVA/RESPOSTA AO TITULAR'), { target: { value: 'Verificação operacional iniciada.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'REGISTRAR ETAPA' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress', revision: 2, retentionDecision: 'retain_legal_obligation', legalBasis: item.legal_basis })));
  });
  it('prevents submitting a final response with a missing legal basis', async () => {
    render(<AdminPrivacyRequestsPage />);
    await screen.findByText(/Pessoa fictícia/);
    fireEvent.click(screen.getAllByRole('button', { name: 'RESPONDIDA', exact: true }).at(-1));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('JUSTIFICATIVA/RESPOSTA AO TITULAR'), { target: { value: 'Prontuário preservado sob guarda legal.' } });
    fireEvent.change(within(dialog).getByLabelText(/BASE LEGAL/), { target: { value: '' } });
    expect(within(dialog).getByRole('button', { name: 'REGISTRAR ETAPA' })).toBeDisabled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
