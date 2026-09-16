import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import DriActivitySelector from './DriActivitySelector';

it('shows an unselected activity and a route to fix missing sex instead of PA null', () => {
  const edit = vi.fn();
  render(<DriActivitySelector value="" onChange={vi.fn()} protocol="eer_iom" gender="" onEditBiometry={edit} />);
  expect(screen.getByRole('combobox')).toHaveTextContent('Selecione o nível de atividade');
  expect(screen.queryByText(/PA null/)).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Informe o sexo');
  fireEvent.click(screen.getByRole('button', { name: 'Preencher sexo na biometria' }));
  expect(edit).toHaveBeenCalledOnce();
});

it('keeps the chosen activity when sex becomes available and updates PA when sex changes', () => {
  const props = { value: 'active', onChange: vi.fn(), protocol: 'eer_iom', onEditBiometry: vi.fn() };
  const { rerender } = render(<DriActivitySelector {...props} gender="" />);
  expect(screen.getByRole('combobox')).toHaveTextContent('Ativo');
  expect(screen.getByRole('combobox')).not.toHaveTextContent('null');
  rerender(<DriActivitySelector {...props} gender="F" />);
  expect(screen.getByRole('combobox')).toHaveTextContent('Ativo (PA 1,27)');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  rerender(<DriActivitySelector {...props} gender="M" />);
  expect(screen.getByRole('combobox')).toHaveTextContent('Ativo (PA 1,25)');
  rerender(<DriActivitySelector {...props} gender="M" protocol="dri_2023" />);
  expect(screen.getByRole('combobox')).toHaveTextContent('Ativo');
  expect(screen.getByRole('combobox')).not.toHaveTextContent('PA');
});
