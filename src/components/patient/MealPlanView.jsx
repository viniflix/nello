import React from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { translateMealType } from '@/utils/mealTranslations';
import { roundedNutrition } from '@/lib/utils/mealPlanPresentation';
import { formatQuantityWithUnit } from '@/lib/utils/measureTranslations';

/**
 * MealPlanView - Visualização do plano alimentar
 *
 * Estrutura esperada:
 * meal_plan_meals: [
 *   {
 *     id, name, meal_type, meal_time,
 *     meal_plan_foods: [
 *       { quantity, unit, foods: { name } }
 *     ]
 *   }
 * ]
 */
const MealPlanView = ({ mealPlanItems, showNutrition = false }) => {
  if (!mealPlanItems || mealPlanItems.length === 0) {
    return (
      <div className="text-center py-10">
        <UtensilsCrossed className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">Nenhuma refeição foi adicionada a este plano alimentar.</p>
      </div>
    );
  }

  // Respect the clinician's order instead of regrouping alternatives by type.
  const orderedMeals = [...mealPlanItems].sort((a, b) => (a.order_index ?? mealPlanItems.indexOf(a)) - (b.order_index ?? mealPlanItems.indexOf(b)));

  return (
    <div className="space-y-4">
      {orderedMeals.map((meal) => (
        <section key={meal.id} className="rounded-xl border border-l-4 border-l-primary bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="break-words text-base font-semibold text-foreground">{meal.name || translateMealType(meal.meal_type)}</h4>
            {meal.meal_time && <span className="rounded bg-primary/10 px-2 py-1 text-sm text-primary">{meal.meal_time.slice(0,5)}</span>}
          </div>
          {meal.notes && <p className="mb-3 whitespace-pre-wrap break-words rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{meal.notes}</p>}
              {meal.meal_plan_foods && meal.meal_plan_foods.length > 0 ? (
                <ul className="space-y-1.5">
                  {meal.meal_plan_foods.map((foodItem, index) => (
                    <li key={index} className="space-y-1">
                      <div className="flex flex-wrap justify-between items-start gap-x-3 gap-y-1 text-sm">
                        <span className="min-w-0 flex-1 basis-40 break-words text-foreground">
                          {foodItem.patient_description || foodItem.foods?.name || 'Alimento sem nome'}
                        </span>
                        <span className="font-medium text-primary">
                          {formatQuantityWithUnit(foodItem.quantity || 0, foodItem.unit || '', foodItem.measure || foodItem.measure_snapshot)}
                        </span>
                      </div>
                      {foodItem.notes && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{foodItem.notes}</p>}
                      {showNutrition && <p className="text-xs text-muted-foreground">{roundedNutrition(foodItem.calories)} kcal · Proteínas {roundedNutrition(foodItem.protein)} g · Carboidratos {roundedNutrition(foodItem.carbs)} g · Gorduras {roundedNutrition(foodItem.fat)} g</p>}
                      {foodItem.substitutes && foodItem.substitutes.length > 0 && (
                        <div className="text-xs text-muted-foreground ml-3 bg-muted/30 p-1 rounded italic">
                          <span className="font-semibold text-xs uppercase mr-1">Opções:</span>
                      {foodItem.substitutes.map(s => `${s.name || s.food?.name || 'Alimento'} · ${formatQuantityWithUnit(s.quantity ?? 0,s.unit || 'gram',s.measure || s.measure_snapshot)}`).join('; ')}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground italic">Nenhum alimento cadastrado</p>
              )}
        </section>
      ))}
    </div>
  );
};

export default MealPlanView;