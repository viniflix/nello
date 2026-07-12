import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudentSupervisionCard from './StudentSupervisionCard';

const request = vi.fn();
const respond = vi.fn();
const load = vi.fn();

vi.mock('@/lib/supabase/supervision-queries', () => ({
  requestStudentSupervision: (...args) => request(...args),
  respondStudentSupervision: (...args) => respond(...args),
  endStudentSupervision: vi.fn(),
  getMyStudentSupervisions: (...args) => load(...args)
}));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('StudentSupervisionCard', () => {
  beforeEach(() => {
    request.mockReset();
    respond.mockReset();
    load.mockResolvedValue({ data: [], error: null });
  });

  it('lets an approved student request a supervisor by email', async () => {
    request.mockResolvedValue({ data: { success: true }, error: null });
    render(<StudentSupervisionCard verification={{ professional_role: 'student', status: 'approved' }} />);
    fireEvent.change(screen.getByLabelText(/e-mail do supervisor/i), { target: { value: 'supervisor@nello.test' } });
    fireEvent.click(screen.getByRole('button', { name: /solicitar supervisão/i }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('supervisor@nello.test'));
  });

  it('lets a nutritionist accept a pending request with an audited reason', async () => {
    load.mockResolvedValue({ data: [{ id: 'rel-1', perspective: 'supervisor', status: 'pending', counterpart_name: 'Aluna Teste' }], error: null });
    respond.mockResolvedValue({ data: { success: true }, error: null });
    render(<StudentSupervisionCard verification={{ professional_role: 'nutritionist', status: 'approved' }} />);
    expect(await screen.findByText('Aluna Teste')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/motivo da decisão/i), { target: { value: 'Supervisão acadêmica confirmada' } });
    fireEvent.click(screen.getByRole('button', { name: /aceitar supervisão/i }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith('rel-1', 'active', 'Supervisão acadêmica confirmada'));
  });
});
