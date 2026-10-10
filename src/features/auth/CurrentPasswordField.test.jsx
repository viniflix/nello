import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CurrentPasswordField from './CurrentPasswordField';

afterEach(cleanup);
it('accepts the approved six-digit current credential without exposing it and permits server-authorized recovery without that credential', () => {
  const change = vi.fn();
  const view = render(<CurrentPasswordField value="010190" onChange={change} disabled={false} />);
  const field = screen.getByLabelText('Senha atual');
  expect(field).toHaveAttribute('type', 'password');
  expect(field).not.toBeRequired();
  expect(field).toHaveAccessibleDescription(/link de recuperação ou convite/);
  fireEvent.change(field, { target: { value: ' 010190 ' } });
  expect(change).toHaveBeenCalledOnce();
  view.rerender(<CurrentPasswordField value="010190" onChange={change} disabled />);
  expect(field).toBeDisabled();
});
