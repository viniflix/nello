import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PremiumPortionSelector } from './PremiumPortionSelector';
vi.mock('@/hooks/useFoodMeasures', () => ({ useFoodMeasures: () => ({ data: [{ id: 'unit', label: 'Unidade média', weight_in_grams: 50 }], refetch: vi.fn() }) }));
const measures=vi.hoisted(()=>({customMeasures:[],error:null,refetch:vi.fn()}));
vi.mock('@/hooks/useHouseholdMeasures', () => ({ useAllMeasures: () => measures }));
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
it('keeps a typed portion while retrying failed measures and clears the alert on recovery',()=>{
 const quantity={quantity:2,measureCode:'gram'},onChange=vi.fn();measures.error={status:503};
 const ui=render(<PremiumPortionSelector food={{id:'bread',calories:285.6}} value={quantity} onChange={onChange}/>);
 expect(ui.getByRole('alert')).toHaveTextContent('Não foi possível carregar suas medidas');fireEvent.click(ui.getByRole('button',{name:'Tentar carregar novamente'}));
 expect(measures.refetch).toHaveBeenCalledOnce();expect(onChange).not.toHaveBeenCalled();expect(ui.getByLabelText('Quantidade')).toHaveValue(2);
 measures.error=null;ui.rerender(<PremiumPortionSelector food={{id:'bread',calories:285.6}} value={quantity} onChange={onChange}/>);expect(ui.queryByRole('alert')).toBeNull();expect(ui.getByLabelText('Quantidade')).toHaveValue(2);
});
