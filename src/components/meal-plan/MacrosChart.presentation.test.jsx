import React from 'react';
import { render, screen } from '@testing-library/react';
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
