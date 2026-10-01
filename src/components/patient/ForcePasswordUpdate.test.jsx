import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ForcePasswordUpdate from './ForcePasswordUpdate';
import { clearPasswordReminders, hasDismissedPasswordReminder } from '@/features/auth/passwordReminder';

const mocks = vi.hoisted(() => ({ user: { id: 'patient-a' }, updateUser: vi.fn(), from: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, updateUserProfile: vi.fn() }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: { updateUser: mocks.updateUser }, from: mocks.from } }));
afterEach(() => { cleanup(); clearPasswordReminders(); });

it('allows the approved optional continuation without changing credentials and scopes it to the current account', () => {
  const ui = <ForcePasswordUpdate><p>Área autenticada</p></ForcePasswordUpdate>;
  const view = render(ui);
  expect(screen.queryByText('Área autenticada')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar com a senha atual' }));
  expect(screen.getByText('Área autenticada')).toBeVisible();
  expect(hasDismissedPasswordReminder('patient-a')).toBe(true);
  expect(mocks.updateUser).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
  mocks.user = { id: 'patient-b' };
  view.rerender(<ForcePasswordUpdate><p>Área autenticada</p></ForcePasswordUpdate>);
  expect(screen.getByRole('button', { name: 'Continuar com a senha atual' })).toBeVisible();
  expect(screen.queryByText('Área autenticada')).toBeNull();
  expect(hasDismissedPasswordReminder('patient-b')).toBe(false);
});
