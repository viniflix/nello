import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import MacrosChart from './MacrosChart';
vi.mock('./ReferenceValuesModal',()=>({default:()=>null}));
it('provides an accessible complete circle for a single macro and an honest empty state',()=>{
    const view=render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><MacrosChart protein={0} carbs={25} fat={0} calories={100} readOnly /></MemoryRouter>);
    expect(screen.getByRole('img')).toHaveAccessibleName(/carboidratos 100%/);
    expect(document.querySelector('circle[stroke-dasharray]')).toHaveAttribute('stroke-dasharray','100 0');
    expect(screen.getByRole('button',{name:'Macronutrientes'})).toHaveAttribute('aria-pressed','true');
    view.rerender(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><MacrosChart protein={0} carbs={0} fat={0} calories={0} readOnly /></MemoryRouter>);
    expect(screen.getByText('Sem macronutrientes quantificados.')).toBeVisible();
    expect(document.querySelector('circle[stroke-dasharray]')).toBeNull();
});

it('shows the known portion of partial micronutrients without claiming adequacy or inventing a nonzero bar', () => {
    const plan = { meals: [{ foods: [
        { quantity: 100, unit: 'gram', food: { fiber: 10, calcium: 1500, sodium: 0 } },
        { quantity: 100, unit: 'gram', food: { fiber: null, calcium: null, sodium: 0 } },
    ] }] };
    render(<MemoryRouter><MacrosChart plan={plan} readOnly /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Micronutrientes' }));
    const fiber = screen.getByRole('img', { name: /Fibras: quantidade conhecida, pelo menos 40%.*adequação não avaliada/ });
    expect(fiber.firstElementChild).toHaveStyle({ width: '40%' });
    expect(screen.getByRole('img', { name: /Cálcio: quantidade conhecida, pelo menos 150%/ }).firstElementChild).toHaveStyle({ width: '100%' });
    expect(screen.getByRole('img', { name: /Sódio: 0%/ }).firstElementChild).toHaveStyle({ width: '0%' });
    expect(screen.getByRole('img', { name: 'Ferro: não informado' }).firstElementChild).toHaveStyle({ width: '0%' });
    expect(screen.getByText('≥ 10 g (parcial)')).toBeVisible();
});
