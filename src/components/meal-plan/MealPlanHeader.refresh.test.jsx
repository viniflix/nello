import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import MealPlanHeader from './MealPlanHeader';

it('keeps refresh copy and layout stable while retaining the action lock', () => {
  const onRefresh = vi.fn();
  const view = render(<MemoryRouter><MealPlanHeader onRefresh={onRefresh} /></MemoryRouter>);
  const button = screen.getByRole('button', { name: 'Atualizar' });
  fireEvent.click(button); expect(onRefresh).toHaveBeenCalledOnce();
  view.rerender(<MemoryRouter><MealPlanHeader onRefresh={onRefresh} fetching /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Atualizar' })).toBe(button);
  expect(button).toBeDisabled(); expect(button).toHaveAttribute('aria-busy', 'true');
  expect(button.querySelector('.animate-spin')).toBeNull();
  expect(screen.queryByText(/Atualizando/)).not.toBeInTheDocument();
  view.rerender(<MemoryRouter><MealPlanHeader onRefresh={onRefresh} /></MemoryRouter>);
  expect(button).toBeEnabled();
});
