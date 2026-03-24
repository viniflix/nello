import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UtensilsCrossed } from 'lucide-react';
import { translateMealType } from '@/utils/mealTranslations';
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
const MealPlanView = ({ mealPlanItems }) => {
  if (!mealPlanItems || mealPlanItems.length === 0) {
    return (
      <div className="text-center py-10">
        <UtensilsCrossed className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">Nenhuma refeição foi adicionada a este plano alimentar.</p>
      </div>
    );
  }

  const mealOrder = ['breakfast', 'cafe_da_manha', 'morning_snack', 'lanche_da_manha', 'lunch', 'almoco', 'afternoon_snack', 'lanche_da_tarde', 'dinner', 'jantar', 'supper', 'ceia'];

  // Agrupar por tipo de refeição
  const mealsByType = mealPlanItems.reduce((acc, meal) => {
    const mealType = meal.meal_type;
    if (!acc[mealType]) {
      acc[mealType] = [];
    }
    acc[mealType].push(meal);
    return acc;
  }, {});

  // Ordenar pelos tipos conhecidos
  const sortedMealTypes = Object.keys(mealsByType).sort(
    (a, b) => mealOrder.indexOf(a) - mealOrder.indexOf(b)
  );

  return (
    <div className="space-y-4">
      {sortedMealTypes.map((mealType) => (
        <div key={mealType} className="border-l-4 border-primary/30 pl-4 py-2">
          <h4 className="font-semibold text-lg mb-3 text-foreground">
            {translateMealType(mealType)}
          </h4>

          {mealsByType[mealType].map((meal) => (
            <div key={meal.id} className="mb-4">
              {meal.name && (
                <p className="text-sm text-muted-foreground mb-2 italic">{meal.name}</p>
              )}

              {meal.meal_plan_foods && meal.meal_plan_foods.length > 0 ? (
                <ul className="space-y-1.5">
                  {meal.meal_plan_foods.map((foodItem, index) => (
                    <li key={index} className="space-y-1">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-foreground">
                          {foodItem.patient_description || foodItem.foods?.name || 'Alimento sem nome'}
                        </span>
                        <span className="font-medium text-primary">
                          {formatQuantityWithUnit(foodItem.quantity || 0, foodItem.unit || '', foodItem.measure)}
                        </span>
                      </div>
                      {foodItem.substitutes && foodItem.substitutes.length > 0 && (
                        <div className="text-[11px] text-muted-foreground ml-3 bg-muted/30 p-1 rounded italic">
                          <span className="font-semibold text-[10px] uppercase mr-1">Opções:</span>
                          {foodItem.substitutes.map(s => s.name).join(', ')}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground italic">Nenhum alimento cadastrado</p>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default MealPlanView;