import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './table';
afterEach(cleanup);
it('keeps header semantics, labels and the same action callback in the mobile presentation', () => {
  const edit = vi.fn();
  render(<Table aria-label="Lançamentos" mobileLabels={['Descrição', 'Valor', 'Ações']}><TableHeader><TableRow><TableHead>Descrição</TableHead><TableHead>Valor</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Consulta</TableCell><TableCell>R$ 100,00</TableCell><TableCell><button onClick={edit}>Editar</button></TableCell></TableRow></TableBody></Table>);
  expect(screen.getByRole('columnheader', { name: 'Valor' })).toHaveAttribute('scope', 'col');
  expect(screen.getByRole('cell', { name: 'R$ 100,00' })).toHaveAttribute('data-label', 'Valor');
  fireEvent.click(screen.getByRole('button', { name: 'Editar' })); expect(edit).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('region', { name: 'Lançamentos' })).toHaveAttribute('tabindex', '0');
});
