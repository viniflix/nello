import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import MealPlanList from './MealPlanList';
vi.mock('./MealPlanPreviewDialog',()=>({default:props=><div><span>Prévia {props.planId}</span><button onClick={props.onClose}>Fechar prévia</button><button onClick={()=>props.onEdit(props.planId)}>Editar este plano</button></div>}));
it('searches accents, offers a reading preview and keeps every labeled action bound to its plan',()=>{
    const edit=vi.fn(),copy=vi.fn(),activate=vi.fn(),remove=vi.fn();
    const props={activePlan:{id:'other'},plans:[{id:'p',name:'Plano João',is_active:false}],pendingDrafts:[],plansModalOpen:true,setPlansModalOpen:vi.fn(),plansSearchTerm:'joao',setPlansSearchTerm:vi.fn(),formatDate:()=>'',handleEdit:edit,handleCopy:copy,handleSetActive:activate,setPlanToDelete:remove,setDeleteDialogOpen:vi.fn()};
    const view=render(<MealPlanList {...props} />);
    fireEvent.click(screen.getByRole('button',{name:'Ver Plano João'}));expect(screen.getByText('Prévia p')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Fechar prévia'}));
    fireEvent.click(screen.getByRole('button',{name:'Editar Plano João'}));expect(edit).toHaveBeenCalledWith('p');
    fireEvent.click(screen.getByRole('button',{name:'Copiar Plano João para outro paciente'}));expect(copy).toHaveBeenCalledWith('p');
    fireEvent.click(screen.getByRole('button',{name:'Ativar Plano João'}));expect(activate).toHaveBeenCalledWith('p');
    fireEvent.click(screen.getByRole('button',{name:'Excluir Plano João'}));expect(remove).toHaveBeenCalledWith('p');
    view.rerender(<MealPlanList {...props} plansSearchTerm="nenhum" />);
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum plano encontrado');
});
it('opens one window at a time, returns to the list on close and opens editing without reopening the list',()=>{
    const edit=vi.fn();
    function Harness(){
        const [open,setOpen]=useState(true);
        return <MealPlanList activePlan={{id:'p'}} patientId="patient" plans={[{id:'p',name:'Plano atual',is_active:true}]} pendingDrafts={[]} plansModalOpen={open} setPlansModalOpen={setOpen} plansSearchTerm="" setPlansSearchTerm={vi.fn()} formatDate={()=>''} handleEdit={edit} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button',{name:'Ver Plano atual'}));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Fechar prévia'}));
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Ver Plano atual'}));
    fireEvent.click(screen.getByRole('button',{name:'Editar este plano'}));
    expect(edit).toHaveBeenCalledWith('p');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Prévia p')).toBeNull();
});
it('preserves scoped preview navigation when a protected data reload remounts the list',()=>{
    function Harness(){
        const [preview,setPreview]=useState({id:null,fromList:false});
        const [loading,setLoading]=useState(false);
        const [open,setOpen]=useState(true);
        return <><button onClick={()=>setLoading(value=>!value)}>Reload protected data</button>{!loading&&<MealPlanList previewState={preview} setPreviewState={setPreview} activePlan={{id:'p'}} patientId="patient" plans={[{id:'p',name:'Plano atual'}]} pendingDrafts={[]} plansModalOpen={open} setPlansModalOpen={setOpen} plansSearchTerm="" setPlansSearchTerm={vi.fn()} formatDate={()=>''} />}</>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button',{name:'Ver Plano atual'}));
    fireEvent.click(screen.getByRole('button',{name:'Reload protected data'}));
    expect(screen.queryByText('Prévia p')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Reload protected data'}));
    expect(screen.getByText('Prévia p')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Fechar prévia'}));
    expect(screen.getByRole('dialog')).toBeVisible();
});
