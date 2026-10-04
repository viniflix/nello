import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import MealPlanOverview from './MealPlanOverview';
it('shows actual energy and refuses to label the mathematical ratio as adherence', () => {
    const view=render(<MealPlanOverview plan={{daily_calories:1800,meals:[{}],updated_at:'2026-10-04'}} target={2000} formatDate={value=>value || '—'} />);
    expect(screen.getByText('1.800 kcal')).toBeVisible();
    expect(screen.getByText('90%')).toBeVisible();
    expect(screen.queryByText(/aderência/i)).not.toBeInTheDocument();
    view.rerender(<MealPlanOverview plan={{daily_calories:0}} target={null} formatDate={value=>value || '—'} />);
    expect(screen.getByText('Não definida')).toBeVisible();
});
