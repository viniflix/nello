import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import DriActivitySelector from './DriActivitySelector';

it('shows an unselected activity and a route to fix missing sex instead of PA null', () => {
  const edit = vi.fn();
  render(<DriActivitySelector value="" onChange={vi.fn()} protocol="eer_iom" gender="" onEditBiometry={edit} />);
  expect(screen.getByRole('radiogroup', { name: 'Nível de atividade física *' })).toBeInTheDocument();
  expect(screen.getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
  expect(screen.queryByText(/PA null/)).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Informe o sexo');
  fireEvent.click(screen.getByRole('button', { name: 'Preencher sexo na biometria' }));
  expect(edit).toHaveBeenCalledOnce();
});

it('keeps the chosen activity when sex becomes available and updates PA when sex changes', () => {
  const props = { value: 'active', onChange: vi.fn(), protocol: 'eer_iom', onEditBiometry: vi.fn() };
  const { rerender } = render(<DriActivitySelector {...props} gender="" />);
  expect(screen.getByRole('radio', { name: /Ativo/ })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('radio', { name: /Ativo/ })).not.toHaveTextContent('null');
  rerender(<DriActivitySelector {...props} gender="F" />);
  expect(screen.getByRole('radio', { name: /Ativo \(PA 1,27\)/ })).toHaveAttribute('aria-checked', 'true');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  rerender(<DriActivitySelector {...props} gender="M" />);
  expect(screen.getByRole('radio', { name: /Ativo \(PA 1,25\)/ })).toHaveAttribute('aria-checked', 'true');
  rerender(<DriActivitySelector {...props} gender="M" protocol="dri_2023" />);
  expect(screen.getByRole('radio', { name: /Ativo/ })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('radio', { name: /Ativo/ })).not.toHaveTextContent('PA');
});

it('lets the user choose an activity from the visible options', () => {
  const onChange = vi.fn();
  render(<DriActivitySelector value="" onChange={onChange} protocol="dri_2023" gender="F" onEditBiometry={vi.fn()} />);
  fireEvent.click(screen.getByRole('radio', { name: /Pouco ativo/ }));
  expect(onChange).toHaveBeenCalledWith('low_active');
});
