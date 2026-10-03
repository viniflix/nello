import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import MealPlanPreviewDialog from './MealPlanPreviewDialog';
const mock = vi.hoisted(() => ({read:vi.fn()}));
vi.mock('@/lib/supabase/meal-plan-queries',()=>({getMealPlanById:mock.read}));
beforeEach(()=>mock.read.mockReset());
it('discards late previews when another plan is opened and edit targets the visible plan',async()=>{
    let finish;
    mock.read.mockImplementation(id=>id==='old'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({data:{id,patient_id:'patient',name:'Plano novo',meals:[]}}));
    const edit=vi.fn();const close=vi.fn();
    const view=render(<MealPlanPreviewDialog planId="old" patientId="patient" onClose={close} onEdit={edit} />);
    view.rerender(<MealPlanPreviewDialog planId="new" patientId="patient" onClose={close} onEdit={edit} />);
    await screen.findByText('Plano novo');
    await act(async()=>finish({data:{id:'old',patient_id:'patient',name:'Resposta atrasada',meals:[]}}));
    expect(screen.queryByText('Resposta atrasada')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Editar este plano'}));
    expect(edit).toHaveBeenCalledWith('new');expect(close).not.toHaveBeenCalled();
});
it('rejects a different patient scope and allows retry without opening an editor',async()=>{
    mock.read.mockResolvedValueOnce({data:{id:'plan',patient_id:'other',name:'Outro paciente',meals:[]}}).mockResolvedValueOnce({data:{id:'plan',patient_id:'patient',name:'Plano correto',meals:[]}});
    render(<MealPlanPreviewDialog planId="plan" patientId="patient" onClose={vi.fn()} onEdit={vi.fn()} />);
    await screen.findByRole('alert');expect(screen.queryByText('Outro paciente')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));
    await screen.findByText('Plano correto');
});
