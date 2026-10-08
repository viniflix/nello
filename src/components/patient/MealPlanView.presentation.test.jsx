import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import MealPlanView from './MealPlanView';
import MealPlanViewDialog from './MealPlanViewDialog';
vi.mock('@/lib/pdf/savedClinicalPdf',()=>({downloadSavedClinicalPdf:vi.fn()}));
const meals=[
    {id:'dinner',name:'Jantar primeiro',meal_type:'dinner',order_index:0,include_in_totals:false,meal_plan_foods:[{foods:{name:'Peixe'},quantity:100,unit:'gram',calories:300,protein:30,carbs:0,fat:20}]},
    {id:'breakfast',name:'Café depois',meal_type:'breakfast',order_index:1,notes:'Nota da refeição',meal_plan_foods:[{foods:{name:'Pão'},patient_description:'Pão para o paciente',notes:'Nota do alimento',quantity:0,unit:'gram',calories:100,protein:4,carbs:20,fat:1,substitutes:[{name:'Tapioca',quantity:20,unit:'gram'}]}]},
];
it('shows the clinician order, patient descriptions, notes and substitute portions',()=>{
    render(<MealPlanView mealPlanItems={[meals[1],meals[0]]} />);
    const headings=screen.getAllByRole('heading');expect(headings.map(item=>item.textContent)).toEqual(['Jantar primeiro','Café depois']);
    expect(screen.getByText('Pão para o paciente')).toBeVisible();
    expect(screen.getByText('Nota da refeição')).toBeVisible();expect(screen.getByText('Nota do alimento')).toBeVisible();
    expect(screen.getByText(/Tapioca · 20/)).toBeVisible();
});
it('patient dialog excludes alternate meals from daily totals, retains them for reading and keeps per-food macros',()=>{
    render(<MealPlanViewDialog open onOpenChange={vi.fn()} mealPlan={{id:'p',name:'Plano de teste',start_date:'2026-10-03',meal_plan_meals:meals}} />);
    expect(screen.getByLabelText('Totais diários do plano')).toHaveTextContent('100 kcal');
    expect(screen.getByText('Peixe')).toBeVisible();
    expect(screen.getByText(/Proteínas 30 g/)).toBeVisible();
    expect(screen.getByText(/De 03\/10\/2026/)).toBeVisible();
    expect(screen.getByText('Refeição alternativa — não contabilizada nos totais.')).toBeVisible();
});
it('patient totals retain measured zero fiber and incomplete catalog coverage',()=>{
    render(<MealPlanViewDialog open onOpenChange={vi.fn()} mealPlan={{id:'p',meal_plan_meals:[{id:'meal',meal_plan_foods:[{quantity:100,unit:'gram',foods:{name:'Conhecido',fiber:0}},{quantity:100,unit:'gram',foods:{name:'Desconhecido',fiber:null}}]}]}} />);
    const totals=screen.getByLabelText('Totais diários do plano');
    expect(totals).toHaveTextContent('≥ 0 g');
    expect(totals).toHaveTextContent('Dados do catálogo incompletos');
});
