import React from 'react';
import { roundedNutrition } from '@/lib/utils/mealPlanPresentation';

export const nutrientStyles = [
    { key: 'calories', label: 'Energia', unit: 'kcal', classes: 'border-green-200 bg-green-50 text-green-900' },
    { key: 'protein', label: 'Proteínas', unit: 'g', classes: 'border-violet-200 bg-violet-50 text-violet-900' },
    { key: 'carbs', label: 'Carboidratos', unit: 'g', classes: 'border-blue-200 bg-blue-50 text-blue-900' },
    { key: 'fat', label: 'Gorduras', unit: 'g', classes: 'border-orange-200 bg-orange-50 text-orange-900' },
];
export default function PlanNutritionTotals({ plan }) {
    return <dl aria-label="Totais diários do plano" className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 7.5rem), 1fr))' }}>
        {nutrientStyles.map(item => <div key={item.key} className={`min-w-0 rounded-xl border p-3 ${item.classes}`}>
            <dt className="text-sm font-medium">{item.label}</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{roundedNutrition(plan?.[`daily_${item.key}`])} <span className="text-sm font-medium">{item.unit}</span></dd>
        </div>)}
    </dl>;
}
