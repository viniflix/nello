import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountEmailChange from './AccountEmailChange';

const updateUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: { updateUser } } }));

describe('AccountEmailChange', () => {
  beforeEach(() => updateUser.mockReset());

  it('solicita confirmação pelo Auth sem editar o perfil antes da confirmação', async () => {
    updateUser.mockResolvedValue({ error: null });
    render(<AccountEmailChange currentEmail="ana@old.example" />);
    fireEvent.change(screen.getByLabelText('Novo email de acesso'), { target: { value: 'Ana@NelloNutri.com.br' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar alteração' }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ email: 'ana@nellonutri.com.br' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Confirme a alteração');
  });

  it('não solicita a troca para o mesmo endereço', () => {
    render(<AccountEmailChange currentEmail="ana@nellonutri.com.br" />);
    fireEvent.change(screen.getByLabelText('Novo email de acesso'), { target: { value: 'ANA@NELLONUTRI.COM.BR' } });
    expect(screen.getByRole('button', { name: 'Solicitar alteração' })).toBeDisabled();
    expect(updateUser).not.toHaveBeenCalled();
  });
});
