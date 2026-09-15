import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CheckinResponsePage from './CheckinResponsePage';

const mocks = vi.hoisted(() => ({
  sessionId: 'invalid-session',
  from: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useParams: () => ({ sessionId: mocks.sessionId }),
  };
});
vi.mock('@/hooks/useCheckins', () => ({
  useCheckins: () => ({ submitCheckin: { mutateAsync: vi.fn() } }),
}));
vi.mock('@/lib/customSupabaseClient', () => ({
  supabase: { from: mocks.from },
}));

beforeEach(() => {
  mocks.sessionId = 'invalid-session';
  mocks.from.mockReset();
});

describe('carregamento seguro do check-in', () => {
  it('rejeita identificador malformado sem consultar o banco', async () => {
    render(<MemoryRouter><CheckinResponsePage /></MemoryRouter>);

    expect(await screen.findByText('Check-in não encontrado.')).toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('não permite concluir uma sessão sem perguntas', async () => {
    mocks.sessionId = '8c1a43d1-7d51-4e2f-86c5-2bd4f672d752';
    const sessionQuery = {
      select: vi.fn(() => sessionQuery),
      eq: vi.fn(() => sessionQuery),
      single: vi.fn(async () => ({
        data: { id: mocks.sessionId, status: 'pending', template_id: 'template-id' },
        error: null,
      })),
    };
    const fieldsQuery = {
      select: vi.fn(() => fieldsQuery),
      eq: vi.fn(() => fieldsQuery),
      order: vi.fn(async () => ({ data: [], error: null })),
    };
    mocks.from.mockImplementation((table) => table === 'checkin_sessions' ? sessionQuery : fieldsQuery);

    render(<MemoryRouter><CheckinResponsePage /></MemoryRouter>);

    expect(await screen.findByText('Este check-in ainda não possui perguntas disponíveis.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finalizar Check-in' })).not.toBeInTheDocument();
  });
});
