import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import AddFoodToMealDialog from './AddFoodToMealDialog';

vi.mock('@/hooks/useShadowDraft', () => ({ useShadowDraft: () => ({ ready: true, status: 'idle', queue: () => {}, discard: async () => true }) }));
vi.mock('./FoodSelector', () => ({ default: props => <section aria-label="Busca de alimentos"><input aria-label="Busca" ref={props.searchInputRef} /><button onClick={() => props.onSelect({ id: 'bread', name: 'Pão', calories: 200 })}>Escolher pão</button><button onClick={() => props.onSelect({ id: 'cheese', name: 'Queijo', calories: 300 })}>Escolher queijo</button></section> }));
vi.mock('@/components/nutrition', () => ({ PremiumPortionSelector: props => {
  const nutrition = React.useMemo(() => props.food ? { grams: Number(props.value.quantity), calories: Number(props.value.quantity) * props.food.calories / 100 } : null, [props.food, props.value.quantity]);
  const { onNutritionChange } = props;
  React.useEffect(() => onNutritionChange(nutrition), [nutrition, onNutritionChange]);
  return <input aria-label="Quantidade" value={props.value.quantity} onChange={event => props.onChange({ ...props.value, quantity: event.target.value })} />;
} }));

it('keeps one food editor open while adding consecutive foods and clears only the next food fields', async () => {
  const add = vi.fn(); const close = vi.fn();
  render(<AddFoodToMealDialog isOpen onAdd={add} onClose={close} />);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Escolher pão' }));
  expect(screen.getByLabelText('Quantidade')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '50' } });
  fireEvent.change(screen.getByLabelText(/Observações/), { target: { value: 'Tostar levemente' } });
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar e continuar' }));
  await waitFor(() => expect(add).toHaveBeenCalledWith(expect.objectContaining({ food_id: 'bread', quantity: '50', calories: 100, notes: 'Tostar levemente' })));
  await waitFor(() => expect(screen.getByLabelText('Quantidade')).toHaveValue(''));
  expect(screen.getByLabelText(/Observações/)).toHaveValue('');
  expect(screen.getByLabelText('Busca')).toHaveFocus();
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Escolher queijo' }));
  fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar', exact: true }));
  await waitFor(() => expect(add).toHaveBeenLastCalledWith(expect.objectContaining({ food_id: 'cheese', quantity: '0', calories: 0, notes: null })));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});
