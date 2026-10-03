import React, { useState } from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Input } from './input';
afterEach(cleanup);
function ControlledNumber() {
  const [value, setValue] = useState(120);
  return <><Input aria-label="Quantidade" type="number" value={value} onChange={event => setValue(Number(event.target.value) || 0)} /><button onClick={() => setValue(45)}>Atualizar</button></>;
}
describe('numeric editing', () => {
  it('can remove a middle digit, clear the field, and enter a replacement without a forced zero', () => {
    render(<ControlledNumber />);
    const input = screen.getByLabelText('Quantidade');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '10' } });
    expect(input.value).toBe('10');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '2.5' } });
    expect(input.value).toBe('2.5');
    fireEvent.blur(input);
    expect(input.value).toBe('2.5');
  });
  it('reflects an external update while focused', () => {
    render(<ControlledNumber />);
    const input = screen.getByLabelText('Quantidade');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('Atualizar'));
    expect(input.value).toBe('45');
  });
});
