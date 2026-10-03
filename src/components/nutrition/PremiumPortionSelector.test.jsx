import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PremiumPortionSelector } from './PremiumPortionSelector';
vi.mock('@/hooks/useFoodMeasures', () => ({ useFoodMeasures: () => ({ data: [{ id: 'unit', label: 'Unidade média', weight_in_grams: 50 }] }) }));
vi.mock('@/hooks/useHouseholdMeasures', () => ({ useAllMeasures: () => ({ customMeasures: [] }) }));
vi.mock('@/hooks/useCustomMeasures', () => ({ useCreateCustomMeasure: () => ({}) }));
vi.mock('@/components/nutritionist/CustomMeasureFormDialog', () => ({ default: () => null }));
vi.mock('@/components/ui/select', () => ({
  Select: props => <div><button onClick={() => props.onValueChange('unit')}>Escolher unidade</button>{props.children}</div>,
  SelectTrigger: props => <div>{props.children}</div>, SelectContent: props => <div>{props.children}</div>,
  SelectItem: props => <div>{props.children}</div>, SelectGroup: props => <div>{props.children}</div>, SelectLabel: props => <div>{props.children}</div>,
}));
it('keeps the count on measure selection and converts mass only on explicit request', () => {
  function Editor() {
    const [value, setValue] = React.useState({ quantity: 100, measureCode: 'gram' });
    return <PremiumPortionSelector food={{ id: 'bread', calories: 285.6 }} value={value} onChange={setValue} />;
  }
  render(<Editor />);
  fireEvent.click(screen.getByRole('button', { name: 'Escolher unidade' }));
  expect(screen.getByLabelText('Quantidade')).toHaveValue(100);
  fireEvent.click(screen.getByRole('button', { name: 'Converter para manter os 100 g anteriores' }));
  expect(screen.getByLabelText('Quantidade')).toHaveValue(2);
  fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '' } });
  expect(screen.getByLabelText('Quantidade')).toHaveValue(null);
  expect(screen.queryByRole('button', { name: /Converter para manter/ })).not.toBeInTheDocument();
});
