import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import PlanMealsOverview from './PlanMealsOverview';
it('keeps meal order, excludes alternatives from percentages and exposes unfinished quantities and options', () => {
    render(<PlanMealsOverview dailyCalories={300} meals={[
        {id:'alternative',name:'Jantar alternativo',include_in_totals:false,total_calories:150,foods:[]},
        {id:'breakfast',name:'Café',meal_time:'08:00:00',total_calories:300,notes:'Preparar antes',foods:[{id:'bread',patient_description:'Pão preferido',quantity:0,unit:'gram',substitutes:[{name:'Tapioca',quantity:30,unit:'gram'}]}]},
    ]} />);
    const summaries = document.querySelectorAll('summary');
    expect(summaries[0]).toHaveTextContent('Jantar alternativo');
    expect(summaries[0]).not.toHaveTextContent('%');
    expect(summaries[1]).toHaveTextContent('100% do dia');
    fireEvent.click(screen.getByRole('button',{name:'Expandir refeições'}));
    expect(screen.getByText('Pão preferido')).toBeVisible();
    expect(screen.getByText('Preparar antes')).toBeVisible();
    expect(screen.getByText(/Tapioca · 30/)).toBeVisible();
    expect(screen.getByText(/^0\s*g$/)).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Recolher refeições'}));
    expect(screen.getByText('Pão preferido')).not.toBeVisible();
});
